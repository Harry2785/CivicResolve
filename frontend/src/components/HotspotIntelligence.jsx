import { useState, useEffect, useRef, useMemo } from 'react'
import { getApiUrl } from '../config/api'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapPin,
  Flame,
  AlertTriangle,
  Layers,
  Filter,
  RefreshCw,
  Clock,
  Building2,
  CheckCircle2,
  Eye,
  Sparkles,
  AlertOctagon,
  ChevronRight,
  X,
  Compass,
  Info,
  Sliders,
  ExternalLink
} from 'lucide-react'

// Fix default Leaflet icon assets
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: null,
  iconUrl: null,
  shadowUrl: null
})

const PRIORITY_COLORS = {
  Critical: '#ef4444',
  High: '#f59e0b',
  Medium: '#38bdf8',
  Low: '#94a3b8'
}

export default function HotspotIntelligence({ getAuthHeaders, onInspectComplaint }) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)
  const clustersLayerRef = useRef(null)
  const heatmapLayerRef = useRef(null)

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // View & Filters
  const [viewMode, setViewMode] = useState('clusters') // 'clusters' | 'heatmap'
  const [radiusMeters, setRadiusMeters] = useState(500)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')

  // Selected Cluster for Detail Drawer
  const [selectedCluster, setSelectedCluster] = useState(null)

  // Fetch Hotspot Data
  const fetchHotspots = async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const params = new URLSearchParams({
        radius_meters: radiusMeters.toString()
      })
      if (categoryFilter) params.append('category', categoryFilter)
      if (statusFilter) params.append('status', statusFilter)
      if (priorityFilter) params.append('priority', priorityFilter)
      if (departmentFilter) params.append('department', departmentFilter)

      const res = await fetch(getApiUrl(`/api/analytics/hotspots?${params.toString()}`), { headers })

      if (res.status === 401 || res.status === 403) {
        setError('Administrator authorization required to view geographic hotspot intelligence.')
        return
      }

      if (!res.ok) {
        throw new Error('Failed to retrieve hotspot intelligence from municipal service.')
      }

      const result = await res.json()
      setData(result)
      setLastRefreshed(new Date())

      // If a cluster was selected, keep it updated
      if (selectedCluster && result.hotspots) {
        const updated = result.hotspots.find((h) => h.id === selectedCluster.id)
        if (updated) setSelectedCluster(updated)
      }
    } catch (err) {
      console.error('Failed to load hotspots:', err)
      setError(err.message || 'Error loading hotspot intelligence.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHotspots()
  }, [radiusMeters, categoryFilter, statusFilter, priorityFilter, departmentFilter])

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946], // Default center
      zoom: 13,
      zoomControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | CivicResolve Municipal GIS',
      maxZoom: 19
    }).addTo(map)

    clustersLayerRef.current = L.layerGroup().addTo(map)
    heatmapLayerRef.current = L.layerGroup().addTo(map)
    markersLayerRef.current = L.layerGroup().addTo(map)

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Create custom HTML marker icon
  const createPinIcon = (priority, isCritical) => {
    const color = PRIORITY_COLORS[priority] || '#38bdf8'
    const pulseHtml = isCritical ? '<div class="pin-pulse-ring"></div>' : ''
    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div class="pin-marker-wrapper">
          ${pulseHtml}
          <div class="pin-dot" style="background-color: ${color}; border: 2px solid #ffffff; box-shadow: 0 0 8px ${color}">
            <span class="pin-inner-dot"></span>
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14]
    })
  }

  // Update Map Layers whenever data or viewMode changes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !data) return

    // Clear existing layers
    markersLayerRef.current?.clearLayers()
    clustersLayerRef.current?.clearLayers()
    heatmapLayerRef.current?.clearLayers()

    const allCoords = []

    // 1. Render Cluster Perimeter Overlays
    if (viewMode === 'clusters' && data.hotspots) {
      data.hotspots.forEach((cluster) => {
        const isHazard = cluster.has_critical_hazard
        const circleColor = isHazard ? '#ef4444' : '#f59e0b'
        const fillColor = isHazard ? '#ef4444' : '#38bdf8'

        const circle = L.circle([cluster.center_latitude, cluster.center_longitude], {
          radius: cluster.radius_meters || radiusMeters,
          color: circleColor,
          fillColor: fillColor,
          fillOpacity: isHazard ? 0.22 : 0.14,
          weight: isHazard ? 2.5 : 1.5,
          dashArray: isHazard ? '4, 4' : null
        })

        circle.on('click', () => {
          setSelectedCluster(cluster)
          map.setView([cluster.center_latitude, cluster.center_longitude], 15, { animate: true })
        })

        circle.bindTooltip(
          `<strong>${cluster.id}: ${cluster.name}</strong><br/>` +
            `<span>${cluster.complaint_count} complaints (${cluster.dominant_category})</span>` +
            (isHazard ? `<br/><span style="color:#ef4444;font-weight:bold;">⚠️ CRITICAL HAZARD ACTIVE</span>` : ''),
          { direction: 'top', offset: [0, -10] }
        )

        circle.addTo(clustersLayerRef.current)
      })
    }

    // 2. Render Heatmap Density Layer
    if (viewMode === 'heatmap' && data.heatmap_points) {
      data.heatmap_points.forEach(([lat, lng, weight]) => {
        allCoords.push([lat, lng])
        const fillColor = weight >= 0.8 ? '#ef4444' : weight >= 0.5 ? '#f59e0b' : '#38bdf8'

        L.circle([lat, lng], {
          radius: radiusMeters * 0.75,
          stroke: false,
          fillColor: fillColor,
          fillOpacity: Math.min(weight * 0.45, 0.6)
        }).addTo(heatmapLayerRef.current)
      })
    }

    // 3. Render Individual Complaint Pins (Both from clusters and isolated)
    const complaintsToRender = []
    if (data.hotspots) {
      data.hotspots.forEach((h) => {
        h.complaints.forEach((c) => complaintsToRender.push(c))
      })
    }
    if (data.isolated_complaints) {
      data.isolated_complaints.forEach((c) => complaintsToRender.push(c))
    }

    complaintsToRender.forEach((issue) => {
      if (issue.latitude && issue.longitude) {
        allCoords.push([issue.latitude, issue.longitude])
        const isCritical = issue.priority === 'Critical'
        const icon = createPinIcon(issue.priority, isCritical)

        const marker = L.marker([issue.latitude, issue.longitude], { icon })

        // Popup Content
        const popupContent = document.createElement('div')
        popupContent.className = 'map-popup-card'
        popupContent.innerHTML = `
          <div class="popup-header">
            <span class="popup-tracking">${issue.tracking_id}</span>
            <span class="popup-priority pill-${(issue.priority || 'medium').toLowerCase()}">${issue.priority}</span>
          </div>
          <h5 class="popup-title">${issue.title}</h5>
          <p class="popup-meta"><strong>Category:</strong> ${issue.citizen_category || issue.ai_category || 'N/A'}</p>
          <p class="popup-meta"><strong>Status:</strong> ${issue.status || 'Reported'}</p>
          <p class="popup-meta"><strong>Dept:</strong> ${issue.recommended_department || 'General'}</p>
          <p class="popup-location"><span class="icon-loc">📍</span> ${issue.location || 'Reported Location'}</p>
        `

        const inspectBtn = document.createElement('button')
        inspectBtn.className = 'popup-inspect-btn'
        inspectBtn.innerHTML = `<span>Inspect in Triage</span>`
        inspectBtn.onclick = () => {
          if (onInspectComplaint) onInspectComplaint(issue.id)
        }
        popupContent.appendChild(inspectBtn)

        marker.bindPopup(popupContent, { maxWidth: 300 })
        marker.addTo(markersLayerRef.current)
      }
    })

    // Fit map bounds to encompass all valid coordinates
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [data, viewMode, radiusMeters])

  // Center map on a specific cluster
  const handleSelectCluster = (cluster) => {
    setSelectedCluster(cluster)
    if (mapInstanceRef.current && cluster.center_latitude && cluster.center_longitude) {
      mapInstanceRef.current.setView([cluster.center_latitude, cluster.center_longitude], 15, {
        animate: true
      })
    }
  }

  return (
    <div className="hotspot-module-container">
      {/* Module Command Header */}
      <div className="hotspot-header">
        <div className="hotspot-header-left">
          <div className="hotspot-badge">
            <Flame size={15} className="text-rose" />
            <span>Spatial Intelligence &amp; GIS Hotspots</span>
          </div>
          <h2>Geographic Civic Issue Hotspot Intelligence</h2>
          <p>
            Distance-based spatial clustering (Haversine algorithm) identifying recurring civic grievances and public hazard zones across municipal jurisdiction.
          </p>
        </div>

        <div className="hotspot-header-actions">
          {/* Heatmap vs Cluster View Toggle */}
          <div className="view-mode-toggle">
            <button
              onClick={() => setViewMode('clusters')}
              className={`mode-btn ${viewMode === 'clusters' ? 'active' : ''}`}
            >
              <Layers size={14} />
              <span>Clusters</span>
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`mode-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
            >
              <Flame size={14} />
              <span>Heatmap</span>
            </button>
          </div>

          <button
            onClick={fetchHotspots}
            disabled={loading}
            className="btn-modern-refresh"
            title="Refresh spatial clusters"
          >
            <RefreshCw size={15} className={loading ? 'spin-icon text-sky' : ''} />
            <span>{loading ? 'Clustering...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-alert-banner alert-error">
          <AlertOctagon size={20} />
          <div className="alert-content">
            <strong>Hotspot Intelligence Notice:</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Non-Geocoded Notice Banner */}
      {data && data.total_non_geocoded_complaints > 0 && (
        <div className="non-geocoded-notice-banner">
          <Info size={18} className="text-sky flex-shrink-0" />
          <div className="notice-text">
            <strong>Cartographic Integrity Notice:</strong>
            <span>
              {data.total_non_geocoded_complaints} complaint{data.total_non_geocoded_complaints > 1 ? 's' : ''} have address text only without GPS coordinates and are safely excluded from spatial clustering to preserve cartographic accuracy.
            </span>
          </div>
          <span className="notice-stat-pill">
            {data.total_geocoded_complaints} Geocoded / {data.total_geocoded_complaints + data.total_non_geocoded_complaints} Total
          </span>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="hotspot-toolbar">
        <div className="toolbar-item">
          <Compass size={15} className="toolbar-icon" />
          <label htmlFor="hotspot-radius">Cluster Radius:</label>
          <select
            id="hotspot-radius"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            className="hotspot-select"
          >
            <option value="250">250 meters (Tight Micro-Zone)</option>
            <option value="500">500 meters (Standard Neighborhood)</option>
            <option value="1000">1,000 meters (1 km Ward Corridor)</option>
            <option value="2000">2,000 meters (2 km Sub-District)</option>
          </select>
        </div>

        <div className="toolbar-item">
          <Filter size={15} className="toolbar-icon" />
          <label htmlFor="hotspot-cat">Category:</label>
          <select
            id="hotspot-cat"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="hotspot-select"
          >
            <option value="">All Categories</option>
            <option value="Roads & Potholes">Roads &amp; Potholes</option>
            <option value="Sanitation & Waste">Sanitation &amp; Waste</option>
            <option value="Water & Drainage">Water &amp; Drainage</option>
            <option value="Streetlights & Electrical">Streetlights &amp; Electrical</option>
            <option value="Public Safety">Public Safety</option>
          </select>
        </div>

        <div className="toolbar-item">
          <label htmlFor="hotspot-priority">Priority:</label>
          <select
            id="hotspot-priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="hotspot-select"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical Severity</option>
            <option value="High">High Severity</option>
            <option value="Medium">Medium Severity</option>
            <option value="Low">Low Severity</option>
          </select>
        </div>

        <div className="toolbar-item">
          <label htmlFor="hotspot-dept">Department:</label>
          <select
            id="hotspot-dept"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="hotspot-select"
          >
            <option value="">All Departments</option>
            <option value="Roads & Highways Department">Roads &amp; Highways</option>
            <option value="Municipal Sanitation Wing">Sanitation Wing</option>
            <option value="Water Supply & Sewerage Board">Water &amp; Sewerage</option>
            <option value="Electrical & Streetlight Maintenance">Electrical &amp; Streetlights</option>
            <option value="Public Works & Safety">Public Works &amp; Safety</option>
            <option value="General Municipal Administration">General Administration</option>
          </select>
        </div>
      </div>

      {/* Main Layout: Map & Clusters Panel */}
      <div className="hotspot-stage-layout">
        {/* Map Container */}
        <div className="map-wrapper-card">
          <div ref={mapContainerRef} className="leaflet-map-canvas" style={{ minHeight: '560px', width: '100%' }}></div>

          {/* Map Legend Overlay */}
          <div className="map-legend-overlay">
            <span className="legend-title">Priority Legend</span>
            <div className="legend-items-row">
              <span className="legend-item">
                <span className="legend-dot bg-crimson pulse-dot"></span>
                <span>Critical (Hazard)</span>
              </span>
              <span className="legend-item">
                <span className="legend-dot bg-amber"></span>
                <span>High</span>
              </span>
              <span className="legend-item">
                <span className="legend-dot bg-sky"></span>
                <span>Medium</span>
              </span>
              <span className="legend-item">
                <span className="legend-dot bg-slate"></span>
                <span>Low</span>
              </span>
            </div>
          </div>
        </div>

        {/* Side Panel: Hotspots List & Cluster Inspector */}
        <div className="hotspot-sidebar-panel">
          <div className="sidebar-header">
            <div className="sidebar-header-title">
              <Layers size={18} className="text-sky" />
              <h4>Identified Hotspots ({data?.cluster_count ?? 0})</h4>
            </div>
            <span className="radius-tag">Span: {radiusMeters}m</span>
          </div>

          <div className="hotspot-clusters-list">
            {(!data?.hotspots || data.hotspots.length === 0) ? (
              <div className="empty-clusters-card">
                <Flame size={32} className="text-slate" />
                <h5>No Dense Clusters Detected</h5>
                <p>
                  No multi-complaint concentrations found within {radiusMeters}m radius with current filters. Individual isolated complaints are mapped with pins.
                </p>
              </div>
            ) : (
              data.hotspots.map((cluster) => {
                const isSelected = selectedCluster?.id === cluster.id
                return (
                  <div
                    key={cluster.id}
                    onClick={() => handleSelectCluster(cluster)}
                    className={`hotspot-cluster-card ${isSelected ? 'cluster-card-selected' : ''} ${
                      cluster.has_critical_hazard ? 'hazard-glow' : ''
                    }`}
                  >
                    <div className="cluster-top">
                      <div className="cluster-id-badge">
                        <span>{cluster.id}</span>
                      </div>
                      {cluster.has_critical_hazard && (
                        <span className="hazard-alert-pill">
                          <AlertTriangle size={12} />
                          Critical Hazard
                        </span>
                      )}
                      <span className="complaint-count-badge">
                        {cluster.complaint_count} issues
                      </span>
                    </div>

                    <h5 className="cluster-name">{cluster.name}</h5>

                    <div className="cluster-meta-row">
                      <span className="cluster-cat-pill">{cluster.dominant_category}</span>
                      <span className="cluster-open-stat text-amber">
                        {cluster.open_count} open / {cluster.resolved_count} resolved
                      </span>
                    </div>

                    <p className="cluster-recommendation-preview">
                      {cluster.ai_recommendation}
                    </p>

                    <div className="cluster-footer">
                      <span className="action-hint">Click to inspect cluster &amp; recommendations</span>
                      <ChevronRight size={15} className="arrow-icon" />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Hotspot Detail Drawer / Modal (When a cluster is selected) */}
      {selectedCluster && (
        <div className="cluster-detail-drawer">
          <div className="drawer-header">
            <div className="drawer-header-left">
              <div className="drawer-id-row">
                <span className="drawer-id-tag">{selectedCluster.id}</span>
                {selectedCluster.has_critical_hazard && (
                  <span className="hazard-alert-pill">
                    <AlertTriangle size={13} />
                    CRITICAL PUBLIC HAZARD
                  </span>
                )}
                <span className="drawer-category-pill">{selectedCluster.dominant_category}</span>
              </div>
              <h3 className="drawer-title">{selectedCluster.name}</h3>
              <p className="drawer-coords">
                Centroid: {selectedCluster.center_latitude.toFixed(5)}, {selectedCluster.center_longitude.toFixed(5)} &bull; Spatial Radius: {selectedCluster.radius_meters}m
              </p>
            </div>
            <button
              onClick={() => setSelectedCluster(null)}
              className="drawer-close-btn"
              title="Close cluster inspector"
            >
              <X size={20} />
            </button>
          </div>

          <div className="drawer-body">
            {/* Actionable Municipal Recommendation Card */}
            <div className="drawer-rec-card">
              <div className="rec-header">
                <Sparkles size={18} className="text-sky" />
                <h4>Actionable Municipal Recommendation</h4>
                <span className="rec-source-badge">{selectedCluster.recommendation_source.toUpperCase()}</span>
              </div>
              <p className="rec-text">{selectedCluster.ai_recommendation}</p>
            </div>

            {/* Cluster Metrics Grid */}
            <div className="drawer-metrics-grid">
              <div className="metric-box">
                <span className="metric-label">Total Grievances</span>
                <span className="metric-val">{selectedCluster.complaint_count}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Active / Unresolved</span>
                <span className="metric-val text-amber">{selectedCluster.open_count}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Resolved Issues</span>
                <span className="metric-val text-emerald">{selectedCluster.resolved_count}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Oldest Active Issue</span>
                <span className="metric-val text-sky">
                  {selectedCluster.oldest_unresolved_created_at
                    ? new Date(selectedCluster.oldest_unresolved_created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric'
                      })
                    : 'All Resolved'}
                </span>
              </div>
            </div>

            {/* Responsible Departments */}
            {selectedCluster.departments_involved && selectedCluster.departments_involved.length > 0 && (
              <div className="drawer-section">
                <h5>Responsible Municipal Wings</h5>
                <div className="dept-tags-row">
                  {selectedCluster.departments_involved.map((dept, idx) => (
                    <span key={idx} className="dept-chip">
                      <Building2 size={13} />
                      {dept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Member Complaints List */}
            <div className="drawer-section">
              <h5>Cluster Complaints ({selectedCluster.complaints.length})</h5>
              <div className="cluster-complaints-list">
                {selectedCluster.complaints.map((comp) => (
                  <div key={comp.id} className="cluster-complaint-row">
                    <div className="comp-left">
                      <div className="comp-meta">
                        <span className="comp-tracking">{comp.tracking_id}</span>
                        <span className={`pill-badge pill-${(comp.priority || 'medium').toLowerCase()}`}>
                          {comp.priority}
                        </span>
                        <span className={`pill-badge pill-status-${(comp.status || 'reported').toLowerCase().replace(' ', '-')}`}>
                          {comp.status}
                        </span>
                      </div>
                      <h6 className="comp-title">{comp.title}</h6>
                      <p className="comp-loc">📍 {comp.location}</p>
                    </div>

                    <div className="comp-right">
                      <button
                        onClick={() => {
                          if (onInspectComplaint) onInspectComplaint(comp.id)
                        }}
                        className="btn-inspect-small"
                        title="Open in Administrative Triage Drawer"
                      >
                        <Eye size={14} />
                        <span>Inspect</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
