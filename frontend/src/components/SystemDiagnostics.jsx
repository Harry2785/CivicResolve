import { useState, useEffect } from 'react'
import { getApiUrl, API_BASE_URL } from '../config/api'
import { useAuth } from '../context/AuthContext'
import {
  Globe,
  Server,
  Database,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Zap
} from 'lucide-react'

export default function SystemDiagnostics() {
  const { isAdmin, getAuthHeaders } = useAuth()
  const [healthData, setHealthData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [testingGemini, setTestingGemini] = useState(false)
  const [error, setError] = useState(null)
  const [lastChecked, setLastChecked] = useState(null)

  const fetchHealth = async (testGeminiLive = false) => {
    if (testGeminiLive) {
      setTestingGemini(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const endpoint = testGeminiLive ? '/api/health?test_gemini=true' : '/api/health'
      const headers = testGeminiLive ? await getAuthHeaders() : {}
      const response = await fetch(getApiUrl(endpoint), { headers })
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status} (${response.statusText || 'Error'})`)
      }
      const data = await response.json()
      setHealthData(data)
      setLastChecked(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('Health check failed:', err)
      setError(err.message || 'Failed to connect to backend API')
    } finally {
      setLoading(false)
      setTestingGemini(false)
    }
  }

  useEffect(() => {
    fetchHealth(false)
  }, [])

  const isHealthy = healthData?.status === 'healthy'
  const isDbConnected = healthData?.database === 'connected'

  return (
    <div className="diagnostics-page-container">
      <div className="diag-page-header">
        <div className="diag-badge">Developer &amp; Infrastructure Portal</div>
        <h2 className="diag-heading">System Infrastructure &amp; API Health</h2>
        <p className="diag-sub">
          Detailed diagnostics for the CivicResolve Vercel API gateway, Neon PostgreSQL database connectivity, and Gemini AI integration.
        </p>
        <div className="diag-actions">
          <button onClick={() => fetchHealth(false)} disabled={loading || testingGemini} className="btn-primary">
            <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
            <span>Re-test Diagnostics</span>
          </button>
          <button
            onClick={() => fetchHealth(true)}
            disabled={loading || testingGemini || !healthData?.gemini_configured || !isAdmin}
            className="btn-secondary"
            title="Send live generation request to Gemini to verify real-time API response"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.9rem', fontSize: '0.85rem' }}
          >
            <Zap size={14} className={testingGemini ? 'spin-icon' : ''} />
            <span>{testingGemini ? 'Testing Gemini...' : 'Verify Live Gemini Ping'}</span>
          </button>
          {lastChecked && <span className="last-checked">Last checked: {lastChecked}</span>}
        </div>
      </div>

      {/* Grid */}
      <div className="grid-section">
        {/* Frontend Gateway */}
        <div className="card">
          <div className="card-icon card-icon-green">
            <Globe size={22} />
          </div>
          <h3 className="card-title">Frontend Gateway</h3>
          <p className="card-subtitle">React 19 + Vite</p>
          <div className="card-meta">
            <span className="tag">Vercel Edge</span>
            <span className="tag">{API_BASE_URL ? 'Custom API URL' : 'Same-Origin /api'}</span>
          </div>
          <p className="card-status status-ok">
            <CheckCircle2 size={16} /> Operational
          </p>
        </div>

        {/* Backend API */}
        <div className="card">
          <div className="card-icon card-icon-blue">
            <Server size={22} />
          </div>
          <h3 className="card-title">Backend API</h3>
          <p className="card-subtitle">{healthData?.runtime || 'Vercel Serverless'}</p>
          <div className="card-meta">
            <span className="tag">{API_BASE_URL ? 'Remote Host' : 'Vercel Serverless'}</span>
            <span className="tag" title={getApiUrl('/api/health')}>{isHealthy ? 'HTTP 200 OK' : 'GET /api/health'}</span>
          </div>
          <p className={`card-status ${isHealthy ? 'status-ok' : 'status-err'}`}>
            {isHealthy ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {isHealthy ? 'Reachable & Responding' : 'Not Connected'}
          </p>
        </div>

        {/* Civic Database */}
        <div className="card">
          <div className="card-icon card-icon-purple">
            <Database size={22} />
          </div>
          <h3 className="card-title">Civic Database</h3>
          <p className="card-subtitle">{healthData?.database_type || 'Neon PostgreSQL'}</p>
          <div className="card-meta">
            <span className="tag">{healthData?.database_type?.includes('PostgreSQL') ? 'PostgreSQL' : 'SQLite'}</span>
            <span className="tag">{isDbConnected ? 'Pool Ready' : 'Connecting'}</span>
          </div>
          <p className={`card-status ${isDbConnected ? 'status-ok' : 'status-err'}`}>
            {isDbConnected ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {isDbConnected ? 'Connected (Verified)' : 'Disconnected'}
          </p>
        </div>

        {/* AI Engine */}
        <div className="card">
          <div className="card-icon card-icon-amber">
            <Cpu size={22} />
          </div>
          <h3 className="card-title">AI Engine</h3>
          <p className="card-subtitle">{healthData?.gemini_model || 'gemini-2.5-flash'}</p>
          <div className="card-meta">
            <span className="tag">{healthData?.gemini_configured ? 'Key Configured' : 'Fallback Engine'}</span>
            {healthData?.gemini_test_status && (
              <span className="tag">{healthData?.gemini_responding ? 'Ping Verified' : 'Ping Failed'}</span>
            )}
          </div>
          <p className={`card-status ${healthData?.gemini_configured ? 'status-ok' : 'status-warn'}`}>
            <CheckCircle2 size={16} />{' '}
            {healthData?.gemini_responding
              ? 'Live Gemini (Responding)'
              : (healthData?.gemini_configured ? 'Live Gemini Configured' : 'Fallback Engine Ready')}
          </p>
        </div>
      </div>

      {/* Raw JSON */}
      <div className="diagnostics-card">
        <div className="diagnostics-header">
          <h3>Live Diagnostic JSON Payload</h3>
          <code>{getApiUrl('/api/health')}</code>
        </div>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <div>
              <span>{error}</span>
              <div style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: '2px' }}>
                Attempted target: <code>{getApiUrl('/api/health')}</code>
              </div>
            </div>
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
