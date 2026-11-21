import { useState, useEffect } from 'react'
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MapPin,
  Building2,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  FileText,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
  Calendar,
  ExternalLink
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getApiUrl } from '../config/api'

export default function TrackComplaint({
  initialTrackingId = '',
  setCurrentView,
  onOpenAuth
}) {
  const { user, getAuthHeaders } = useAuth()
  const [searchQuery, setSearchQuery] = useState(initialTrackingId)
  const [issue, setIssue] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  // Citizen personal complaints list
  const [myComplaints, setMyComplaints] = useState([])
  const [myLoading, setMyLoading] = useState(false)
  const [myError, setMyError] = useState(null)

  // Fetch complaints belonging to current authenticated citizen
  const fetchMyComplaints = async () => {
    if (!user) return
    setMyLoading(true)
    setMyError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(getApiUrl('/api/issues/my'), { headers })
      if (res.ok) {
        const data = await res.json()
        setMyComplaints(data.issues || [])
      } else {
        const errData = await res.json().catch(() => ({}))
        setMyError(errData.detail || 'Unable to retrieve your complaints.')
      }
    } catch (err) {
      console.error('Failed to load citizen complaints:', err)
      setMyError('Unable to connect to service to fetch your complaints.')
    } finally {
      setMyLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchMyComplaints()
    }
  }, [user])

  const handleSearch = async (targetId = null, e = null) => {
    if (e) e.preventDefault()
    const query = (targetId || searchQuery || '').trim()
    if (!query) return

    setLoading(true)
    setError(null)
    setIssue(null)

    try {
      const headers = await getAuthHeaders()
      const res = await fetch(getApiUrl(`/api/issues/${encodeURIComponent(query)}`), { headers })
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            `No complaint found with tracking number "${query}", or access is restricted. You can only view complaints submitted from your own account.`
          )
        }
        if (res.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }
        throw new Error(`Failed to fetch complaint details (HTTP ${res.status}).`)
      }
      const data = await res.json()
      setIssue(data)
      setSearchQuery(data.tracking_id || query)
      window.scrollTo({ top: 180, behavior: 'smooth' })
    } catch (err) {
      console.error('Track error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialTrackingId && user) {
      setSearchQuery(initialTrackingId)
      handleSearch(initialTrackingId)
    }
  }, [initialTrackingId, user])

  const handleCopyId = () => {
    if (issue?.tracking_id) {
      navigator.clipboard.writeText(issue.tracking_id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  // Lifecycle steps: Reported -> In Progress -> Resolved
  const getStepStatus = (stepName) => {
    if (!issue) return 'pending'
    const status = issue.status
    if (status === 'Resolved') return 'completed'
    if (status === 'In Progress') {
      if (stepName === 'Reported') return 'completed'
      if (stepName === 'In Progress') return 'active'
      return 'pending'
    }
    // 'Reported'
    if (stepName === 'Reported') return 'active'
    return 'pending'
  }

  // If citizen is not signed in, show privacy & authentication notice
  if (!user) {
    return (
      <div className="track-container">
        <div className="auth-required-container">
          <div className="auth-required-card">
            <div className="auth-req-icon">
              <ShieldAlert size={36} />
            </div>
            <span className="auth-req-badge">SECURE ACCESS REQUIRED</span>
            <h2 className="auth-req-title">Sign In to Track Complaints</h2>
            <p className="auth-req-desc">
              To protect citizen privacy, detailed complaint status, internal dispatch notes, and photo evidence are restricted to the verified citizen who filed the report.
            </p>
            <div className="auth-req-actions">
              <button
                type="button"
                onClick={() => (onOpenAuth ? onOpenAuth() : setCurrentView?.('login'))}
                className="btn-primary"
              >
                <span>Citizen Sign-In</span>
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentView?.('feed')}
                className="btn-secondary"
              >
                <span>Browse Public Feed</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="track-container">
      {/* Header & Search */}
      <div className="track-header">
        <div className="citizen-auth-indicator track-auth-pill">
          <ShieldCheck size={16} className="text-emerald" />
          <span>Signed in as: <strong>{user.displayName || user.phoneNumber || user.email}</strong></span>
        </div>
        <h2 className="track-title">Track Complaint Status</h2>
        <p className="track-desc">
          Search with your unique tracking ID (e.g. <code>CR-20261121-XXXXXX</code>) to inspect live municipal triage, field dispatch, and resolution status for your reports.
        </p>

        <form onSubmit={(e) => handleSearch(null, e)} className="track-search-form">
          <div className="search-input-box">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              aria-label="Enter Tracking ID"
              placeholder="Enter Tracking ID (e.g. CR-20261121-9893B5)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="track-input"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !searchQuery.trim()}
            className="track-btn"
          >
            {loading ? 'Searching...' : 'Track Issue'}
          </button>
        </form>
      </div>

      {error && (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Actively Tracked Issue Details */}
      {issue && (
        <div className="track-card">
          {/* Status Timeline */}
          <div className="timeline-container">
            <div className={`timeline-step ${getStepStatus('Reported')}`}>
              <div className="step-circle">
                <CheckCircle2 size={16} />
              </div>
              <div className="step-content">
                <span className="step-title">Reported</span>
                <span className="step-date">
                  {new Date(issue.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className={`timeline-line ${getStepStatus('In Progress') !== 'pending' ? 'line-active' : ''}`} />

            <div className={`timeline-step ${getStepStatus('In Progress')}`}>
              <div className="step-circle">
                <Clock size={16} />
              </div>
              <div className="step-content">
                <span className="step-title">In Progress</span>
                <span className="step-date">
                  {issue.status === 'In Progress' || issue.status === 'Resolved' ? 'Under Action' : 'Pending Review'}
                </span>
              </div>
            </div>

            <div className={`timeline-line ${getStepStatus('Resolved') === 'completed' ? 'line-active' : ''}`} />

            <div className={`timeline-step ${getStepStatus('Resolved')}`}>
              <div className="step-circle">
                <CheckCircle2 size={16} />
              </div>
              <div className="step-content">
                <span className="step-title">Resolved</span>
                <span className="step-date">
                  {issue.status === 'Resolved' ? 'Completed' : 'Awaiting Work'}
                </span>
              </div>
            </div>
          </div>

          {/* Issue Header Info */}
          <div className="track-card-header">
            <div>
              <div className="track-id-row">
                <span className="tracking-badge-lg">{issue.tracking_id}</span>
                <button onClick={handleCopyId} className="copy-btn-inline" title="Copy ID">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <span className={`priority-tag priority-${(issue.priority || 'Medium').toLowerCase()}`}>
                  {issue.priority} Priority
                </span>
                <span className={`status-pill status-${issue.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {issue.status}
                </span>
              </div>
              <h3 className="track-issue-title">{issue.title}</h3>
              <div className="track-meta-row">
                <span><MapPin size={14} /> {issue.location}</span>
                {issue.latitude && issue.longitude && (
                  <span className="gps-coord-pill" title="Verified GPS Coordinates">
                    📍 {issue.latitude.toFixed(4)}°N, {issue.longitude.toFixed(4)}°E
                  </span>
                )}
                <span><Clock size={14} /> Filed: {new Date(issue.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Issue Description & Photo Evidence */}
          <div className="track-body-section">
            <h4 className="track-section-label">Citizen Description</h4>
            <p className="track-description-text">{issue.description}</p>

            {issue.image_path && (
              <div className="evidence-box">
                <h4 className="track-section-label">Photo Evidence</h4>
                <img src={getApiUrl(issue.image_path)} alt="Evidence" className="evidence-image" />
              </div>
            )}
          </div>

          {/* AI Triage Intelligence */}
          <div className="track-ai-section">
            <div className="ai-section-header">
              <Sparkles size={16} />
              <h4>AI Triage &amp; Dispatch Intelligence ({issue.ai_mode})</h4>
            </div>

            <div className="ai-grid">
              <div className="ai-grid-item">
                <span className="ai-item-label">Assigned Department</span>
                <span className="ai-item-val font-semibold">
                  <Building2 size={15} /> {issue.recommended_department}
                </span>
              </div>

              <div className="ai-grid-item">
                <span className="ai-item-label">Standardized Category</span>
                <span className="ai-item-val">{issue.ai_category}</span>
              </div>

              <div className="ai-grid-item full-span">
                <span className="ai-item-label">Urgency Rationale</span>
                <p className="ai-item-desc">{issue.urgency_reasoning}</p>
              </div>

              <div className="ai-grid-item full-span">
                <span className="ai-item-label">Operational Action Dispatched</span>
                <p className="ai-item-desc action-desc">{issue.suggested_action}</p>
              </div>

              {issue.visual_observations && (
                <div className="ai-grid-item full-span">
                  <span className="ai-item-label">Visual Damage Analysis</span>
                  <p className="ai-item-desc">{issue.visual_observations}</p>
                </div>
              )}

              {issue.is_potential_duplicate && (
                <div className="duplicate-alert-banner full-span">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Potential Duplicate Issue:</strong> {issue.duplicate_note}
                  </div>
                </div>
              )}

              {issue.admin_notes && (
                <div className="admin-notes-banner full-span">
                  <FileText size={18} />
                  <div>
                    <strong>Municipal Administrator Notes:</strong> {issue.admin_notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Citizen Personal Complaints Section */}
      <section className="my-complaints-section">
        <div className="my-complaints-header">
          <div className="my-complaints-title-row">
            <FolderOpen size={20} className="text-primary" />
            <div>
              <h3 className="my-complaints-title">My Filed Complaints</h3>
              <p className="my-complaints-sub">
                All civic reports submitted from your authenticated account ({myComplaints.length} total)
              </p>
            </div>
          </div>
          <button
            onClick={fetchMyComplaints}
            className="btn-refresh-sm"
            title="Refresh my complaints"
          >
            <RefreshCw size={14} className={myLoading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {myLoading ? (
          <div className="loading-state-box">
            <RefreshCw size={24} className="spin-icon" />
            <span>Loading your submitted reports...</span>
          </div>
        ) : myError ? (
          <div className="error-banner">
            <AlertTriangle size={16} />
            <span>{myError}</span>
          </div>
        ) : myComplaints.length === 0 ? (
          <div className="my-empty-state">
            <FolderOpen size={36} className="text-muted" />
            <h4>No complaints filed yet</h4>
            <p>You have not submitted any civic reports under this account yet.</p>
            {setCurrentView && (
              <button
                onClick={() => setCurrentView('report')}
                className="btn-primary-sm"
                style={{ marginTop: '0.75rem' }}
              >
                <span>Report an Issue</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="my-complaints-grid">
            {myComplaints.map((comp) => (
              <div
                key={comp.tracking_id}
                className={`my-complaint-card ${issue?.tracking_id === comp.tracking_id ? 'active-tracked-card' : ''}`}
              >
                <div className="my-card-top">
                  <span className="tracking-code-pill">{comp.tracking_id}</span>
                  <div className="my-card-tags">
                    <span className={`priority-tag priority-${(comp.priority || 'Medium').toLowerCase()}`}>
                      {comp.priority}
                    </span>
                    <span className={`status-pill status-${comp.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {comp.status}
                    </span>
                  </div>
                </div>

                <h4 className="my-card-title">{comp.title}</h4>
                <p className="my-card-desc">{comp.description ? comp.description.slice(0, 100) + '...' : ''}</p>

                <div className="my-card-meta">
                  <span><MapPin size={13} /> {comp.location}</span>
                  <span><Building2 size={13} /> {comp.recommended_department}</span>
                </div>

                <div className="my-card-footer">
                  <span className="my-card-date">
                    <Calendar size={13} /> {new Date(comp.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleSearch(comp.tracking_id)}
                    className="btn-track-action"
                  >
                    <span>View Status</span>
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
