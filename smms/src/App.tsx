import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  Settings2,
  Users,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { useAppDispatch, useAppSelector } from './store/hooks'
import { setActiveSection } from './store/slices/dashboardSlice'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
import { dashboardApi } from './services/api'
import type { DashboardData } from './data/dashboard'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Students', icon: Users },
  { label: 'Academics', icon: BookOpen },
  { label: 'Attendance', icon: ClipboardCheck },
  { label: 'Calendar', icon: CalendarDays },
]

function App() {
  const dispatch = useAppDispatch()
  const activeSection = useAppSelector((state) => state.dashboard.activeSection)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [dashboardLoadError, setDashboardLoadError] = useState(false)

  useEffect(() => {
    let active = true

    dashboardApi.getOverview()
      .then((data) => {
        if (active) setDashboardData(data)
      })
      .catch(() => {
        if (active) setDashboardLoadError(true)
      })

    return () => {
      active = false
    }
  }, [])

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visibleActivities = (dashboardData?.activities ?? []).filter((activity) =>
    `${activity.name} ${activity.detail}`.toLowerCase().includes(normalizedSearch),
  )
  const visibleEvents = (dashboardData?.upcomingEvents ?? []).filter((event) =>
    `${event.title} ${event.detail}`.toLowerCase().includes(normalizedSearch),
  )

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><GraduationCap size={21} strokeWidth={2.2} /></div>
          <div><span className="brand-name">northfield</span><span className="brand-caption">SCHOOL MANAGEMENT</span></div>
          <button className="icon-button close-sidebar" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <div className="school-switcher">
          <div className="school-avatar">N</div>
          <div className="school-meta"><strong>Northfield Academy</strong><span>Springfield, IL</span></div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item ${activeSection === label ? 'nav-item-active' : ''}`}
              key={label}
              onClick={() => { dispatch(setActiveSection(label)); setSidebarOpen(false) }}
            >
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === 'Attendance' && <span className="nav-count">3</span>}
            </button>
          ))}
        </nav>

        <div className="nav-label management-label">MANAGEMENT</div>
        <nav className="primary-nav" aria-label="Management navigation">
          <button className="nav-item" onClick={() => dispatch(setActiveSection('Reports'))}><Activity size={18} strokeWidth={1.8} /><span>Reports</span></button>
          <button className="nav-item" onClick={() => dispatch(setActiveSection('Settings'))}><Settings2 size={18} strokeWidth={1.8} /><span>Settings</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="term-card"><span className="term-dot" /><div><span>Current term</span><strong>Fall semester 2026</strong></div><ChevronDown size={15} /></div>
          <button className="help-link"><CircleHelp size={17} /><span>Help & support</span><ArrowUpRight size={14} /></button>
          <div className="profile-row">
            <div className="profile-avatar">EC</div>
            <div className="profile-meta"><strong>Emily Carter</strong><span>School administrator</span></div>
            <MoreHorizontal size={19} className="muted-icon" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activeSection}</strong></div>
          <div className="topbar-actions">
            {searchOpen ? (
              <label className="search-control search-control-open search-input-control">
                <Search size={17} />
                <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search activities and events" />
                <button type="button" className="search-close" aria-label="Close search" onClick={() => { setSearchOpen(false); setSearchQuery('') }}><X size={15} /></button>
              </label>
            ) : (
              <button className="search-control" onClick={() => setSearchOpen(true)} aria-label="Search">
                <Search size={17} /><span>Search anything</span><kbd>Ctrl K</kbd>
              </button>
            )}
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="topbar-divider" />
            <button className="date-control"><CalendarDays size={16} /><span>Nov 9, 2026</span><ChevronDown size={14} /></button>
          </div>
        </header>

        <div className="content-wrap">
          {!dashboardData && <p role="status">{dashboardLoadError ? 'Could not load school overview.' : 'Loading school overview...'}</p>}
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />MONDAY, NOVEMBER 9, 2026</div>
              <h1>Good morning, Emily <span className="greeting-spark">✳</span></h1>
              <p>Here’s what’s happening across your school today.</p>
            </div>
            <Button className="report-button" size="sm"><Activity size={16} />View reports</Button>
          </section>

          <section className="metrics-grid" aria-label="School statistics">
            {dashboardData?.metrics.map(({ label, value, change, note, icon, tone, rising }) => {
              const Icon = {
                students: Users,
                staff: GraduationCap,
                attendance: ClipboardCheck,
                classes: BookOpen,
              }[icon]

              return (
              <article key={label}>
                <Card className="metric-card">
                  <div className="metric-top"><span>{label}</span><span className={`metric-icon metric-icon-${tone}`}><Icon size={17} strokeWidth={1.9} /></span></div>
                  <div className="metric-value">{value}</div>
                  <div className="metric-foot"><span className={`metric-change ${rising ? '' : 'metric-change-down'}`}>{rising ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span>{note}</span></div>
                </Card>
              </article>
              )
            })}
          </section>

          <section className="overview-grid">
            <article className="panel enrollment-panel">
              <div className="panel-heading">
                <div><h2>Student enrollment</h2><p>Enrollment growth throughout the year</p></div>
                <button className="period-select">This year <ChevronDown size={14} /></button>
              </div>
              <div className="chart-summary"><strong>3,982</strong><span className="chart-growth"><ArrowUpRight size={14} /> 8.2%</span><span className="chart-comparison">vs. previous year</span></div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboardData?.enrollmentData ?? []} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <defs><linearGradient id="enrollmentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3a8b72" stopOpacity={0.19} /><stop offset="95%" stopColor="#3a8b72" stopOpacity={0.01} /></linearGradient></defs>
                    <CartesianGrid vertical={false} stroke="#edf0ed" strokeDasharray="3 5" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#929a94', fontSize: 11 }} dy={10} />
                    <Tooltip contentStyle={{ border: '1px solid #e8ece8', borderRadius: 8, fontSize: 12, boxShadow: '0 8px 24px rgba(24,44,34,.08)' }} />
                    <Area type="monotone" dataKey="students" stroke="#3a8b72" strokeWidth={2.5} fill="url(#enrollmentFill)" activeDot={{ r: 5, fill: '#3a8b72', stroke: '#fff', strokeWidth: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-legend"><span className="legend-dot" />Student enrollment</div>
            </article>

            <article className="panel attendance-panel">
              <div className="panel-heading"><div><h2>Today’s attendance</h2><p>Monday, November 9</p></div><button className="icon-button panel-more" aria-label="Attendance options"><MoreHorizontal size={19} /></button></div>
              <div className="attendance-ring-wrap">
                <div className="attendance-ring"><div><strong>94.6<span>%</span></strong><small>Present</small></div></div>
              </div>
              <div className="attendance-breakdown">
                <div><span className="attendance-key"><i className="present-dot" />Present</span><strong>3,767</strong></div>
                <div><span className="attendance-key"><i className="absent-dot" />Absent</span><strong>215</strong></div>
              </div>
              <button className="text-action" onClick={() => dispatch(setActiveSection('Attendance'))}>View attendance <ArrowUpRight size={14} /></button>
            </article>
          </section>

          <section className="lower-grid">
            <article className="panel activity-panel">
              <div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates from your school</p></div><button className="text-action compact-action">See all <ArrowUpRight size={14} /></button></div>
              <div className="activity-list">
                {visibleActivities.map((activity) => (
                  <div className="activity-row" key={activity.name}>
                    <div className={`activity-avatar avatar-${activity.color}`}>{activity.initials}</div>
                    <div className="activity-copy"><strong>{activity.name}</strong><span>{activity.detail}</span></div>
                    <time>{activity.time}</time>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel events-panel">
              <div className="panel-heading"><div><h2>Upcoming events</h2><p>Mark your calendar</p></div><button className="icon-button panel-more" aria-label="Event options"><MoreHorizontal size={19} /></button></div>
              <div className="event-list">
                {visibleEvents.map((event) => (
                  <div className="event-row" key={event.title}>
                    <div className={`event-date event-${event.color}`}><strong>{event.day}</strong><span>{event.month}</span></div>
                    <div className="event-copy"><strong>{event.title}</strong><span>{event.detail}</span></div>
                    <ChevronRight size={16} className="event-chevron" />
                  </div>
                ))}
              </div>
              <button className="text-action event-action" onClick={() => dispatch(setActiveSection('Calendar'))}>Open calendar <ArrowUpRight size={14} /></button>
            </article>
          </section>
          <footer className="page-footer"><span>© 2026 Northfield Academy</span><span>All systems operational <i /></span></footer>
        </div>
      </main>
    </div>
  )
}

export default App
