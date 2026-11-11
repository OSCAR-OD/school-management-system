import axios from 'axios'
import { admissionsMockApi, MockApiError } from '../data/admissionsMock'

export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'

export interface SchoolClass {
  id: string
  name: string
  totalSeats: number
  heldSeats: number
  confirmedSeats: number
  availableSeats: number
}

export interface StudentHold {
  holdId: string
  classId: string
  className: string
  status: HoldStatus
  expiresAt: string
}

interface HoldDetails {
  holdId: string
  classId: string
  status: HoldStatus
  expiresAt: string
}

const client = axios.create({
  baseURL: 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
})

export const USE_MOCK_DATA = true

function studentHeaders(studentId: string) {
  return { headers: { 'X-Student-Id': studentId } }
}

export const admissionsApi = {
  async listClasses() {
    if (USE_MOCK_DATA) return admissionsMockApi.listClasses()
    const response = await client.get<SchoolClass[]>('/classes')
    return response.data
  },

  async getClass(classId: string) {
    if (USE_MOCK_DATA) return admissionsMockApi.getClass(classId)
    const response = await client.get<SchoolClass>(`/classes/${encodeURIComponent(classId)}`)
    return response.data
  },

  async createClass(name: string, totalSeats: number) {
    if (USE_MOCK_DATA) return admissionsMockApi.createClass(name, totalSeats)
    const response = await client.post<SchoolClass>('/classes', { name, totalSeats })
    return response.data
  },

  async createHold(classId: string, studentId: string) {
    if (USE_MOCK_DATA) return admissionsMockApi.createHold(classId, studentId)
    const response = await client.post<HoldDetails>(
      `/classes/${encodeURIComponent(classId)}/holds`,
      undefined,
      studentHeaders(studentId),
    )
    return response.data
  },

  async getHold(holdId: string) {
    if (USE_MOCK_DATA) return admissionsMockApi.getHold(holdId)
    const response = await client.get<HoldDetails>(`/holds/${encodeURIComponent(holdId)}`)
    return response.data
  },

  async confirmHold(holdId: string, studentId: string) {
    if (USE_MOCK_DATA) return admissionsMockApi.confirmHold(holdId, studentId)
    const response = await client.post<{ holdId: string; status: HoldStatus }>(
      `/holds/${encodeURIComponent(holdId)}/confirm`,
      undefined,
      studentHeaders(studentId),
    )
    return response.data
  },

  async cancelHold(holdId: string, studentId: string) {
    if (USE_MOCK_DATA) return admissionsMockApi.cancelHold(holdId, studentId)
    await client.delete(`/holds/${encodeURIComponent(holdId)}`, studentHeaders(studentId))
  },

  async listMyHolds(studentId: string) {
    if (USE_MOCK_DATA) return admissionsMockApi.listMyHolds(studentId)
    const response = await client.get<StudentHold[]>('/me/holds', studentHeaders(studentId))
    return response.data
  },
}

export function getAdmissionsErrorMessage(error: unknown) {
  const status = axios.isAxiosError(error)
    ? error.response?.status
    : error instanceof MockApiError
      ? error.status
      : undefined
  if (!status) {
    return axios.isAxiosError(error)
      ? 'Cannot connect to the server. Check that the backend is running, then try again.'
      : 'The request could not be completed. Please try again.'
  }
  if (status === 409) {
    return 'No seats are available, or this student already has an active application for this class.'
  }
  if (status === 410) {
    return 'This application has expired. The seat is no longer being held.'
  }
  if (status === 400 || status === 422) {
    return 'Check the information and try again.'
  }
  if (status === 404) {
    return 'The class or application could not be found. Refresh the list and try again.'
  }
  if (status >= 500) {
    return 'The server encountered a problem. Please try again in a moment.'
  }

  return 'The request could not be completed. Please try again.'
}

export async function fetchAdmissionsData(studentId: string) {
  const classes = await admissionsApi.listClasses()
  const holds = /^\d{17}$/.test(studentId)
    ? await admissionsApi.listMyHolds(studentId)
    : []

  return { classes, holds }
}