import type { SchoolClass, StudentHold } from '../services/admissionsApi'

const HOLD_DURATION_SECONDS = 600

const initialClasses: SchoolClass[] = [
  { id: 'c_101', name: 'Class 6 - Morning Shift', totalSeats: 120, heldSeats: 15, confirmedSeats: 80, availableSeats: 25 },
  { id: 'c_102', name: 'Class 6 - Day Shift', totalSeats: 90, heldSeats: 8, confirmedSeats: 61, availableSeats: 21 },
  { id: 'c_103', name: 'Class 7 - Morning Shift', totalSeats: 100, heldSeats: 12, confirmedSeats: 70, availableSeats: 18 },
  { id: 'c_104', name: 'Class 8 - Day Shift', totalSeats: 80, heldSeats: 5, confirmedSeats: 75, availableSeats: 0 },
]

interface MockHold extends StudentHold {
  studentId: string
}

interface MockState {
  classes: SchoolClass[]
  holds: MockHold[]
}

export class MockApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'MockApiError'
  }
}

function createInitialState(): MockState {
  return { classes: initialClasses.map((item) => ({ ...item })), holds: [] }
}

let memoryState = createInitialState()

function getState(): MockState {
  return memoryState
}

function saveState(state: MockState) {
  memoryState = state
}

function updateExpiredHolds(state: MockState) {
  let changed = false
  const now = Date.now()

  for (const hold of state.holds) {
    if (hold.status !== 'HELD' || Date.parse(hold.expiresAt) > now) continue
    hold.status = 'EXPIRED'
    const schoolClass = state.classes.find((item) => item.id === hold.classId)
    if (schoolClass) {
      schoolClass.heldSeats = Math.max(0, schoolClass.heldSeats - 1)
      schoolClass.availableSeats = Math.min(schoolClass.totalSeats - schoolClass.confirmedSeats, schoolClass.availableSeats + 1)
    }
    changed = true
  }

  if (changed) saveState(state)
}

function cloneClass(schoolClass: SchoolClass): SchoolClass {
  return { ...schoolClass }
}

function cloneStudentHold(hold: MockHold): StudentHold {
  const { studentId: _studentId, ...studentHold } = hold
  return { ...studentHold }
}

function findHold(state: MockState, holdId: string) {
  const hold = state.holds.find((item) => item.holdId === holdId)
  if (!hold) throw new MockApiError(404, 'Application not found.')
  return hold
}

function ensureStudentOwns(hold: MockHold, studentId: string) {
  if (hold.studentId !== studentId) throw new MockApiError(403, 'This application belongs to another student.')
}

function holdDetails(hold: MockHold) {
  return {
    holdId: hold.holdId,
    classId: hold.classId,
    status: hold.status,
    expiresAt: hold.expiresAt,
  }
}

export const admissionsMockApi = {
  async listClasses() {
    const state = getState()
    updateExpiredHolds(state)
    return state.classes.map(cloneClass)
  },

  async getClass(classId: string) {
    const state = getState()
    updateExpiredHolds(state)
    const schoolClass = state.classes.find((item) => item.id === classId)
    if (!schoolClass) throw new MockApiError(404, 'Class not found.')
    return cloneClass(schoolClass)
  },

  async createClass(name: string, totalSeats: number) {
    if (!name.trim() || !Number.isSafeInteger(totalSeats) || totalSeats < 1) {
      throw new MockApiError(400, 'Enter a class name and a positive whole number of seats.')
    }

    const state = getState()
    updateExpiredHolds(state)
    const schoolClass: SchoolClass = {
      id: `c_${Date.now().toString(36)}`,
      name: name.trim(),
      totalSeats,
      heldSeats: 0,
      confirmedSeats: 0,
      availableSeats: totalSeats,
    }
    state.classes.unshift(schoolClass)
    saveState(state)
    return cloneClass(schoolClass)
  },

  async createHold(classId: string, studentId: string) {
    if (!/^\d{17}$/.test(studentId)) throw new MockApiError(400, 'Student ID must contain exactly 17 digits.')

    const state = getState()
    updateExpiredHolds(state)
    const schoolClass = state.classes.find((item) => item.id === classId)
    if (!schoolClass) throw new MockApiError(404, 'Class not found.')
    const activeHold = state.holds.find((item) => item.studentId === studentId
      && item.classId === classId
      && (item.status === 'HELD' || item.status === 'CONFIRMED'))
    if (activeHold) throw new MockApiError(409, 'This student already has an active application for this class.')
    if (schoolClass.availableSeats < 1) throw new MockApiError(409, 'No seats are available in this class.')

    const hold: MockHold = {
      holdId: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      classId,
      className: schoolClass.name,
      studentId,
      status: 'HELD',
      expiresAt: new Date(Date.now() + HOLD_DURATION_SECONDS * 1000).toISOString(),
    }
    schoolClass.heldSeats += 1
    schoolClass.availableSeats -= 1
    state.holds.unshift(hold)
    saveState(state)
    return holdDetails(hold)
  },

  async getHold(holdId: string) {
    const state = getState()
    updateExpiredHolds(state)
    return holdDetails(findHold(state, holdId))
  },

  async confirmHold(holdId: string, studentId: string) {
    const state = getState()
    updateExpiredHolds(state)
    const hold = findHold(state, holdId)
    ensureStudentOwns(hold, studentId)
    if (hold.status === 'CONFIRMED') return { holdId, status: hold.status }
    if (hold.status === 'EXPIRED') throw new MockApiError(410, 'The application hold has expired.')
    if (hold.status !== 'HELD') throw new MockApiError(409, 'This application cannot be confirmed.')

    const schoolClass = state.classes.find((item) => item.id === hold.classId)
    if (!schoolClass) throw new MockApiError(404, 'Class not found.')
    hold.status = 'CONFIRMED'
    schoolClass.heldSeats = Math.max(0, schoolClass.heldSeats - 1)
    schoolClass.confirmedSeats += 1
    saveState(state)
    return { holdId, status: hold.status }
  },

  async cancelHold(holdId: string, studentId: string) {
    const state = getState()
    updateExpiredHolds(state)
    const hold = findHold(state, holdId)
    ensureStudentOwns(hold, studentId)
    if (hold.status === 'EXPIRED') throw new MockApiError(410, 'The application hold has expired.')
    if (hold.status !== 'HELD') throw new MockApiError(409, 'Only an active held application can be cancelled.')

    const schoolClass = state.classes.find((item) => item.id === hold.classId)
    if (!schoolClass) throw new MockApiError(404, 'Class not found.')
    hold.status = 'CANCELLED'
    schoolClass.heldSeats = Math.max(0, schoolClass.heldSeats - 1)
    schoolClass.availableSeats = Math.min(schoolClass.totalSeats - schoolClass.confirmedSeats, schoolClass.availableSeats + 1)
    saveState(state)
  },

  async listMyHolds(studentId: string) {
    if (!/^\d{17}$/.test(studentId)) throw new MockApiError(400, 'Student ID must contain exactly 17 digits.')
    const state = getState()
    updateExpiredHolds(state)
    return state.holds.filter((hold) => hold.studentId === studentId).map(cloneStudentHold)
  },
}