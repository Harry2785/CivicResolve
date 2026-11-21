import { ShieldAlert, LogOut, Home, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function AccessDenied({ setCurrentView }) {
  const { user, logout } = useAuth()

  const handleSwitchToAdmin = async () => {
    await logout()
    setCurrentView('admin-login')
  }

  return (
    <div className="access-denied-container">
      <div className="access-denied-card">
        <div className="denied-icon-wrap">
          <ShieldAlert size={48} className="denied-icon" />
        </div>

        <span className="denied-badge">HTTP 403 &middot; Forbidden</span>
        <h1 className="denied-title">Access Denied</h1>
        <h2 className="denied-subtitle">Administrator Authorization Required</h2>

        <div className="denied-message-box">
          <p>
            You are currently signed in as:
          </p>
          <div className="denied-user-pill">
            <span className="denied-user-email">
              {user ? (user.email || user.phoneNumber || user.displayName) : 'Guest / Unverified User'}
            </span>
            <span className="role-tag-citizen">Role: Citizen</span>
          </div>
          <p className="denied-explanation">
            This area is restricted to approved municipal officials. Ordinary citizens and unauthorized Google accounts cannot view or modify civic administrative records.
          </p>
        </div>

        <div className="denied-actions">
          <button
            onClick={handleSwitchToAdmin}
            className="btn-switch-admin"
          >
            <KeyRound size={16} />
            <span>Sign In with Official Administrator Account</span>
          </button>

          <button
            onClick={() => setCurrentView('home')}
            className="btn-return-home"
          >
            <Home size={16} />
            <span>Return to Citizen Portal</span>
          </button>
        </div>

        <div className="denied-security-note">
          <span>Security Protocol: All unauthorized privilege escalation attempts are logged and rejected on the backend.</span>
        </div>
      </div>
    </div>
  )
}
