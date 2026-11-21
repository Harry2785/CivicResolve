import { useState, useEffect, useMemo } from 'react'
import { getApiUrl } from '../config/api'
import {
  Building2,
  TrendingUp,
  Award,
  AlertTriangle,
  Clock,
  CheckCircle2,
  BarChart3,
  Calendar,
  Filter,
  RefreshCw,
  AlertOctagon,
  Layers,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Info
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'

const PRIORITY_COLORS = {
  Critical: '#ef4444',
  High: '#f59e0b',
  Medium: '#38bdf8',
  Low: '#94a3b8'
}

const STATUS_COLORS = {
  Reported: '#f59e0b',
  'In Progress': '#38bdf8',
  Resolved: '#10b981'
}

// Custom Dark Theme Tooltip for Recharts
function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="analytics-custom-tooltip">
        <p className="tooltip-title">{label}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} className="tooltip-item" style={{ color: entry.color || '#38bdf8' }}>
            <span className="tooltip-label">{entry.name}:</span>{' '}
            <span className="tooltip-value">{entry.value}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function DepartmentAnalytics({ getAuthHeaders }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [trendsData, setTrendsData] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Filter states
  const [dateRange, setDateRange] = useState('all') // '7', '14', '30', '90', 'all'
  const [priorityFilter, setPriorityFilter] = useState('')
  const [selectedDept, setSelectedDept] = useState('all')

  const fetchAnalytics = async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()

      // Build query params
      const deptParams = new URLSearchParams()
      if (priorityFilter) deptParams.append('priority', priorityFilter)

      if (dateRange !== 'all') {
        const days = parseInt(dateRange, 10)
        const d = new Date()
        d.setDate(d.getDate() - days)
        deptParams.append('date_from', d.toISOString())
      }

      const trendDays = dateRange === 'all' ? '30' : dateRange
      const trendsParams = new URLSearchParams({ days: trendDays })

      const [deptRes, trendRes] = await Promise.all([
        fetch(getApiUrl(`/api/analytics/departments?${deptParams.toString()}`), { headers }),
        fetch(getApiUrl(`/api/analytics/trends?${trendsParams.toString()}`), { headers })
      ])

      if (deptRes.status === 401 || deptRes.status === 403 || trendRes.status === 401 || trendRes.status === 403) {
        setError('Administrator authentication required to view municipal analytics.')
        return
      }

      if (!deptRes.ok || !trendRes.ok) {
        throw new Error('Failed to retrieve analytics data from municipal backend.')
      }

      const deptData = await deptRes.json()
      const trends = await trendRes.json()

      setData(deptData)
      setTrendsData(trends)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Analytics load error:', err)
      setError(err.message || 'Error loading analytics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [dateRange, priorityFilter])

  // Prepared data for charts
  const departmentVolumeData = useMemo(() => {
    if (!data?.departments) return []
    return data.departments.map((d) => ({
      name: d.department_name.replace(' Department', '').replace(' Wing', '').replace(' Board', ''),
      fullName: d.department_name,
      total: d.total_assigned,
      reported: d.reported,
      inProgress: d.in_progress,
      resolved: d.resolved,
      overdue: d.overdue,
      resolutionRate: d.resolution_rate,
      withinSlaRate: d.within_sla_rate,
      avgHours: d.avg_resolution_hours ? Math.round(d.avg_resolution_hours * 10) / 10 : 0
    }))
  }, [data])

  const filteredDepts = useMemo(() => {
    if (!data?.departments) return []
    if (selectedDept === 'all') return data.departments
    return data.departments.filter((d) => d.department_name === selectedDept)
  }, [data, selectedDept])

  const priorityPieData = useMemo(() => {
    if (!trendsData?.priority_distribution) return []
    return Object.entries(trendsData.priority_distribution)
      .filter(([_, count]) => count > 0)
      .map(([priority, count]) => ({
        name: priority,
        value: count,
        color: PRIORITY_COLORS[priority] || '#94a3b8'
      }))
  }, [trendsData])

  const trendsChartData = useMemo(() => {
    if (!trendsData?.trends) return []
    return trendsData.trends.map((t) => ({
      date: t.date.slice(5), // MM-DD
      fullDate: t.date,
      received: t.received,
      resolved: t.resolved,
      inProgress: t.in_progress
    }))
  }, [trendsData])

  return (
    <div className="analytics-dashboard-container">
      {/* Analytics Command Header */}
      <div className="analytics-header">
        <div className="analytics-header-title">
          <div className="analytics-sub-badge">
            <BarChart3 size={15} className="text-sky" />
            <span>Operational Intelligence</span>
          </div>
          <h2>Department Performance &amp; SLA Compliance</h2>
          <p>
            Real-time municipal performance metrics, resolution rates, and SLA benchmarks calculated from actual SQLite database records.
          </p>
        </div>

        <div className="analytics-header-actions">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="btn-modern-refresh"
            title="Refresh analytics data"
          >
            <RefreshCw size={15} className={loading ? 'spin-icon text-sky' : ''} />
            <span>{loading ? 'Recalculating...' : 'Refresh'}</span>
          </button>
          <div className="last-sync-badge">
            <Clock size={12} />
            <span>Synced {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="admin-alert-banner alert-error">
          <AlertOctagon size={20} />
          <div className="alert-content">
            <strong>Analytics Notice:</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Global Filter Bar */}
      <div className="analytics-filter-toolbar">
        <div className="filter-group-item">
          <Calendar size={15} className="filter-icon" />
          <label htmlFor="analytics-date-range">Date Range:</label>
          <select
            id="analytics-date-range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="analytics-select"
          >
            <option value="all">All Historical Records</option>
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>

        <div className="filter-group-item">
          <Filter size={15} className="filter-icon" />
          <label htmlFor="analytics-priority">Priority Filter:</label>
          <select
            id="analytics-priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="analytics-select"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical Only</option>
            <option value="High">High Only</option>
            <option value="Medium">Medium Only</option>
            <option value="Low">Low Only</option>
          </select>
        </div>

        <div className="filter-group-item">
          <Building2 size={15} className="filter-icon" />
          <label htmlFor="analytics-dept">Focus Department:</label>
          <select
            id="analytics-dept"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="analytics-select"
          >
            <option value="all">All Departments (Comparative View)</option>
            {data?.departments?.map((d) => (
              <option key={d.department_name} value={d.department_name}>
                {d.department_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Executive Municipal Summary Strip */}
      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Total Assigned Complaints</span>
            <div className="kpi-icon-wrap icon-neutral">
              <Layers size={18} />
            </div>
          </div>
          <div className="kpi-value">{data?.summary?.total_complaints ?? 0}</div>
          <div className="kpi-footer">
            <span className="kpi-hint">Across all 6 municipal wings</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Overall Resolution Rate</span>
            <div className="kpi-icon-wrap icon-emerald">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="kpi-value text-emerald">
            {data?.summary?.overall_resolution_rate ?? 0}%
          </div>
          <div className="kpi-footer">
            <div className="kpi-progress-bar">
              <div
                className="kpi-progress-fill bg-emerald"
                style={{ width: `${Math.min(data?.summary?.overall_resolution_rate ?? 0, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">SLA Target Compliance</span>
            <div className="kpi-icon-wrap icon-blue">
              <Clock size={18} />
            </div>
          </div>
          <div className="kpi-value text-blue">
            {data?.summary?.overall_sla_compliance_rate ?? 0}%
          </div>
          <div className="kpi-footer">
            <span className="kpi-hint text-blue">Resolved within target hours</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Overdue Backlog</span>
            <div className={`kpi-icon-wrap ${(data?.summary?.total_overdue ?? 0) > 0 ? 'icon-crimson' : 'icon-neutral'}`}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className={`kpi-value ${(data?.summary?.total_overdue ?? 0) > 0 ? 'text-crimson' : 'text-slate'}`}>
            {data?.summary?.total_overdue ?? 0}
          </div>
          <div className="kpi-footer">
            <span className="kpi-hint text-crimson">Exceeded priority SLA limit</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Top Performer</span>
            <div className="kpi-icon-wrap icon-amber">
              <Award size={18} />
            </div>
          </div>
          <div className="kpi-value-text text-amber" title={data?.summary?.top_performing_department || 'None'}>
            {data?.summary?.top_performing_department
              ? data.summary.top_performing_department.replace(' Department', '').replace(' Wing', '')
              : 'Evaluating'}
          </div>
          <div className="kpi-footer">
            <span className="kpi-hint">Highest composite resolution score</span>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Largest Backlog</span>
            <div className="kpi-icon-wrap icon-rose">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="kpi-value-text text-rose" title={data?.summary?.highest_backlog_department || 'None'}>
            {data?.summary?.highest_backlog_department
              ? data.summary.highest_backlog_department.replace(' Department', '').replace(' Wing', '')
              : 'None (Balanced)'}
          </div>
          <div className="kpi-footer">
            <span className="kpi-hint">Highest active unaddressed volume</span>
          </div>
        </div>
      </div>

      {/* Performance Insights Intelligence Strip */}
      {data?.insights && data.insights.length > 0 && (
        <div className="analytics-insights-card">
          <div className="insights-header">
            <div className="insights-header-left">
              <Sparkles size={18} className="text-sky" />
              <h4>Municipal Performance Insights</h4>
            </div>
            <span className="insights-badge">Deterministic Grounded Analytics</span>
          </div>
          <div className="insights-grid">
            {data.insights.map((insight, idx) => (
              <div key={idx} className="insight-item">
                <span className="insight-bullet"></span>
                <p>{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Charts Grid */}
      <div className="analytics-charts-grid">
        {/* Chart 1: Total Volume by Department */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <h4>Complaints Received by Department</h4>
              <p>Total volume of civic grievances assigned to each municipal wing</p>
            </div>
          </div>
          <div className="chart-body" style={{ height: 320, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={departmentVolumeData}
                margin={{ top: 20, right: 30, left: 10, bottom: 65 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Total Assigned" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Stacked Status by Department */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <h4>Complaint Lifecycle by Department</h4>
              <p>Comparison of Reported, In Progress, and Resolved complaints</p>
            </div>
          </div>
          <div className="chart-body" style={{ height: 320, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={departmentVolumeData}
                margin={{ top: 20, right: 30, left: 10, bottom: 65 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  fontSize={12}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="reported" name="Reported" stackId="a" fill={STATUS_COLORS.Reported} />
                <Bar dataKey="inProgress" name="In Progress" stackId="a" fill={STATUS_COLORS['In Progress']} />
                <Bar dataKey="resolved" name="Resolved" stackId="a" fill={STATUS_COLORS.Resolved} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Department Resolution Rates & SLA Compliance */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <h4>Resolution Rate &amp; SLA Compliance (%)</h4>
              <p>Percentage of assigned issues resolved and completed within SLA</p>
            </div>
          </div>
          <div className="chart-body" style={{ height: 320, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={departmentVolumeData}
                margin={{ top: 20, right: 30, left: 70, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={12} unit="%" />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="resolutionRate" name="Resolution Rate (%)" fill="#10b981" radius={[0, 4, 4, 0]} />
                <Bar dataKey="withinSlaRate" name="Within SLA (%)" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Complaint Trends Over Time */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <h4>Complaint Trends Over Time</h4>
              <p>Daily volume of incoming versus resolved municipal issues</p>
            </div>
          </div>
          <div className="chart-body" style={{ height: 320, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trendsChartData}
                margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" height={36} />
                <Line
                  type="monotone"
                  dataKey="received"
                  name="Received"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Priority Distribution Donut */}
        <div className="chart-card chart-card-compact">
          <div className="chart-header">
            <div className="chart-title-wrap">
              <h4>Priority Distribution</h4>
              <p>Breakdown across Critical, High, Medium, and Low severity</p>
            </div>
          </div>
          <div className="chart-body flex-center" style={{ height: 320, width: '100%' }}>
            {priorityPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {priorityPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart-notice">
                <Info size={24} className="text-slate" />
                <p>No complaints match current priority filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comprehensive Department Performance Rankings & Comparison Table */}
      <div className="analytics-table-card">
        <div className="analytics-table-header">
          <div className="table-header-left">
            <Building2 size={20} className="text-sky" />
            <div>
              <h3>Department Performance Rankings &amp; SLA Breakdown</h3>
              <p>Comparative municipal scorecard ranking efficiency, backlog management, and resolution speed</p>
            </div>
          </div>
          <span className="table-badge">{filteredDepts.length} Departments Tracked</span>
        </div>

        <div className="table-responsive">
          <table className="admin-table analytics-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Rank</th>
                <th>Department</th>
                <th>Assigned</th>
                <th>Reported</th>
                <th>In Progress</th>
                <th>Resolved</th>
                <th>Overdue</th>
                <th>Avg Resolution</th>
                <th>Resolution Rate</th>
                <th>SLA Compliance</th>
              </tr>
            </thead>
            <tbody>
              {filteredDepts.map((dept) => {
                const rank = dept.performance_rank
                const rankMedal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
                return (
                  <tr
                    key={dept.department_name}
                    className={selectedDept === dept.department_name ? 'row-highlighted' : ''}
                  >
                    <td className="rank-cell">
                      <span className={`rank-badge rank-${rank}`}>{rankMedal}</span>
                    </td>
                    <td className="dept-name-cell">
                      <strong>{dept.department_name}</strong>
                      <div className="dept-sub-pills">
                        {dept.critical_count > 0 && (
                          <span className="pill-badge pill-critical">
                            {dept.critical_count} Critical
                          </span>
                        )}
                        {dept.high_count > 0 && (
                          <span className="pill-badge pill-high">
                            {dept.high_count} High
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="stat-pill">{dept.total_assigned}</span>
                    </td>
                    <td>
                      <span className="text-amber font-semibold">{dept.reported}</span>
                    </td>
                    <td>
                      <span className="text-blue font-semibold">{dept.in_progress}</span>
                    </td>
                    <td>
                      <span className="text-emerald font-semibold">{dept.resolved}</span>
                    </td>
                    <td>
                      {dept.overdue > 0 ? (
                        <span className="overdue-tag">
                          <AlertTriangle size={12} />
                          {dept.overdue}
                        </span>
                      ) : (
                        <span className="text-slate-muted">0</span>
                      )}
                    </td>
                    <td>
                      {dept.avg_resolution_hours !== null && dept.avg_resolution_hours !== undefined ? (
                        <span className="duration-pill">
                          <Clock size={12} />
                          {dept.avg_resolution_hours.toFixed(1)} hrs
                        </span>
                      ) : (
                        <span className="text-slate-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="rate-cell">
                        <span className="rate-text">{dept.resolution_rate}%</span>
                        <div className="table-meter-bar">
                          <div
                            className="table-meter-fill bg-emerald"
                            style={{ width: `${Math.min(dept.resolution_rate, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="rate-cell">
                        <span className="rate-text">{dept.within_sla_rate}%</span>
                        <div className="table-meter-bar">
                          <div
                            className="table-meter-fill bg-indigo"
                            style={{ width: `${Math.min(dept.within_sla_rate, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
