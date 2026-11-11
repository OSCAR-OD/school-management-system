import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface DashboardState {
  activeSection: string
  studentId: string
}

function getStoredStudentId() {
  if (typeof window === 'undefined') return ''

  try {
    const studentId = window.localStorage.getItem('smms.studentId') ?? ''
    return /^\d{17}$/.test(studentId) ? studentId : ''
  } catch {
    return ''
  }
}

const initialState: DashboardState = {
  activeSection: 'Overview',
  studentId: getStoredStudentId(),
}

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setActiveSection(state, action: PayloadAction<string>) {
      state.activeSection = action.payload
    },
    setStudentId(state, action: PayloadAction<string>) {
      state.studentId = action.payload
    },
  },
})

export const { setActiveSection, setStudentId } = dashboardSlice.actions
export default dashboardSlice.reducer