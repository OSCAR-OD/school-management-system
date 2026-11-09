import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface DashboardState {
  activeSection: string
}

const initialState: DashboardState = {
  activeSection: 'Overview',
}

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setActiveSection(state, action: PayloadAction<string>) {
      state.activeSection = action.payload
    },
  },
})

export const { setActiveSection } = dashboardSlice.actions
export default dashboardSlice.reducer