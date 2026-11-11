import axios from 'axios'

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

export interface CreatedClass {
  id: string
  name: string
  totalSeats: number
}

export interface CreatedHold {
  holdId: string
  classId: string
  studentId: string
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
  baseURL: import.meta.env.BACKEND_API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
})

function studentHeaders(studentId: string) {
  return { headers: { 'X-Student-Id': studentId } }
}

function requireArray<T>(data: unknown, resourceName: string): T[] {
  if (!Array.isArray(data)) {
    throw new Error(`The server returned invalid ${resourceName} data.`)
  }
  return data
}

export const admissionsApi = {
  async listClasses() {
    const response = await client.get<unknown>('/classes')
    return requireArray<SchoolClass>(response.data, 'class')
  },

  async getClass(classId: string) {
    const response = await client.get<SchoolClass>(`/classes/${encodeURIComponent(classId)}`)
    return response.data
  },

  async createClass(name: string, totalSeats: number) {
    const response = await client.post<CreatedClass>('/classes', { name, totalSeats })
    return response.data
  },

  async deleteClass(classId: string) {
    await client.delete(`/classes/${encodeURIComponent(classId)}`)
  },

  async createHold(classId: string, studentId: string) {
    const response = await client.post<CreatedHold>(
      `/classes/${encodeURIComponent(classId)}/holds`,
      undefined,
      studentHeaders(studentId),
    )
    return response.data
  },

  async getHold(holdId: string) {
    const response = await client.get<HoldDetails>(`/holds/${encodeURIComponent(holdId)}`)
    return response.data
  },

  async confirmHold(holdId: string, studentId: string) {
    const response = await client.post<{ holdId: string; status: HoldStatus }>(
      `/holds/${encodeURIComponent(holdId)}/confirm`,
      undefined,
      studentHeaders(studentId),
    )
    return response.data
  },

  async cancelHold(holdId: string, studentId: string) {
    await client.delete(`/holds/${encodeURIComponent(holdId)}`, studentHeaders(studentId))
  },

  async listMyHolds(studentId: string) {
    const response = await client.get<unknown>('/me/holds', studentHeaders(studentId))
    return requireArray<StudentHold>(response.data, 'application')
  },
}

export function getAdmissionsErrorMessage(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const responseBody: unknown = axios.isAxiosError(error) ? error.response?.data : undefined
  const responseMessage =
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'error' in responseBody &&
    typeof responseBody.error === 'string'
      ? responseBody.error
      : undefined
  if (!status) {
    return axios.isAxiosError(error)
      ? 'Cannot connect to the server. Check that the backend is running, then try again.'
      : 'The request could not be completed. Please try again.'
  }
  if (status === 409) {
    return responseMessage ?? 'No seats are available, or this student already has an active application for this class.'
  }
  if (status === 410) {
    return 'This application has expired. The seat is no longer being held.'
  }
  if (status === 403) {
    return 'This application belongs to a different student. Check the student ID and try again.'
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

  if (!Array.isArray(classes) || !Array.isArray(holds)) {
    throw new Error('The server returned invalid admissions data.')
  }

  return { classes, holds }
}