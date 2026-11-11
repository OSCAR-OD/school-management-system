import { useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  List,
  Menu,
  Plus,
  X,
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from './store/hooks'
import { setActiveSection } from './store/slices/dashboardSlice'
import AdmissionsPage from './components/admissions/AdmissionsPage'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Admissions', icon: ClipboardList },
]

function App() {
  const dispatch = useAppDispatch()
  const activeSection = useAppSelector((state) => state.dashboard.activeSection)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [admissionsDestination, setAdmissionsDestination] = useState<'create' | 'classes' | 'applications'>('classes')

  function openAdmissions(destination: 'create' | 'classes' | 'applications') {
    setAdmissionsDestination(destination)
    dispatch(setActiveSection('Admissions'))
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><GraduationCap size={21} strokeWidth={2.2} /></div>
          <div><span className="brand-name">SMMS</span><span className="brand-caption">SCHOOL MANAGEMENT</span></div>
          <button className="icon-button close-sidebar" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <div className="school-switcher">
          <div className="school-avatar"><GraduationCap size={18} /></div>
          <div className="school-meta"><strong>School management</strong><span>Admissions workspace</span></div>
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
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="term-card"><span className="term-dot" /><div><span>Workspace</span><strong>Admissions</strong></div><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{activeSection}</strong></div>
          <div className="topbar-actions">
            <div className="date-control"><CalendarDays size={16} /><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date())}</span></div>
          </div>
        </header>

        {activeSection === 'Admissions' ? <AdmissionsPage initialSection={admissionsDestination} /> : <div className="content-wrap">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />SCHOOL MANAGEMENT</div>
              <h1>Overview</h1>
              <p>Manage classes and student applications.</p>
            </div>
          </section>

          <section className="overview-admissions-shortcuts" aria-label="Admissions shortcuts">
            <button type="button" className="admissions-shortcut" onClick={() => openAdmissions('create')}>
              <span className="admissions-shortcut-icon shortcut-create"><Plus size={19} /></span>
              <span className="admissions-shortcut-copy"><strong>Class তৈরি করুন</strong><small>নতুন class এবং seat count যোগ করুন</small></span>
              <ChevronRight size={17} />
            </button>
            <button type="button" className="admissions-shortcut" onClick={() => openAdmissions('classes')}>
              <span className="admissions-shortcut-icon shortcut-classes"><List size={19} /></span>
              <span className="admissions-shortcut-copy"><strong>Class তালিকা</strong><small>সব class ও seat availability দেখুন</small></span>
              <ChevronRight size={17} />
            </button>
            <button type="button" className="admissions-shortcut" onClick={() => openAdmissions('applications')}>
              <span className="admissions-shortcut-icon shortcut-applications"><ClipboardList size={19} /></span>
              <span className="admissions-shortcut-copy"><strong>আমার আবেদন</strong><small>এই শিক্ষার্থীর application status দেখুন</small></span>
              <ChevronRight size={17} />
            </button>
          </section>

          <div className="admissions-empty" role="status">
            Dashboard statistics, attendance, activities, and events will appear here when their live API is available.
          </div>
        </div>}
      </main>
    </div>
  )
}

export default App
