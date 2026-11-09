export interface DashboardMetric {
  label: string
  value: string
  change: string
  note: string
  icon: 'students' | 'staff' | 'attendance' | 'classes'
  tone: 'mint' | 'blue' | 'gold' | 'rose'
  rising: boolean
}

export interface DashboardData {
  enrollmentData: { month: string; students: number }[]
  activities: { initials: string; name: string; detail: string; time: string; color: string }[]
  upcomingEvents: { day: string; month: string; title: string; detail: string; color: string }[]
  metrics: DashboardMetric[]
}

export const dashboardMockData: DashboardData = {
  enrollmentData: [
    { month: 'Jan', students: 3160 },
    { month: 'Feb', students: 3230 },
    { month: 'Mar', students: 3190 },
    { month: 'Apr', students: 3380 },
    { month: 'May', students: 3450 },
    { month: 'Jun', students: 3510 },
    { month: 'Jul', students: 3480 },
    { month: 'Aug', students: 3640 },
    { month: 'Sep', students: 3720 },
    { month: 'Oct', students: 3800 },
    { month: 'Nov', students: 3890 },
    { month: 'Dec', students: 3982 },
  ],
  activities: [
    { initials: 'AM', name: 'Ava Mitchell', detail: 'Grade 8 · Enrolled in Science', time: '9:42 AM', color: 'mint' },
    { initials: 'JL', name: 'James Liu', detail: 'Grade 5 · Attendance updated', time: '9:18 AM', color: 'blue' },
    { initials: 'SR', name: 'Sofia Reyes', detail: 'Grade 10 · Fee payment received', time: '8:56 AM', color: 'rose' },
    { initials: 'NK', name: 'Noah Kim', detail: 'Grade 7 · Added to Math club', time: '8:31 AM', color: 'gold' },
  ],
  upcomingEvents: [
    { day: '12', month: 'NOV', title: 'Mid-term examinations', detail: 'All grades · 8:30 AM', color: 'coral' },
    { day: '15', month: 'NOV', title: 'Parent-teacher meetings', detail: 'Main hall · 2:00 PM', color: 'blue' },
    { day: '18', month: 'NOV', title: 'Annual science fair', detail: 'School grounds · 10:00 AM', color: 'mint' },
  ],
  metrics: [
    { label: 'Total students', value: '3,982', change: '+8.2%', note: 'vs. last term', icon: 'students', tone: 'mint', rising: true },
    { label: 'Teaching staff', value: '248', change: '+3.1%', note: 'vs. last term', icon: 'staff', tone: 'blue', rising: true },
    { label: 'Attendance today', value: '94.6%', change: '-1.4%', note: 'vs. yesterday', icon: 'attendance', tone: 'gold', rising: false },
    { label: 'Active classes', value: '86', change: '+2', note: 'new this term', icon: 'classes', tone: 'rose', rising: true },
  ],
}