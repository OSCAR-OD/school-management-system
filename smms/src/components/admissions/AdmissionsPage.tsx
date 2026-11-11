import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDownUp, ArrowLeft, Check, Clock3, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react'
import {
  admissionsApi,
  fetchAdmissionsData,
  getAdmissionsErrorMessage,
  type SchoolClass,
  type StudentHold,
} from '../../services/admissionsApi'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setStudentId as saveStudentId } from '../../store/slices/dashboardSlice'
import './admissions.css'

const STUDENT_ID_PATTERN = /^\d{17}$/

type Toast = { type: 'success' | 'error'; message: string }
type AdmissionsDestination = 'create' | 'classes' | 'applications'

function remainingSeconds(expiresAt: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000))
}

function formatRemaining(seconds: number) {
  if (seconds <= 0) return 'Expired'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes} min ${remainder} sec remaining`
}

function displayStatus(hold: StudentHold, now: number) {
  if (hold.status === 'HELD' && remainingSeconds(hold.expiresAt, now) === 0) return 'EXPIRED'
  return hold.status
}

function persistStudentId(studentId: string) {
  try {
    window.localStorage.setItem('smms.studentId', studentId)
  } catch {
    return
  }
}

function AdmissionsPage({ initialSection = 'classes' }: { initialSection?: AdmissionsDestination }) {
  const dispatch = useAppDispatch()
  const studentId = useAppSelector((state) => state.dashboard.studentId)
  const [studentIdInput, setStudentIdInput] = useState(studentId)
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [holds, setHolds] = useState<StudentHold[]>([])
  const [className, setClassName] = useState('')
  const [totalSeats, setTotalSeats] = useState('')
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null)
  const [classDetails, setClassDetails] = useState<Record<string, SchoolClass>>({})
  const [applyClass, setApplyClass] = useState<SchoolClass | null>(null)
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null)
  const [screen, setScreen] = useState<'classes' | 'apply' | 'applications'>(initialSection === 'applications' ? 'applications' : 'classes')
  const [toast, setToast] = useState<Toast | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (initialSection === 'applications') return
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(`admissions-${initialSection}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [initialSection])

  function showToast(type: Toast['type'], message: string) {
    setToast({ type, message })
  }

  useEffect(() => {
    if (!toast) return
    const timeoutId = window.setTimeout(() => setToast(null), 2000)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  useEffect(() => {
    let active = true
    let hasReportedError = false

    const refresh = async (showError: boolean) => {
      try {
        const data = await fetchAdmissionsData(studentId)
        if (!active) return
        setClasses(data.classes)
        setHolds(data.holds)
        setLoadFailed(false)
        hasReportedError = false
      } catch (error) {
        if (active && (showError || !hasReportedError)) {
          showToast('error', getAdmissionsErrorMessage(error))
          if (showError) setLoadFailed(true)
          hasReportedError = true
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void refresh(true)
    const pollId = window.setInterval(() => void refresh(false), 3000)
    const clockId = window.setInterval(() => setNow(Date.now()), 1000)

    return () => {
      active = false
      window.clearInterval(pollId)
      window.clearInterval(clockId)
    }
  }, [studentId])

  async function reloadData(id = studentId) {
    const data = await fetchAdmissionsData(id)
    setClasses(data.classes)
    setHolds(data.holds)
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const seats = Number(totalSeats)
    if (!className.trim()) {
      showToast('error', 'Enter a class name. Include the shift in the name, for example “Class 6 - Morning Shift.”')
      return
    }
    if (!Number.isSafeInteger(seats) || seats < 1) {
      showToast('error', 'Seat count must be a whole number greater than zero.')
      return
    }

    setWorking('create-class')
    setToast(null)
    try {
      await admissionsApi.createClass(className.trim(), seats)
      setClassName('')
      setTotalSeats('')
      await reloadData()
      showToast('success', 'Class created.')
    } catch (error) {
      showToast('error', getAdmissionsErrorMessage(error))
    } finally {
      setWorking(null)
    }
  }

  async function deleteClass(schoolClass: SchoolClass) {
    const confirmed = window.confirm(
      `Delete "${schoolClass.name}"? Class history will be retained. Classes with held or confirmed applications cannot be deleted.`,
    )
    if (!confirmed) return

    setWorking(`delete-class:${schoolClass.id}`)
    setToast(null)
    try {
      await admissionsApi.deleteClass(schoolClass.id)
      setClassDetails((current) => {
        const next = { ...current }
        delete next[schoolClass.id]
        return next
      })
      if (expandedClassId === schoolClass.id) setExpandedClassId(null)
      await reloadData()
      showToast('success', 'Class deleted.')
    } catch (error) {
      showToast('error', getAdmissionsErrorMessage(error))
    } finally {
      setWorking(null)
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!applyClass) return

    const normalizedId = studentIdInput.trim()
    if (!STUDENT_ID_PATTERN.test(normalizedId)) {
      showToast('error', 'The birth registration number must contain exactly 17 digits.')
      return
    }
    if (applyClass.availableSeats < 1) {
      showToast('error', 'There are no seats available in this class.')
      return
    }

    setWorking(applyClass.id)
    setToast(null)
    dispatch(saveStudentId(normalizedId))
    persistStudentId(normalizedId)
    try {
      const createdHold = await admissionsApi.createHold(applyClass.id, normalizedId)
      await reloadData(normalizedId)
      setActiveHoldId(createdHold.holdId)
      showToast('success', `A seat in ${applyClass.name} is being held for you.`)
    } catch (error) {
      showToast('error', getAdmissionsErrorMessage(error))
    } finally {
      setWorking(null)
    }
  }

  async function toggleClassDetails(classId: string) {
    if (expandedClassId === classId) {
      setExpandedClassId(null)
      return
    }

    setWorking(`class:${classId}`)
    setToast(null)
    try {
      const details = await admissionsApi.getClass(classId)
      setClassDetails((current) => ({ ...current, [classId]: details }))
      setExpandedClassId(classId)
    } catch (error) {
      showToast('error', getAdmissionsErrorMessage(error))
    } finally {
      setWorking(null)
    }
  }

  async function refreshHold(hold: StudentHold) {
    setWorking(`hold:${hold.holdId}`)
    setToast(null)
    try {
      const details = await admissionsApi.getHold(hold.holdId)
      setHolds((current) => current.map((item) => item.holdId === hold.holdId ? { ...item, ...details } : item))
    } catch (error) {
      showToast('error', getAdmissionsErrorMessage(error))
    } finally {
      setWorking(null)
    }
  }

  async function confirmHold(hold: StudentHold) {
    if (!STUDENT_ID_PATTERN.test(studentId)) {
      showToast('error', 'Enter the student’s 17-digit ID before confirming this application.')
      return
    }
    setWorking(`hold:${hold.holdId}`)
    setToast(null)
    try {
      await admissionsApi.confirmHold(hold.holdId, studentId)
      await reloadData()
      showToast('success', 'Payment succeeded and the seat is confirmed.')
    } catch (error) {
      showToast('error', getAdmissionsErrorMessage(error))
      await reloadData().catch(() => undefined)
    } finally {
      setWorking(null)
    }
  }

  async function cancelHold(hold: StudentHold) {
    if (!STUDENT_ID_PATTERN.test(studentId)) {
      showToast('error', 'Enter the student’s 17-digit ID before cancelling this application.')
      return
    }
    setWorking(`hold:${hold.holdId}`)
    setToast(null)
    try {
      await admissionsApi.cancelHold(hold.holdId, studentId)
      await reloadData()
      showToast('success', 'Application cancelled.')
    } catch (error) {
      showToast('error', getAdmissionsErrorMessage(error))
      await reloadData().catch(() => undefined)
    } finally {
      setWorking(null)
    }
  }

  const activeHold = holds.find((hold) => hold.holdId === activeHoldId)
  const activeHoldStatus = activeHold ? displayStatus(activeHold, now) : null
  const activeHoldRemaining = activeHold ? remainingSeconds(activeHold.expiresAt, now) : 0
  const selectedClass = applyClass
    ? classDetails[applyClass.id] ?? classes.find((schoolClass) => schoolClass.id === applyClass.id) ?? applyClass
    : null

  return (
    <div className="content-wrap admissions-content">
      <section className="page-heading admissions-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />STUDENT ADMISSIONS</div>
          <h1>{screen === 'apply' ? 'আবেদন করুন' : screen === 'applications' ? 'আমার আবেদন' : 'Class applications'}</h1>
          <p>{screen === 'apply' ? 'Complete the student identity details for this class application.' : screen === 'applications' ? 'এই শিক্ষার্থীর সব আবেদনের অবস্থা এখানে দেখুন।' : 'Choose a class, check seat availability, and confirm enrollment.'}</p>
        </div>
        <div className="admissions-live"><span />Seats refresh every 3 seconds</div>
      </section>

      {toast && <div className={`admissions-toast admissions-toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live={toast.type === 'error' ? 'assertive' : 'polite'}>{toast.type === 'success' ? <Check size={20} /> : <X size={20} />}<span>{toast.message}</span></div>}

      {screen === 'apply' && applyClass && selectedClass ? <section className="admissions-section application-screen">
        <nav className="application-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="admission-button admission-button-secondary" onClick={() => { setScreen('classes'); setApplyClass(null); setActiveHoldId(null) }}><ArrowLeft size={17} />Class applications</button>
          <span aria-hidden="true">/</span>
          <strong>আবেদন করুন</strong>
        </nav>
         <div className="panel application-form-panel">
          <div className="admissions-section-title"><div><h2>Student identity</h2><p>Applying for {selectedClass.name}. Enter the 17-digit birth registration number.</p></div></div>
          <form className="identity-form" onSubmit={submitApplication}>
            <label htmlFor="student-id">Birth registration number</label>
            <div className="identity-controls">
              <input id="student-id" inputMode="numeric" autoComplete="off" maxLength={17} value={studentIdInput} onChange={(event) => setStudentIdInput(event.target.value.replace(/\D/g, '').slice(0, 17))} placeholder="Enter 17 digits" aria-describedby="student-id-help" />
              <button type="submit" className="admission-button admission-button-primary" disabled={working === applyClass.id}><Check size={18} />Save &amp; Apply</button>
            </div>
            <span id="student-id-help" className="field-help">Your identity is kept only for this app session.</span>
          </form>
        </div>
        {activeHold && activeHoldStatus && <article className="panel application-card application-screen-status">
          <div className="application-main"><div><span className="application-class-name">{activeHold.className}</span><span className="application-id">Application ID: {activeHold.holdId}</span></div><span className={`status-badge status-${activeHoldStatus.toLowerCase()}`}>{activeHoldStatus}</span></div>
          <div className="application-meta"><span><Clock3 size={17} />{activeHoldStatus === 'HELD' ? formatRemaining(activeHoldRemaining) : activeHoldStatus === 'EXPIRED' ? 'Application expired' : activeHoldStatus === 'CONFIRMED' ? 'Enrollment confirmed' : 'Application cancelled'}</span><span>Expires: {new Date(activeHold.expiresAt).toLocaleString('en-US')}</span></div>
          <div className="application-actions">
            {activeHoldStatus === 'HELD' && <button className="admission-button admission-button-primary" onClick={() => void confirmHold(activeHold)} disabled={activeHoldRemaining === 0 || working === `hold:${activeHold.holdId}`}><Check size={18} />ভর্তি ফি দিন</button>}
            {activeHoldStatus === 'HELD' && <button className="admission-button admission-button-danger" onClick={() => void cancelHold(activeHold)} disabled={working === `hold:${activeHold.holdId}`}><X size={18} />বাতিল</button>}
          </div>
        </article>}
        <article className="panel class-card application-class-summary">
          <div className="class-card-heading"><div><h3>{selectedClass.name}</h3><span>Class ID: {selectedClass.id}</span></div></div>
          <div className="seat-stats">
            <div><span>Total seats</span><strong>{selectedClass.totalSeats}</strong></div>
            <div><span>On hold</span><strong>{selectedClass.heldSeats}</strong></div>
            <div><span>Confirmed</span><strong>{selectedClass.confirmedSeats}</strong></div>
            <div className={selectedClass.availableSeats === 0 ? 'seat-stat-full' : 'seat-stat-available'}><span>Available</span><strong>{selectedClass.availableSeats}</strong></div>
          </div>
          <div className="class-detail-note">Latest seat count: {selectedClass.heldSeats} on hold, {selectedClass.confirmedSeats} confirmed, and {selectedClass.availableSeats} available.</div>
          <div className="class-card-footer"><span><Users size={17} />{selectedClass.availableSeats > 0 ? `${selectedClass.availableSeats} seats available` : 'No seats available'}</span></div>
        </article>
      </section> : screen === 'classes' ? <>

      <section id="admissions-create" className="panel create-class-panel">
        <div className="admissions-section-title"><div><h2>Create a class</h2><p>Create a separate class and seat count for each shift.</p></div></div>
        <form className="create-class-form" onSubmit={createClass}>
          <label className="admission-field"><span>Class name</span><input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="e.g. Class 6 - Morning Shift" maxLength={100} /></label>
          <label className="admission-field seats-field"><span>Total seats</span><input type="number" min="1" step="1" value={totalSeats} onChange={(event) => setTotalSeats(event.target.value)} placeholder="120" /></label>
          <button type="submit" className="admission-button admission-button-primary" disabled={working === 'create-class'}><Plus size={18} />Create class</button>
        </form>
      </section>

      <section id="admissions-classes" className="admissions-section">
        <div className="admissions-section-title admissions-list-heading"><div><h2>Classes</h2><p>{classes.length} {classes.length === 1 ? 'class' : 'classes'}</p></div><div className="admissions-list-actions"><button className="admission-button admission-button-secondary" onClick={() => setScreen('applications')}><Users size={17} />আমার আবেদন</button><button className="admission-button admission-button-secondary" onClick={() => void reloadData().catch((error) => showToast('error', getAdmissionsErrorMessage(error)))}><RefreshCw size={17} />Refresh</button></div></div>
        {loading && <div className="admissions-empty">Loading classes...</div>}
        {!loading && classes.length === 0 && !loadFailed && <div className="admissions-empty">No classes yet. Create the first class using the form above.</div>}
        <div className="class-list">
          {classes.map((schoolClass) => {
            const details = classDetails[schoolClass.id]
            const currentClass = details ?? schoolClass
            const isExpanded = expandedClassId === schoolClass.id

            return (
              <article className="panel class-card" key={schoolClass.id}>
                <div className="class-card-heading"><div><h3>{schoolClass.name}</h3><span>Class ID: {schoolClass.id}</span></div><div className="class-card-actions"><button type="button" className="admission-button admission-button-secondary" onClick={() => void toggleClassDetails(schoolClass.id)} disabled={working === `class:${schoolClass.id}`}><ArrowDownUp size={17} />{isExpanded ? 'Hide details' : 'Seat details'}</button><button type="button" className="admission-button admission-button-danger" onClick={() => void deleteClass(schoolClass)} disabled={working === `delete-class:${schoolClass.id}`}><Trash2 size={17} />Delete class</button></div></div>
                <div className="seat-stats">
                  <div><span>Total seats</span><strong>{schoolClass.totalSeats}</strong></div>
                  <div><span>On hold</span><strong>{schoolClass.heldSeats}</strong></div>
                  <div><span>Confirmed</span><strong>{schoolClass.confirmedSeats}</strong></div>
                  <div className={schoolClass.availableSeats === 0 ? 'seat-stat-full' : 'seat-stat-available'}><span>Available</span><strong>{schoolClass.availableSeats}</strong></div>
                </div>
                {isExpanded && <div className="class-detail-note">Latest seat count: {currentClass.heldSeats} on hold, {currentClass.confirmedSeats} confirmed, and {currentClass.availableSeats} available.</div>}
                <div className="class-card-footer"><span><Users size={17} />{schoolClass.availableSeats > 0 ? `${schoolClass.availableSeats} seats available` : 'No seats available'}</span><button className="admission-button admission-button-primary" onClick={() => { setStudentIdInput(studentId); setActiveHoldId(null); setApplyClass(schoolClass); setScreen('apply') }} disabled={schoolClass.availableSeats < 1 || working === schoolClass.id}><Plus size={18} />আবেদন করুন</button></div>
              </article>
            )
          })}
        </div>
      </section>

      </> : null}

      {screen === 'applications' && <section className="admissions-section my-applications-section">
        <nav className="application-breadcrumb" aria-label="Breadcrumb">
          <button type="button" className="admission-button admission-button-secondary" onClick={() => setScreen('classes')}><ArrowLeft size={17} />Class applications</button>
          <span aria-hidden="true">/</span>
          <strong>আমার আবেদন</strong>
        </nav>
        <div className="admissions-section-title"><div><h2>My applications</h2><p>{STUDENT_ID_PATTERN.test(studentId) ? `${holds.length} applications for this student` : 'Apply to a class to view applications'}</p></div><span className="poll-indicator"><Clock3 size={17} />Updates automatically</span></div>
        {!STUDENT_ID_PATTERN.test(studentId) && <div className="admissions-empty">এই শিক্ষার্থীর আবেদন দেখতে ১৭ সংখ্যার জন্ম নিবন্ধন নম্বর দিয়ে একটি আবেদন করুন।</div>}
        {STUDENT_ID_PATTERN.test(studentId) && !loading && holds.length === 0 && <div className="admissions-empty">এই শিক্ষার্থীর কোনো আবেদন নেই। একটি শ্রেণি বেছে আবেদন করুন।</div>}
        <div className="application-list">
          {holds.map((hold) => {
            const status = displayStatus(hold, now)
            const remaining = remainingSeconds(hold.expiresAt, now)
            const isWorking = working === `hold:${hold.holdId}`

            return (
              <article className="panel application-card" key={hold.holdId}>
                <div className="application-main"><div><span className="application-class-name">{hold.className}</span><span className="application-id">Application ID: {hold.holdId}</span></div><span className={`status-badge status-${status.toLowerCase()}`}>{status}</span></div>
                <div className="application-meta"><span><Clock3 size={17} />{status === 'HELD' ? formatRemaining(remaining) : status === 'EXPIRED' ? 'Application expired' : status === 'CONFIRMED' ? 'Enrollment confirmed' : status === 'CANCELLED' ? 'Application cancelled' : 'Status updated'}</span><span>Expires: {new Date(hold.expiresAt).toLocaleString('en-US')}</span></div>
                <div className="application-actions">
                  <button className="admission-button admission-button-secondary" onClick={() => void refreshHold(hold)} disabled={isWorking}><RefreshCw size={17} />Refresh status</button>
                  {status === 'HELD' && <button className="admission-button admission-button-primary" onClick={() => void confirmHold(hold)} disabled={remaining === 0 || isWorking}><Check size={18} />ভর্তি ফি দিন</button>}
                  {status === 'HELD' && <button className="admission-button admission-button-danger" onClick={() => void cancelHold(hold)} disabled={isWorking}><X size={18} />বাতিল</button>}
                </div>
              </article>
            )
          })}
        </div>
        <p className="payment-note">Selecting “Pay enrollment fee” simulates a successful payment and sends the confirmation request. No payment gateway is used.</p>
      </section>}
    </div>
  )
}

export default AdmissionsPage