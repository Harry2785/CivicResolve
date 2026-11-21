import { useState, useRef } from 'react'
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  X,
  RefreshCw,
  Building2,
  ShieldAlert,
  ShieldCheck,
  Navigation,
  MapPin
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ReportIssue({ initialCategory = 'Roads & Potholes', setCurrentView, setTrackTrackingId, onOpenAuth }) {
  const { user, getAuthHeaders } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoSuccess, setGeoSuccess] = useState(false)
  const [geoError, setGeoError] = useState(null)
  const [citizenCategory, setCitizenCategory] = useState(initialCategory)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [createdIssue, setCreatedIssue] = useState(null)
  const [copied, setCopied] = useState(false)

  const fileInputRef = useRef(null)

  const allowedCategories = [
    'Roads & Potholes',
    'Sanitation & Waste',
    'Water & Drainage',
    'Streetlights & Electrical',
    'Public Safety',
    'Other'
  ]

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 1. File size validation (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds the 5 MB limit. Please select a smaller photo.')
      return
    }

    // 2. MIME type validation
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG, and WebP images are supported.')
      return
    }

    setError(null)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }
    setGeoLoading(true)
    setGeoError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6))
        const lng = parseFloat(position.coords.longitude.toFixed(6))
        setLatitude(lat)
        setLongitude(lng)
        setGeoSuccess(true)
        setGeoLoading(false)
        if (!location.trim()) {
          setLocation(`Verified GPS: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`)
        }
      },
      (err) => {
        setGeoLoading(false)
        if (err.code === 1) {
          setGeoError('Location permission was denied. You can enter your address manually.')
        } else {
          setGeoError('Unable to detect GPS coordinates. Please enter manually.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const clearCoordinates = () => {
    setLatitude(null)
    setLongitude(null)
    setGeoSuccess(false)
    setGeoError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const authHeaders = await getAuthHeaders()
      if (!authHeaders.Authorization) {
        throw new Error('Citizen authentication required. Please sign in to submit a complaint.')
      }

      let res
      if (selectedFile) {
        // Send as multipart/form-data with verified Authorization header
        const formData = new FormData()
        formData.append('title', title)
        formData.append('description', description)
        formData.append('location', location)
        formData.append('citizen_category', citizenCategory)
        if (latitude !== null) formData.append('latitude', latitude)
        if (longitude !== null) formData.append('longitude', longitude)
        formData.append('image', selectedFile)

        res = await fetch('/api/issues/upload', {
          method: 'POST',
          headers: {
            ...authHeaders
          },
          body: formData
        })
      } else {
        // Send as JSON with verified Authorization header
        res = await fetch('/api/issues', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({
            title,
            description,
            location,
            citizen_category: citizenCategory,
            latitude: latitude !== null ? latitude : undefined,
            longitude: longitude !== null ? longitude : undefined
          })
        })
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        if (res.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }
        throw new Error(errorData.detail || `Server returned error ${res.status}`)
      }

      const issue = await res.json()
      setCreatedIssue(issue)
    } catch (err) {
      console.error('Submission error:', err)
      setError(err.message || 'Failed to submit issue. Please verify backend connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyTrackingId = () => {
    if (createdIssue?.tracking_id) {
      navigator.clipboard.writeText(createdIssue.tracking_id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setLocation('')
    clearCoordinates()
    removeFile()
    setCreatedIssue(null)
    setError(null)
  }

  if (!user) {
    return (
      <div className="report-container">
        <div className="auth-required-container">
          <div className="auth-required-card">
            <div className="auth-req-icon">
              <ShieldAlert size={36} />
            </div>
            <span className="auth-req-badge">CITIZEN AUTHENTICATION REQUIRED</span>
            <h2 className="auth-req-title">Sign In to File a Complaint</h2>
            <p className="auth-req-desc">
              To ensure complaint authenticity, protect citizen privacy, and enable direct operational tracking of municipal repairs, please sign in with your verified citizen account.
            </p>
            <div className="auth-req-actions">
              <button
                type="button"
                onClick={() => (onOpenAuth ? onOpenAuth() : setCurrentView('login'))}
                className="btn-primary"
              >
                <span>Citizen Sign-In / Register</span>
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('feed')}
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
    <div className="report-container">
      {/* If complaint was successfully submitted, show the AI Triage Result */}
      {createdIssue ? (
        <div className="success-result-card">
          <div className="success-header">
            <div className="success-icon-wrap">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <span className="success-subtitle">Complaint Successfully Filed</span>
              <h2 className="success-title">Your Report Has Been Submitted</h2>
            </div>
          </div>

          <div className="tracking-id-banner">
            <div className="tracking-info">
              <span className="tracking-label">Tracking Number (Keep for your records):</span>
              <span className="tracking-code">{createdIssue.tracking_id}</span>
            </div>
            <button
              onClick={handleCopyTrackingId}
              className="copy-btn"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'Copied!' : 'Copy ID'}</span>
            </button>
          </div>

          {/* AI Triage Report Card */}
          <div className="ai-triage-panel">
            <div className="ai-panel-header">
              <div className="ai-badge">
                <Sparkles size={14} />
                <span>AI Automated Triage: {createdIssue.ai_mode}</span>
              </div>
              <span className={`priority-tag priority-${(createdIssue.priority || 'Medium').toLowerCase()}`}>
                {createdIssue.priority} Priority
              </span>
            </div>

            <div className="triage-details-grid">
              <div className="triage-item">
                <span className="triage-label">Assigned Department</span>
                <span className="triage-val font-semibold">
                  <Building2 size={15} /> {createdIssue.recommended_department}
                </span>
              </div>
              <div className="triage-item">
                <span className="triage-label">Categorized As</span>
                <span className="triage-val">{createdIssue.ai_category}</span>
              </div>
              <div className="triage-item full-width">
                <span className="triage-label">Urgency Rationale</span>
                <p className="triage-text">{createdIssue.urgency_reasoning}</p>
              </div>
              <div className="triage-item full-width">
                <span className="triage-label">Recommended Operational Action</span>
                <p className="triage-text action-highlight">{createdIssue.suggested_action}</p>
              </div>

              {createdIssue.visual_observations && (
                <div className="triage-item full-width">
                  <span className="triage-label">Visual Damage Observations</span>
                  <p className="triage-text">{createdIssue.visual_observations}</p>
                </div>
              )}

              {createdIssue.is_potential_duplicate && (
                <div className="duplicate-alert-banner">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Potential Duplicate Flagged:</strong> {createdIssue.duplicate_note}
                    <div className="dup-sub">Your report has been linked to this active incident for consolidated resolution.</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="success-action-row">
            <button
              onClick={() => {
                if (setTrackTrackingId) setTrackTrackingId(createdIssue.tracking_id)
                setCurrentView('track')
              }}
              className="btn-primary"
            >
              <span>Track Complaint Status</span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={resetForm}
              className="btn-secondary"
            >
              <span>File Another Complaint</span>
            </button>
          </div>
        </div>
      ) : (
        /* The Report Form */
        <div className="form-wrapper">
          <div className="form-header">
            <h2 className="form-title">Report a Civic Issue</h2>
            <p className="form-desc">
              Submit details of public infrastructure damage. Gemini AI analyzes the hazard urgency, routes the complaint to the right municipal team, and flags potential duplicates.
            </p>

            <div className="citizen-auth-indicator">
              <ShieldCheck size={16} className="text-emerald" />
              <span>Reporting as verified citizen: <strong>{user.displayName || user.phoneNumber || user.email}</strong></span>
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="complaint-form">
            {/* Category Selector */}
            <div className="form-group">
              <label className="form-label">
                Civic Category <span className="req">*</span>
              </label>
              <div className="category-pill-selector">
                {allowedCategories.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setCitizenCategory(cat)}
                    className={`cat-pill-btn ${citizenCategory === cat ? 'cat-pill-active' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="form-group">
              <label htmlFor="issue-title" className="form-label">
                Issue Summary / Title <span className="req">*</span>
              </label>
              <input
                id="issue-title"
                type="text"
                required
                minLength={3}
                maxLength={255}
                placeholder="e.g. Deep pothole damaging tires on 5th Main Road"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
              />
            </div>

            {/* Location with Optional Geolocation */}
            <div className="form-group">
              <div className="location-label-row">
                <label htmlFor="issue-loc" className="form-label mb-0">
                  Precise Location or Landmark <span className="req">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={geoLoading}
                  className="btn-detect-gps"
                  title="Detect GPS coordinates using browser location"
                >
                  <Navigation size={13} className={geoLoading ? 'spin-icon' : ''} />
                  <span>{geoLoading ? 'Detecting GPS...' : 'Use Current GPS'}</span>
                </button>
              </div>

              {geoSuccess && latitude !== null && longitude !== null && (
                <div className="geo-verified-badge">
                  <div className="flex items-center gap-1">
                    <MapPin size={13} className="text-emerald" />
                    <span>GPS Attached: <strong>{latitude.toFixed(5)}°N, {longitude.toFixed(5)}°E</strong></span>
                  </div>
                  <button type="button" onClick={clearCoordinates} className="geo-clear-btn" title="Remove GPS coordinates">
                    <X size={12} />
                  </button>
                </div>
              )}

              {geoError && (
                <div className="geo-error-note">
                  <span>{geoError}</span>
                </div>
              )}

              <input
                id="issue-loc"
                type="text"
                required
                minLength={3}
                maxLength={255}
                placeholder="e.g. Opposite Metro Station Gate 2, Cross Road 14"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="form-input"
              />
              <span className="location-hint-text">
                GPS detection is optional for hotspot mapping. You may enter any landmark or street address manually.
              </span>
            </div>

            {/* Description */}
            <div className="form-group">
              <label htmlFor="issue-desc" className="form-label">
                Detailed Description <span className="req">*</span>
              </label>
              <textarea
                id="issue-desc"
                required
                minLength={10}
                rows={4}
                placeholder="Describe the severity, physical dimensions, hazards, traffic impact, or any safety concerns..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-textarea"
              />
            </div>

            {/* Photo Upload */}
            <div className="form-group">
              <label className="form-label">
                Photo Evidence <span className="optional">(Optional &mdash; JPEG, PNG, WebP up to 5 MB)</span>
              </label>

              {!previewUrl ? (
                <div
                  className="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={32} className="upload-icon" />
                  <div className="upload-text">
                    <span className="upload-browse">Click to upload photo evidence</span>
                    <span className="upload-hint">Gemini vision inspects damage severity directly</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    aria-label="Upload photo evidence"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="hidden-file-input"
                  />
                </div>
              ) : (
                <div className="preview-container">
                  <img src={previewUrl} alt="Complaint preview" className="preview-thumbnail" />
                  <div className="preview-info">
                    <span className="preview-filename">{selectedFile?.name}</span>
                    <span className="preview-filesize">
                      {(selectedFile?.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="preview-remove-btn"
                    title="Remove image"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="form-submit-row">
              <button
                type="submit"
                disabled={loading}
                className="submit-btn"
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="spin-icon" />
                    <span>Analyzing with Gemini AI &amp; Filing...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Complaint</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
