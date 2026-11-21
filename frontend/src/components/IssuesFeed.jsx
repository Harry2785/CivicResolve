import { useState, useEffect } from 'react'
import { getApiUrl } from '../config/api'
import {
  Search,
  Filter,
  MapPin,
  Calendar,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Tag
} from 'lucide-react'

export default function IssuesFeed({ setCurrentView }) {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const categories = [
    'Roads & Potholes',
    'Sanitation & Waste',
    'Water & Drainage',
    'Streetlights & Electrical',
    'Public Safety',
    'Other'
  ]

  const fetchIssues = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (priorityFilter) params.append('priority', priorityFilter)
      if (categoryFilter) params.append('category', categoryFilter)
      if (search.trim()) params.append('search', search.trim())

      const res = await fetch(getApiUrl(`/api/issues/feed?${params.toString()}`))
      if (res.ok) {
        const data = await res.json()
        setIssues(data.issues || [])
      }
    } catch (err) {
      console.error('Failed to load public issues feed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIssues()
  }, [statusFilter, priorityFilter, categoryFilter])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    fetchIssues()
  }

  return (
    <div className="feed-container">
      <div className="feed-header">
        <div>
          <div className="feed-privacy-notice">
            <ShieldCheck size={14} className="text-emerald" />
            <span>Public Civic Transparency Feed (PII &amp; Tracking IDs Sanitized)</span>
          </div>
          <h2 className="feed-title">Public Civic Issues</h2>
          <p className="feed-desc">
            Browse live community reports across the municipality with privacy-safe anonymized details.
          </p>
        </div>
        <button
          onClick={fetchIssues}
          className="refresh-feed-btn"
          title="Refresh issues"
        >
          <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <form onSubmit={handleSearchSubmit} className="search-form-inline">
          <Search size={16} className="search-icon-sm" />
          <input
            type="text"
            aria-label="Search public civic issues"
            placeholder="Search keywords or neighborhood locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="filter-search-input"
          />
        </form>

        <div className="select-filters-group">
          {/* Status Filter */}
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Statuses</option>
            <option value="Reported">Reported</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>

          {/* Priority Filter */}
          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Category Filter */}
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Issues Grid */}
      {loading ? (
        <div className="loading-state">
          <RefreshCw size={24} className="spin-icon" />
          <span>Loading public issues...</span>
        </div>
      ) : issues.length === 0 ? (
        <div className="empty-state">
          <Filter size={32} />
          <h3>No complaints found</h3>
          <p>No complaints match the selected filters or search query.</p>
        </div>
      ) : (
        <div className="issues-feed-grid">
          {issues.map((issue, idx) => (
            <div key={`${issue.category}-${issue.created_at}-${idx}`} className="feed-card">
              <div className="feed-card-header">
                <span className="category-badge-sm">
                  <Tag size={12} />
                  <span>{issue.category}</span>
                </span>
                <span className={`priority-tag priority-${(issue.priority || 'Medium').toLowerCase()}`}>
                  {issue.priority}
                </span>
                <span className={`status-pill status-${issue.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {issue.status}
                </span>
              </div>

              <h3 className="feed-card-title">{issue.title}</h3>
              <p className="feed-card-desc">{issue.description ? issue.description.slice(0, 140) + '...' : ''}</p>

              <div className="feed-card-details">
                <div className="feed-meta-item">
                  <MapPin size={14} />
                  <span>{issue.location}</span>
                </div>
              </div>

              <div className="feed-card-footer">
                <span className="feed-date">
                  <Calendar size={13} /> {new Date(issue.created_at).toLocaleDateString()}
                </span>
                {setCurrentView && (
                  <button
                    onClick={() => setCurrentView('track')}
                    className="feed-track-btn"
                  >
                    <span>Track Mine</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
