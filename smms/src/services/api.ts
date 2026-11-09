import axios from 'axios'
import { dashboardMockData, type DashboardData } from '../data/dashboard'

const USE_MOCK_DATA = true

export const api = axios.create({
  // Live API: set USE_MOCK_DATA to false, uncomment the env URL, and comment out the mock baseURL below.
  // baseURL: import.meta.env.VITE_API_URL,
  baseURL: '/api', // Mock service mode
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const dashboardApi = {
  async getOverview(): Promise<DashboardData> {
    if (USE_MOCK_DATA) {
      await new Promise((resolve) => setTimeout(resolve, 180))
      return dashboardMockData
    }

    const response = await api.get<DashboardData>('/dashboard/overview')
    return response.data
  },
}