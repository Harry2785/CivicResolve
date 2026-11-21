import { useState, useEffect } from 'react'
import { getApiUrl } from '../config/api'
import {
  Globe,
  Server,
  Database,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Radio
} from 'lucide-react'

export default function SystemDiagnostics() {
  const [healthData, setHealthData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastChecked, setLastChecked] = useState(null)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(getApiUrl('/api/health'))
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`)
      }
      const data = await response.json()
      setHealthData(data)
      setLastChecked(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Health check failed:', err)
      setError(err.message || 'Failed to connect to backend API')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  const isHealthy = healthData?.status === 'healthy'

  return (
    <div className="diagnostics-page-container">
      <div className="diag-page-header">
        <div className="diag-badge">Developer &amp; Infrastructure Portal</div>
        <h2 className="diag-heading">System Infrastructure &amp; API Health</h2>
        <p className="diag-sub">
          Detailed diagnostics for the CivicResolve API gateway, SQLite database connectivity, and Gemini AI integration.
        </p>
        <div className="diag-actions">
          <button onClick={fetchHealth} disabled={loading} className="btn-primary">
            <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
            <span>Re-test Diagnostics</span>
          </button>
          {lastChecked && <span className="last-checked">Last checked: {lastChecked}</span>}
        </div>
      </div>

      {/* Grid */}
      <div className="grid-section">
        <div className="card">
          <div className="card-icon card-icon-green">
            <Globe size={22} />
          </div>
          <h3 className="card-title">Frontend Gateway</h3>
          <p className="card-subtitle">React 19 + Vite HMR</p>
          <div className="card-meta">
            <span className="tag">Port 5173</span>
            <span className="tag">Proxy: /api &rarr; :8000</span>
          </div>
          <p className="card-status status-ok">
            <CheckCircle2 size={16} /> Operational
          </p>
        </div>

        <div className="card">
          <div className="card-icon card-icon-blue">
            <Server size={22} />
          </div>
          <h3 className="card-title">Backend API</h3>
          <p className="card-subtitle">Python 3.9 + FastAPI</p>
          <div className="card-meta">
            <span className="tag">Port 8000</span>
            <span className="tag">GET /api/health</span>
          </div>
          <p className={`card-status ${isHealthy ? 'status-ok' : 'status-err'}`}>
            {isHealthy ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {isHealthy ? 'Healthy & Responding' : 'Not Connected'}
          </p>
        </div>

        <div className="card">
          <div className="card-icon card-icon-purple">
            <Database size={22} />
          </div>
          <h3 className="card-title">Civic Database</h3>
          <p className="card-subtitle">SQLite via SQLAlchemy</p>
          <div className="card-meta">
            <span className="tag">civicresolve.db</span>
            <span className="tag">Issues Table</span>
          </div>
          <p className={`card-status ${healthData?.database === 'connected' ? 'status-ok' : 'status-err'}`}>
            {healthData?.database === 'connected' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {healthData?.database === 'connected' ? 'Connected (Verified)' : 'Waiting...'}
          </p>
        </div>

        <div className="card">
          <div className="card-icon card-icon-amber">
            <Cpu size={22} />
          </div>
          <h3 className="card-title">AI Engine</h3>
          <p className="card-subtitle">Google Gemini Flash</p>
          <div className="card-meta">
            <span className="tag">{healthData?.gemini_model || 'gemini-2.5-flash'}</span>
            <span className="tag">{healthData?.gemini_configured ? 'API Key Active' : 'Fallback Engine Active'}</span>
          </div>
          <p className="card-status status-ok">
            <CheckCircle2 size={16} /> {healthData?.gemini_configured ? 'Live Gemini' : 'Fallback Ready'}
          </p>
        </div>
      </div>

      {/* Raw JSON */}
      <div className="diagnostics-card">
        <div className="diagnostics-header">
          <h3>Live Diagnostic JSON Payload</h3>
          <code>GET /api/health</code>
        </div>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {healthData && (
          <pre className="json-output">
            {JSON.stringify(healthData, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
