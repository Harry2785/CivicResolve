import { useState, useEffect, useMemo } from 'react'
import {
  SlidersHorizontal,
  Trash2,
  RefreshCw,
  Edit3,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  Building2,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  Search,
  Eye,
  Copy,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Save,
  RotateCcw,
  ChevronDown,
  Layers,
  Send,
  Calendar,
  Tag,
  AlertOctagon,
  Maximize2,
  BarChart3,
  Flame
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import DepartmentAnalytics from './DepartmentAnalytics'
import HotspotIntelligence from './HotspotIntelligence'

export default function AdminPortal({ setCurrentView }) {
  const { user, adminProfile, getAuthHeaders } = useAuth()

  // Data states
  const [issues, setIssues] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [activeTab, setActiveTab] = useState('dispatch') // 'dispatch' | 'analytics' | 'hotspots'

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)

  // Drawer / Modal states
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [deleteConfirmIssue, setDeleteConfirmIssue] = useState(null)
  const [imageLightboxUrl, setImageLightboxUrl] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

  // In-Drawer / In-Table Edit state
  const [editingId, setEditingId] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editDept, setEditDept] = useState('')
  const [editNotes, setEditNotes] = useState('')

  // Quick dispatch note templates
  const NOTE_TEMPLATES = [
    'Dispatched road maintenance crew #3 for cold-patch asphalt repair.',
    'Sanitation compactor truck assigned. Waste cleared and area sanitized.',
    'Lineman emergency team dispatched. Power line isolated and secured.',
    'Water supply valve repaired and drain choke cleared.',
    'Verified on-site by municipal inspector. Awaiting final quality sign-off.',
    'Duplicate complaint confirmed. Linked to primary active ticket.'
  ]

  const showToast = (msg, type = 'success') => {
    setToastMessage({ text: msg, type })
    setTimeout(() => setToastMessage(null), 3800)
  }

  const loadData = async () => {
    setLoading(true)
    setAuthError(null)

    try {
      const headers = await getAuthHeaders()
      const [issuesRes, statsRes] = await Promise.all([
        fetch('/api/admin/issues?limit=200', { headers }),
        fetch('/api/admin/stats', { headers })
      ])

      if (issuesRes.status === 401 || issuesRes.status === 403 || statsRes.status === 401 || statsRes.status === 403) {
        setAuthError('Administrator authorization failed. Your session may have expired or you lack permissions.')
        return
      }

      if (issuesRes.ok) {
        const issuesData = await issuesRes.json()
        setIssues(issuesData.issues || [])
        // If an issue was currently open in drawer, update its reference
        if (selectedIssue) {
          const updated = (issuesData.issues || []).find((i) => i.id === selectedIssue.id)
          if (updated) setSelectedIssue(updated)
        }
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }
    } catch (err) {
      console.error('Failed to load admin data:', err)
      setAuthError('Network error connecting to municipal administration service.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Copy tracking ID with feedback
  const handleCopyTrackingId = (e, trackingId) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(trackingId)
    setCopiedId(trackingId)
    showToast(`Tracking ID ${trackingId} copied to clipboard!`, 'info')
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Open Drawer for a specific issue
  const openIssueDrawer = (issue) => {
    setSelectedIssue(issue)
    setEditStatus(issue.status)
    setEditPriority(issue.priority || 'Medium')
    setEditDept(issue.recommended_department || '')
    setEditNotes(issue.admin_notes || '')
  }

  // Start inline table edit
  const startInlineEdit = (e, issue) => {
    e.stopPropagation()
    setEditingId(issue.id)
    setEditStatus(issue.status)
    setEditPriority(issue.priority || 'Medium')
    setEditDept(issue.recommended_department || '')
    setEditNotes(issue.admin_notes || '')
  }

  // Save changes (from drawer or inline)
  const handleSaveUpdate = async (id) => {
    setActionLoading(id)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/issues/${id}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: editStatus || undefined,
          priority: editPriority || undefined,
          recommended_department: editDept || undefined,
          admin_notes: editNotes || undefined
        })
      })

      if (res.ok) {
        const updated = await res.json()
        setIssues((prev) => prev.map((item) => (item.id === id ? updated : item)))
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(updated)
        }
        setEditingId(null)
        showToast(`Complaint ${updated.tracking_id} successfully updated!`)
        // Refresh dashboard stats in background
        const statsRes = await fetch('/api/admin/stats', { headers })
        if (statsRes.ok) setStats(await statsRes.json())
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(`Update failed: ${err.detail || 'Server error'}`, 'error')
      }
    } catch (err) {
      console.error('Update error:', err)
      showToast('Network error while updating complaint.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // Delete complaint
  const executeDelete = async () => {
    if (!deleteConfirmIssue) return
    const { id, tracking_id } = deleteConfirmIssue

    setActionLoading(id)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/issues/${id}`, {
        method: 'DELETE',
        headers
      })

      if (res.ok) {
        setIssues((prev) => prev.filter((item) => item.id !== id))
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(null)
        }
        setDeleteConfirmIssue(null)
        showToast(`Complaint ${tracking_id} permanently removed.`, 'info')
        // Refresh stats
        const statsRes = await fetch('/api/admin/stats', { headers })
        if (statsRes.ok) setStats(await statsRes.json())
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(`Delete failed: ${err.detail || 'Server error'}`, 'error')
      }
    } catch (err) {
      console.error('Delete error:', err)
      showToast('Network error while deleting complaint.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // Re-run Gemini AI Analysis
  const handleReanalyze = async (e, id) => {
    if (e) e.stopPropagation()
    setActionLoading(id)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/admin/issues/${id}/reanalyze`, {
        method: 'POST',
        headers
      })

      if (res.ok) {
        const updated = await res.json()
        setIssues((prev) => prev.map((item) => (item.id === id ? updated : item)))
        if (selectedIssue && selectedIssue.id === id) {
          setSelectedIssue(updated)
          setEditStatus(updated.status)
          setEditPriority(updated.priority)
          setEditDept(updated.recommended_department)
        }
        showToast(`Gemini AI analysis refreshed for ${updated.tracking_id} (${updated.ai_mode})!`)
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(`Reanalysis failed: ${err.detail || 'Server error'}`, 'error')
      }
    } catch (err) {
      console.error('Reanalyze error:', err)
      showToast('Network error while running Gemini AI analysis.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // Filtered issues calculation
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // Status filter
      if (statusFilter && issue.status !== statusFilter) return false

      // Priority filter
      if (priorityFilter && issue.priority !== priorityFilter) return false

      // Category filter
      if (categoryFilter) {
        const catMatch =
          (issue.citizen_category || '').toLowerCase() === categoryFilter.toLowerCase() ||
          (issue.ai_category || '').toLowerCase() === categoryFilter.toLowerCase()
        if (!catMatch) return false
      }

      // Duplicates only filter
      if (duplicatesOnly && !issue.is_potential_duplicate) return false

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const match =
          (issue.tracking_id || '').toLowerCase().includes(q) ||
          (issue.title || '').toLowerCase().includes(q) ||
          (issue.description || '').toLowerCase().includes(q) ||
          (issue.location || '').toLowerCase().includes(q) ||
          (issue.citizen_category || '').toLowerCase().includes(q) ||
          (issue.ai_category || '').toLowerCase().includes(q) ||
          (issue.recommended_department || '').toLowerCase().includes(q) ||
          (issue.admin_notes || '').toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [issues, statusFilter, priorityFilter, categoryFilter, duplicatesOnly, searchQuery])

  // Count helper for tabs
  const countByStatus = useMemo(() => {
    const counts = { all: issues.length, reported: 0, inProgress: 0, resolved: 0, duplicates: 0 }
    issues.forEach((i) => {
      if (i.status === 'Reported') counts.reported++
      if (i.status === 'In Progress') counts.inProgress++
      if (i.status === 'Resolved') counts.resolved++
      if (i.is_potential_duplicate) counts.duplicates++
    })
    return counts
  }, [issues])

  const hasActiveFilters = Boolean(statusFilter || priorityFilter || categoryFilter || duplicatesOnly || searchQuery)

  const clearAllFilters = () => {
    setStatusFilter('')
    setPriorityFilter('')
    setCategoryFilter('')
    setDuplicatesOnly(false)
    setSearchQuery('')
  }

  const verifiedEmail = adminProfile?.email || user?.email || 'official@example.gov.in'

  return (
    <div className="admin-container">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className={`admin-floating-toast toast-${toastMessage.type}`}>
          {toastMessage.type === 'success' && <Check size={18} className="toast-icon text-emerald" />}
          {toastMessage.type === 'error' && <AlertCircle size={18} className="toast-icon text-rose" />}
          {toastMessage.type === 'info' && <Sparkles size={18} className="toast-icon text-sky" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Identity Header & Breadcrumb */}
      <div className="admin-command-header">
        <div className="command-header-left">
          <div className="admin-live-pulse-badge">
            <span className="live-dot-pulse"></span>
            <span>Municipal Dispatch Command Center</span>
          </div>
          <h1 className="admin-portal-headline">Administrative Triage &amp; Lifecycle Management</h1>
          <p className="admin-portal-subtext">
            Real-time civic intelligence: review incoming complaints, monitor Gemini AI triage, inspect multimodal image evidence, and manage municipal crew dispatches.
          </p>
        </div>

        <div className="command-header-right">
          {/* Official Identity Card */}
          <div className="official-admin-identity-card">
            <div className="admin-avatar-emblem">
              <ShieldCheck size={22} className="text-emerald" />
            </div>
            <div className="admin-id-meta">
              <div className="admin-id-row">
                <span className="admin-id-email" title={verifiedEmail}>
                  {verifiedEmail}
                </span>
                <span className="admin-badge-verified">Admin</span>
              </div>
              <span className="admin-id-sub">Firebase Token Cryptographically Verified</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="command-actions-row">
            <button
              onClick={loadData}
              disabled={loading}
              className="btn-modern-refresh"
              title="Refresh complaint data"
            >
              <RefreshCw size={15} className={loading ? 'spin-icon text-sky-400' : ''} />
              <span>{loading ? 'Refreshing...' : 'Refresh Feed'}</span>
            </button>

            <button
              onClick={() => setCurrentView('feed')}
              className="btn-modern-ghost"
              title="View Public Feed as Citizen"
            >
              <Eye size={15} />
              <span>Public Feed</span>
            </button>
          </div>
        </div>
      </div>

      {authError && (
        <div className="admin-alert-banner alert-error">
          <AlertCircle size={20} />
          <div className="alert-content">
            <strong>Authorization Error:</strong>
            <p>{authError}</p>
          </div>
          <button onClick={() => setCurrentView('admin-login')} className="btn-modern-sm btn-reauth">
            Re-authenticate
          </button>
        </div>
      )}

      {/* Primary Administrative Module Tab Switcher */}
      <div className="admin-portal-tabs-nav">
        <button
          onClick={() => setActiveTab('dispatch')}
          className={`admin-tab-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
        >
          <SlidersHorizontal size={16} />
          <span>Dispatch &amp; Triage</span>
          <span className="tab-count-badge">{issues.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`admin-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
        >
          <BarChart3 size={16} />
          <span>Department Performance</span>
          <span className="tab-pill-sparkle">Live SLA</span>
        </button>

        <button
          onClick={() => setActiveTab('hotspots')}
          className={`admin-tab-btn ${activeTab === 'hotspots' ? 'active' : ''}`}
        >
          <Flame size={16} />
          <span>Hotspot Intelligence</span>
          <span className="tab-pill-sparkle">GIS Map</span>
        </button>
      </div>

      {activeTab === 'dispatch' && (
        <>
          {/* Executive KPI Statistics Strip (Clickable Shortcut Filters) */}
          <div className="admin-kpi-grid">
        <div
          onClick={() => { setStatusFilter(''); setDuplicatesOnly(false); }}
          className={`kpi-card ${!statusFilter && !duplicatesOnly ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-top">
            <span className="kpi-label">Total Complaints</span>
            <div className="kpi-icon-wrap icon-neutral">
              <Layers size={18} />
            </div>
          </div>
          <div className="kpi-value">{stats ? stats.total_issues : countByStatus.all}</div>
          <div className="kpi-footer">
            <span className="kpi-hint">All municipal records</span>
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('Reported'); setDuplicatesOnly(false); }}
          className={`kpi-card ${statusFilter === 'Reported' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-top">
            <span className="kpi-label">Reported / Triage</span>
            <div className="kpi-icon-wrap icon-amber">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="kpi-value text-amber">{stats ? (stats.by_status?.['Reported'] || 0) : countByStatus.reported}</div>
          <div className="kpi-footer">
            <span className="kpi-hint text-amber">Awaiting crew dispatch</span>
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('In Progress'); setDuplicatesOnly(false); }}
          className={`kpi-card ${statusFilter === 'In Progress' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-top">
            <span className="kpi-label">In Progress</span>
            <div className="kpi-icon-wrap icon-blue">
              <Clock size={18} />
            </div>
          </div>
          <div className="kpi-value text-blue">{stats ? (stats.by_status?.['In Progress'] || 0) : countByStatus.inProgress}</div>
          <div className="kpi-footer">
            <span className="kpi-hint text-blue">Field crews assigned</span>
          </div>
        </div>

        <div
          onClick={() => { setStatusFilter('Resolved'); setDuplicatesOnly(false); }}
          className={`kpi-card ${statusFilter === 'Resolved' ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-top">
            <span className="kpi-label">Resolved</span>
            <div className="kpi-icon-wrap icon-emerald">
              <Check size={18} />
            </div>
          </div>
          <div className="kpi-value text-emerald">{stats ? (stats.by_status?.['Resolved'] || 0) : countByStatus.resolved}</div>
          <div className="kpi-footer">
            <span className="kpi-hint text-emerald">Successfully closed</span>
          </div>
        </div>

        <div
          onClick={() => { setDuplicatesOnly(!duplicatesOnly); setStatusFilter(''); }}
          className={`kpi-card ${duplicatesOnly ? 'kpi-card-active' : ''}`}
        >
          <div className="kpi-top">
            <span className="kpi-label">Potential Duplicates</span>
            <div className="kpi-icon-wrap icon-purple">
              <AlertOctagon size={18} />
            </div>
          </div>
          <div className="kpi-value text-purple">{stats ? (stats.duplicates_detected || 0) : countByStatus.duplicates}</div>
          <div className="kpi-footer">
            <span className="kpi-hint text-purple">Flagged for admin review</span>
          </div>
        </div>
      </div>

      {/* Modern Filter, Search & Segmented Control Bar */}
      <div className="admin-filter-toolbar">
        <div className="toolbar-top-row">
          {/* Search Box */}
          <div className="search-input-wrapper">
            <Search size={16} className="search-lead-icon" />
            <input
              type="text"
              aria-label="Search complaints"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Tracking ID, Title, Location, Dept, Notes..."
              className="search-input-field"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="search-clear-btn" title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Segmented Status Tabs */}
          <div className="segmented-status-tabs">
            <button
              onClick={() => setStatusFilter('')}
              className={`segmented-tab ${statusFilter === '' ? 'tab-active' : ''}`}
            >
              <span>All</span>
              <span className="tab-count-pill">{countByStatus.all}</span>
            </button>
            <button
              onClick={() => setStatusFilter('Reported')}
              className={`segmented-tab ${statusFilter === 'Reported' ? 'tab-active tab-amber' : ''}`}
            >
              <span>Reported</span>
              <span className="tab-count-pill">{countByStatus.reported}</span>
            </button>
            <button
              onClick={() => setStatusFilter('In Progress')}
              className={`segmented-tab ${statusFilter === 'In Progress' ? 'tab-active tab-blue' : ''}`}
            >
              <span>In Progress</span>
              <span className="tab-count-pill">{countByStatus.inProgress}</span>
            </button>
            <button
              onClick={() => setStatusFilter('Resolved')}
              className={`segmented-tab ${statusFilter === 'Resolved' ? 'tab-active tab-emerald' : ''}`}
            >
              <span>Resolved</span>
              <span className="tab-count-pill">{countByStatus.resolved}</span>
            </button>
          </div>
        </div>

        <div className="toolbar-bottom-row">
          {/* Secondary Filters */}
          <div className="secondary-filters-group">
            {/* Priority Filter */}
            <div className="custom-select-wrap">
              <select
                aria-label="Filter complaints by priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="modern-filter-select"
              >
                <option value="">All Priorities</option>
                <option value="Critical">Critical Priority</option>
                <option value="High">High Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="Low">Low Priority</option>
              </select>
              <ChevronDown size={14} className="select-arrow-icon" />
            </div>

            {/* Category Filter */}
            <div className="custom-select-wrap">
              <select
                aria-label="Filter complaints by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="modern-filter-select"
              >
                <option value="">All Categories</option>
                <option value="Roads & Potholes">Roads &amp; Potholes</option>
                <option value="Sanitation & Waste">Sanitation &amp; Waste</option>
                <option value="Water & Drainage">Water &amp; Drainage</option>
                <option value="Streetlights & Electrical">Streetlights &amp; Electrical</option>
                <option value="Public Safety">Public Safety</option>
                <option value="Other">Other</option>
              </select>
              <ChevronDown size={14} className="select-arrow-icon" />
            </div>

            {/* Duplicates Toggle */}
            <button
              onClick={() => setDuplicatesOnly(!duplicatesOnly)}
              className={`btn-toggle-duplicate ${duplicatesOnly ? 'toggle-active' : ''}`}
            >
              <AlertTriangle size={14} />
              <span>Flagged Duplicates Only</span>
              {countByStatus.duplicates > 0 && (
                <span className="dup-count-badge">{countByStatus.duplicates}</span>
              )}
            </button>
          </div>

          {/* Reset Filters & Results Indicator */}
          <div className="results-indicator-row">
            <span className="results-count-text">
              Showing <strong>{filteredIssues.length}</strong> of <strong>{issues.length}</strong> complaints
            </span>
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="btn-modern-reset-filters">
                <RotateCcw size={13} />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table / Data Grid */}
      {loading ? (
        <div className="admin-loading-card">
          <RefreshCw size={36} className="spin-icon text-sky" />
          <h3>Loading Municipal Complaints...</h3>
          <p>Connecting to SQLite database and synchronizing AI triage data.</p>
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="admin-empty-state-card">
          <div className="empty-icon-wrap">
            <Search size={36} className="text-muted" />
          </div>
          <h3>No matching complaints found</h3>
          <p>
            {hasActiveFilters
              ? 'Try adjusting your search criteria or resetting the active filters.'
              : 'There are currently no civic complaints in the municipal system.'}
          </p>
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="btn-modern-primary mt-3">
              <RotateCcw size={15} />
              <span>Clear All Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-modern-table">
            <thead>
              <tr>
                <th className="th-tracking">Tracking ID</th>
                <th className="th-issue">Complaint &amp; Category</th>
                <th className="th-priority">Priority</th>
                <th className="th-status">Dispatch Status</th>
                <th className="th-dept">Assigned Department</th>
                <th className="th-location">Location</th>
                <th className="th-ai">AI Triage</th>
                <th className="th-actions text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.map((issue) => {
                const isEditing = editingId === issue.id
                const isSelected = selectedIssue?.id === issue.id
                const isDuplicate = issue.is_potential_duplicate
                const isCritical = issue.priority === 'Critical'

                return (
                  <tr
                    key={issue.id}
                    onClick={() => openIssueDrawer(issue)}
                    className={`table-row-interactive ${isSelected ? 'row-selected' : ''} ${
                      isDuplicate ? 'row-has-duplicate' : ''
                    } ${isCritical ? 'row-is-critical' : ''}`}
                  >
                    {/* Tracking ID with Copy */}
                    <td className="cell-tracking-id">
                      <div className="tracking-id-stack">
                        <div className="tracking-code-row">
                          <code className="tracking-code">{issue.tracking_id}</code>
                          <button
                            onClick={(e) => handleCopyTrackingId(e, issue.tracking_id)}
                            className="btn-icon-copy"
                            title="Copy Tracking ID"
                          >
                            {copiedId === issue.tracking_id ? (
                              <CheckCheck size={13} className="text-emerald" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>
                        {issue.image_path && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              setImageLightboxUrl(issue.image_path)
                            }}
                            className="photo-indicator-pill"
                            title="Evidence photo attached (click to view)"
                          >
                            <ImageIcon size={11} />
                            <span>Photo</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Complaint Title, Description & Category */}
                    <td className="cell-complaint-info">
                      <div className="complaint-title-line">
                        <strong className="complaint-title-text" title={issue.title}>
                          {issue.title}
                        </strong>
                        {isDuplicate && (
                          <span
                            className="duplicate-indicator-tag"
                            title={issue.duplicate_note || 'Possible duplicate complaint detected'}
                          >
                            <AlertTriangle size={11} /> Duplicate
                          </span>
                        )}
                      </div>
                      <p className="complaint-desc-snippet">
                        {issue.description ? issue.description.slice(0, 95) + (issue.description.length > 95 ? '...' : '') : ''}
                      </p>
                      <div className="category-chips-row">
                        <span className="category-badge-chip">
                          <Tag size={10} />
                          {issue.citizen_category}
                        </span>
                        {issue.ai_category && issue.ai_category !== issue.citizen_category && (
                          <span className="ai-divergence-badge" title={`Citizen submitted as '${issue.citizen_category}', Gemini classified as '${issue.ai_category}'`}>
                            AI: {issue.ai_category}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Priority Badge / Inline Select */}
                    <td className="cell-priority" onClick={(e) => isEditing && e.stopPropagation()}>
                      {isEditing ? (
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value)}
                          className="modern-inline-select"
                        >
                          <option value="Critical">Critical</option>
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      ) : (
                        <span className={`priority-badge-modern priority-${(issue.priority || 'medium').toLowerCase()}`}>
                          {isCritical && <span className="critical-pulse-dot"></span>}
                          <span>{issue.priority || 'Medium'}</span>
                        </span>
                      )}
                    </td>

                    {/* Status Badge / Inline Select */}
                    <td className="cell-status" onClick={(e) => isEditing && e.stopPropagation()}>
                      {isEditing ? (
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="modern-inline-select"
                        >
                          <option value="Reported">Reported</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      ) : (
                        <span className={`status-badge-modern status-${(issue.status || 'reported').toLowerCase().replace(' ', '-')}`}>
                          <span>{issue.status}</span>
                        </span>
                      )}
                    </td>

                    {/* Assigned Department */}
                    <td className="cell-dept">
                      <div className="dept-label-wrap" title={issue.recommended_department}>
                        <Building2 size={13} className="text-muted flex-shrink-0" />
                        <span className="dept-name-text">{issue.recommended_department}</span>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="cell-location">
                      <div className="location-label-wrap" title={issue.location}>
                        <MapPin size={13} className="text-muted flex-shrink-0" />
                        <span className="location-name-text">{issue.location}</span>
                      </div>
                    </td>

                    {/* AI Mode */}
                    <td className="cell-ai-mode">
                      <span className={`ai-mode-pill-modern ${issue.ai_mode === 'Gemini Live' ? 'ai-live' : 'ai-fallback'}`}>
                        {issue.ai_mode === 'Gemini Live' ? (
                          <>
                            <Sparkles size={11} className="sparkle-star" />
                            <span>Gemini Live</span>
                          </>
                        ) : (
                          <span>Rule-Based Triage</span>
                        )}
                      </span>
                    </td>

                    {/* Action Buttons Group */}
                    <td className="cell-actions text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="table-actions-modern">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveUpdate(issue.id)}
                              disabled={actionLoading === issue.id}
                              className="btn-action-pill btn-save-pill"
                              title="Save Inline Changes"
                            >
                              <Check size={14} />
                              <span>Save</span>
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="btn-action-pill btn-cancel-pill"
                              title="Cancel Edit"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Inspect / Open Drawer */}
                            <button
                              onClick={() => openIssueDrawer(issue)}
                              className="btn-icon-modern btn-view-inspect"
                              title="Inspect Complaint & Dispatch Drawer"
                            >
                              <Eye size={15} />
                            </button>

                            {/* Inline Edit */}
                            <button
                              onClick={(e) => startInlineEdit(e, issue)}
                              className="btn-icon-modern btn-quick-edit"
                              title="Quick Edit Status & Priority"
                            >
                              <Edit3 size={15} />
                            </button>

                            {/* Re-analyze with Gemini */}
                            <button
                              onClick={(e) => handleReanalyze(e, issue.id)}
                              disabled={actionLoading === issue.id}
                              className="btn-icon-modern btn-ai-reanalyze"
                              title="Re-run Gemini AI Analysis"
                            >
                              <Sparkles size={15} className={actionLoading === issue.id ? 'spin-icon text-purple-400' : ''} />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => setDeleteConfirmIssue(issue)}
                              disabled={actionLoading === issue.id}
                              className="btn-icon-modern btn-trash-delete"
                              title="Permanently Delete Complaint"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* Module 1: Department-wise Municipal Performance Analytics */}
      {activeTab === 'analytics' && (
        <DepartmentAnalytics getAuthHeaders={getAuthHeaders} />
      )}

      {/* Module 2: Geographic Civic Issue Hotspot Intelligence */}
      {activeTab === 'hotspots' && (
        <HotspotIntelligence
          getAuthHeaders={getAuthHeaders}
          onInspectComplaint={(issueId) => {
            setActiveTab('dispatch')
            const found = issues.find((i) => i.id === issueId)
            if (found) setSelectedIssue(found)
          }}
        />
      )}

      {/* Slide-Over Executive Dispatch Drawer */}
      {selectedIssue && (
        <div className="drawer-backdrop" onClick={() => setSelectedIssue(null)}>
          <div className="executive-drawer-panel" onClick={(e) => e.stopPropagation()}>
            {/* Drawer Header */}
            <div className="drawer-header">
              <div className="drawer-header-left">
                <div className="drawer-tracking-badge">
                  <code className="drawer-code">{selectedIssue.tracking_id}</code>
                  <button
                    onClick={(e) => handleCopyTrackingId(e, selectedIssue.tracking_id)}
                    className="btn-icon-copy"
                    title="Copy Tracking ID"
                  >
                    {copiedId === selectedIssue.tracking_id ? <CheckCheck size={14} className="text-emerald" /> : <Copy size={14} />}
                  </button>
                </div>
                <h2 className="drawer-issue-title">{selectedIssue.title}</h2>
              </div>
              <button
                onClick={() => setSelectedIssue(null)}
                className="drawer-close-btn"
                title="Close Drawer (Esc)"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body Scroll Area */}
            <div className="drawer-scroll-body">
              {/* Critical Safety Alert Banner if Critical */}
              {selectedIssue.priority === 'Critical' && (
                <div className="drawer-critical-alert">
                  <AlertOctagon size={24} className="critical-alert-icon" />
                  <div className="critical-alert-body">
                    <strong>Critical Public Safety Risk &mdash; Urgent Human Review Required</strong>
                    <p>
                      This issue involves potential life-threatening infrastructure hazards. Immediate power isolation, structural cordoning, or emergency dispatch is advised. AI recommendations are advisory and require physical verification.
                    </p>
                  </div>
                </div>
              )}

              {/* Duplicate Warning Callout */}
              {selectedIssue.is_potential_duplicate && (
                <div className="drawer-duplicate-callout">
                  <AlertTriangle size={20} className="dup-callout-icon" />
                  <div className="dup-callout-body">
                    <strong>Potential Duplicate Complaint Flagged</strong>
                    <p>{selectedIssue.duplicate_note || 'Similar issue detected at this location.'}</p>
                    <span className="dup-action-note">
                      Review prior records to prevent duplicate crew deployments. Never automatically merge without verification.
                    </span>
                  </div>
                </div>
              )}

              {/* Citizen Report Card */}
              <div className="drawer-section-card">
                <div className="section-card-header">
                  <FileText size={16} className="text-sky" />
                  <h3>Citizen Complaint Details</h3>
                </div>

                <div className="drawer-meta-grid">
                  <div className="meta-grid-item">
                    <span className="meta-item-lbl">Location:</span>
                    <div className="meta-item-val flex items-center gap-1">
                      <MapPin size={14} className="text-muted" />
                      <span>{selectedIssue.location}</span>
                    </div>
                  </div>

                  <div className="meta-grid-item">
                    <span className="meta-item-lbl">Citizen Category:</span>
                    <div className="meta-item-val">
                      <span className="category-badge-chip">{selectedIssue.citizen_category}</span>
                    </div>
                  </div>

                  <div className="meta-grid-item">
                    <span className="meta-item-lbl">Reported Timestamp:</span>
                    <div className="meta-item-val flex items-center gap-1 text-muted">
                      <Calendar size={14} />
                      <span>{new Date(selectedIssue.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="meta-grid-item">
                    <span className="meta-item-lbl">Current Dispatch Status:</span>
                    <div className="meta-item-val">
                      <span className={`status-badge-modern status-${(selectedIssue.status || 'reported').toLowerCase().replace(' ', '-')}`}>
                        {selectedIssue.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="drawer-full-description">
                  <span className="meta-item-lbl">Full Description:</span>
                  <div className="description-text-box">
                    {selectedIssue.description || 'No description provided.'}
                  </div>
                </div>

                {/* Attached Evidence Image Preview */}
                {selectedIssue.image_path ? (
                  <div className="drawer-evidence-image-wrap">
                    <span className="meta-item-lbl">Attached Photo Evidence:</span>
                    <div
                      onClick={() => setImageLightboxUrl(selectedIssue.image_path)}
                      className="evidence-photo-box"
                      title="Click to zoom image"
                    >
                      <img
                        src={selectedIssue.image_path}
                        alt="Citizen uploaded evidence"
                        className="evidence-photo-img"
                      />
                      <div className="photo-zoom-overlay">
                        <Maximize2 size={18} />
                        <span>View Fullscreen</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="drawer-no-image-note">
                    <ImageIcon size={16} className="text-muted" />
                    <span>No image evidence was attached by the citizen for this report.</span>
                  </div>
                )}
              </div>

              {/* Gemini AI Triage Intelligence Card */}
              <div className="drawer-section-card ai-triage-card">
                <div className="section-card-header">
                  <div className="ai-header-lead">
                    <Sparkles size={18} className="text-purple-400" />
                    <h3>Google Gemini AI Triage Intelligence</h3>
                  </div>
                  <span className={`ai-mode-pill-modern ${selectedIssue.ai_mode === 'Gemini Live' ? 'ai-live' : 'ai-fallback'}`}>
                    {selectedIssue.ai_mode === 'Gemini Live' ? <Sparkles size={11} className="sparkle-star" /> : null}
                    {selectedIssue.ai_mode}
                  </span>
                </div>

                <div className="ai-breakdown-list">
                  {/* AI Category & Department Mapping */}
                  <div className="ai-breakdown-row">
                    <div className="ai-field-block">
                      <span className="ai-field-lbl">AI Classified Category:</span>
                      <strong className="ai-field-val text-primary">{selectedIssue.ai_category || selectedIssue.citizen_category}</strong>
                    </div>
                    <div className="ai-field-block">
                      <span className="ai-field-lbl">Recommended Department:</span>
                      <strong className="ai-field-val text-primary flex items-center gap-1">
                        <Building2 size={14} className="text-muted" />
                        {selectedIssue.recommended_department}
                      </strong>
                    </div>
                  </div>

                  {/* Urgency Reasoning */}
                  <div className="ai-reasoning-block">
                    <span className="ai-field-lbl">Urgency &amp; Priority Reasoning:</span>
                    <p className="ai-reasoning-text">
                      {selectedIssue.urgency_reasoning || 'Heuristic evaluation based on standard municipal priority guidelines.'}
                    </p>
                  </div>

                  {/* Suggested Municipal Action */}
                  <div className="ai-action-block">
                    <span className="ai-field-lbl">Suggested Municipal Action:</span>
                    <div className="suggested-action-box">
                      <Check size={16} className="text-emerald flex-shrink-0 mt-0.5" />
                      <p>{selectedIssue.suggested_action || 'Dispatch municipal maintenance crew for on-site evaluation.'}</p>
                    </div>
                  </div>

                  {/* Visual Observations */}
                  {selectedIssue.visual_observations && (
                    <div className="ai-visual-block">
                      <span className="ai-field-lbl">Multimodal Visual Observations:</span>
                      <p className="ai-visual-text">{selectedIssue.visual_observations}</p>
                    </div>
                  )}
                </div>

                <div className="ai-card-footer">
                  <button
                    onClick={(e) => handleReanalyze(e, selectedIssue.id)}
                    disabled={actionLoading === selectedIssue.id}
                    className="btn-modern-ai-reanalyze"
                  >
                    <Sparkles size={15} className={actionLoading === selectedIssue.id ? 'spin-icon' : ''} />
                    <span>{actionLoading === selectedIssue.id ? 'Analyzing with Gemini...' : 'Re-Run Gemini Live Analysis'}</span>
                  </button>
                  <span className="ai-advisory-disclaimer">
                    * AI recommendations are assistive and remain advisory for official municipal dispatch.
                  </span>
                </div>
              </div>

              {/* Administrative Dispatch Controls */}
              <div className="drawer-section-card dispatch-controls-card">
                <div className="section-card-header">
                  <SlidersHorizontal size={16} className="text-emerald" />
                  <h3>Municipal Dispatch Action &amp; Notes</h3>
                </div>

                <div className="dispatch-form-grid">
                  {/* Status Picker Pills */}
                  <div className="dispatch-form-group">
                    <label className="form-group-lbl">Update Status:</label>
                    <div className="status-selector-pills">
                      {['Reported', 'In Progress', 'Resolved'].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setEditStatus(st)}
                          className={`btn-status-choice status-btn-${st.toLowerCase().replace(' ', '-')} ${
                            editStatus === st ? 'status-choice-active' : ''
                          }`}
                        >
                          <span className="status-radio-dot"></span>
                          <span>{st}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Priority Picker */}
                  <div className="dispatch-form-group">
                    <label className="form-group-lbl">Priority Level:</label>
                    <div className="custom-select-wrap">
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className="modern-form-select"
                      >
                        <option value="Critical">Critical &mdash; Immediate Safety Risk</option>
                        <option value="High">High &mdash; Significant Disruption</option>
                        <option value="Medium">Medium &mdash; Moderate Inconvenience</option>
                        <option value="Low">Low &mdash; Minor Issue</option>
                      </select>
                      <ChevronDown size={14} className="select-arrow-icon" />
                    </div>
                  </div>

                  {/* Department Assignment */}
                  <div className="dispatch-form-group">
                    <label className="form-group-lbl">Assigned Department:</label>
                    <div className="custom-select-wrap">
                      <select
                        value={editDept}
                        onChange={(e) => setEditDept(e.target.value)}
                        className="modern-form-select"
                      >
                        <option value="Roads & Highways Department">Roads &amp; Highways Department</option>
                        <option value="Municipal Sanitation Wing">Municipal Sanitation Wing</option>
                        <option value="Water Supply & Sewerage Board">Water Supply &amp; Sewerage Board</option>
                        <option value="Electrical & Streetlight Maintenance">Electrical &amp; Streetlight Maintenance</option>
                        <option value="Public Works & Safety">Public Works &amp; Safety</option>
                        <option value="General Municipal Administration">General Municipal Administration</option>
                      </select>
                      <ChevronDown size={14} className="select-arrow-icon" />
                    </div>
                  </div>

                  {/* Admin Notes with Quick Template Pills */}
                  <div className="dispatch-form-group">
                    <div className="flex justify-between items-center mb-1">
                      <label className="form-group-lbl">Official Dispatch &amp; Action Notes:</label>
                      <span className="text-xs text-muted">Visible to citizens in complaint tracking</span>
                    </div>

                    {/* Template Pills */}
                    <div className="template-pills-row">
                      <span className="text-xs text-muted flex items-center gap-1">
                        <Send size={11} /> Quick insert:
                      </span>
                      {NOTE_TEMPLATES.map((tmpl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setEditNotes(tmpl)}
                          className="template-pill-btn"
                          title="Click to insert template into notes"
                        >
                          {tmpl.slice(0, 32)}...
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={4}
                      placeholder="Enter municipal dispatch instructions, assigned crew name, inspection findings, or resolution report..."
                      className="modern-notes-textarea"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Sticky Footer Actions */}
            <div className="drawer-footer-actions">
              <button
                onClick={() => setDeleteConfirmIssue(selectedIssue)}
                disabled={actionLoading === selectedIssue.id}
                className="btn-drawer-delete"
              >
                <Trash2 size={16} />
                <span>Delete Complaint</span>
              </button>

              <div className="drawer-footer-right">
                <button
                  onClick={() => setSelectedIssue(null)}
                  className="btn-modern-ghost"
                >
                  Close
                </button>

                <button
                  onClick={() => handleSaveUpdate(selectedIssue.id)}
                  disabled={actionLoading === selectedIssue.id}
                  className="btn-modern-save-dispatch"
                >
                  <Save size={16} />
                  <span>{actionLoading === selectedIssue.id ? 'Saving Changes...' : 'Save & Dispatch Updates'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmIssue && (
        <div className="modal-backdrop-blur" onClick={() => setDeleteConfirmIssue(null)}>
          <div className="custom-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon-wrap">
              <AlertTriangle size={36} className="text-rose" />
            </div>
            <h3 className="confirm-modal-title">Delete Complaint Record</h3>
            <p className="confirm-modal-desc">
              Are you sure you want to permanently delete complaint <strong>{deleteConfirmIssue.tracking_id}</strong>?
            </p>
            <div className="confirm-issue-preview">
              <span>{deleteConfirmIssue.title}</span>
              <span className="text-xs text-muted">{deleteConfirmIssue.location}</span>
            </div>
            <p className="confirm-warning-note">
              This action cannot be undone and will erase all AI triage history, associated photo records, and dispatch notes.
            </p>
            <div className="confirm-actions-row">
              <button
                onClick={() => setDeleteConfirmIssue(null)}
                className="btn-modern-ghost"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={actionLoading === deleteConfirmIssue.id}
                className="btn-modern-danger"
              >
                <Trash2 size={16} />
                <span>{actionLoading === deleteConfirmIssue.id ? 'Deleting...' : 'Yes, Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {imageLightboxUrl && (
        <div className="modal-backdrop-blur" onClick={() => setImageLightboxUrl(null)}>
          <div className="lightbox-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <div className="flex items-center gap-2">
                <ImageIcon size={18} className="text-sky" />
                <span>Uploaded Citizen Photographic Evidence</span>
              </div>
              <button onClick={() => setImageLightboxUrl(null)} className="drawer-close-btn">
                <X size={20} />
              </button>
            </div>
            <div className="lightbox-img-wrap">
              <img src={imageLightboxUrl} alt="Complaint Evidence Zoom" className="lightbox-img" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
