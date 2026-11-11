import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface DashboardState {
  activeSection: string
  studentId: string
}

const initialState: DashboardState = {
  activeSection: 'Overview',
  studentId: '',
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