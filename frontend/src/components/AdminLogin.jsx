import { useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  ArrowRight,
  Loader2,
  ArrowLeft,
  KeyRound,
  FileCheck2,
  Lock
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function AdminLogin({ setCurrentView }) {
  const {
    user,
    isAdmin,
    adminProfile,
    adminError,
    clearError,
    loginAsAdmin,
    loginWithTestAdmin,
    isConfigured,
    logout
  } = useAuth()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  const handleAdminGoogleLogin = async () => {
    setLocalError(null)
    clearError()

    try {
      setIsSubmitting(true)
      await loginAsAdmin()
      // If authorization succeeds, redirect to the Admin Portal
      setCurrentView('admin')
    } catch (err) {
      setLocalError(err.message || 'Access Denied: Account is not an authorized municipal administrator.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTestAdminLogin = async () => {
    setLocalError(null)
    clearError()

    try {
      setIsSubmitting(true)
      await loginWithTestAdmin('shrihari0877@gmail.com')
      setCurrentView('admin')
    } catch (err) {
      setLocalError(err.message || 'Access Denied: Account is not an authorized municipal administrator.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page-container admin-theme-bg">
      <div className="admin-login-card">
        {/* Official Header */}
        <div className="admin-login-header">
          <div className="official-emblem-wrap">
            <ShieldAlert size={36} className="official-icon" />
          </div>
          <span className="official-tag">Municipal Administration Gateway</span>
          <h1 className="admin-login-title">Official Administrator Access</h1>
          <p className="admin-login-subtitle">
            Restricted portal for verified municipal departments, public works supervisors, and civic dispatch officers.
          </p>
        </div>

        {/* Security Warning Callout */}
        <div className="restricted-warning-callout">
          <Lock size={16} className="warning-icon" />
          <div>
            <strong>Restricted Access Notice:</strong>
            <p>
              This portal requires an approved municipal administrator account. Access is restricted to pre-authorized official email addresses configured in the backend directory. Public registration is strictly disabled.
            </p>
          </div>
        </div>

        {/* Rejection / Error Alert */}
        {(localError || adminError) && (
          <div className="admin-auth-error-banner">
            <AlertOctagon size={20} className="error-oct-icon" />
            <div className="error-body">
              <strong>Authorization Rejected:</strong>
              <p>{localError || adminError}</p>
              <div className="rejection-hint">
                Signed in with an unauthorized account? Try again using your official government or municipal email address.
              </div>
            </div>
          </div>
        )}

        {/* If user is already verified admin */}
        {isAdmin && adminProfile ? (
          <div className="already-admin-box">
            <ShieldCheck size={26} className="text-emerald" />
            <div>
              <h4>Administrator Verified</h4>
              <p className="admin-email-text">{adminProfile.email}</p>
              <span className="verified-badge-pill">Role: Municipal Administrator</span>
            </div>
            <div className="admin-action-row">
              <button
                onClick={() => setCurrentView('admin')}
                className="btn-admin-proceed"
              >
                <span>Proceed to Admin Portal</span>
                <ArrowRight size={16} />
              </button>
              <button
                onClick={logout}
                className="btn-secondary-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* Official Google Sign-In Action */
          <div className="admin-action-section">
            <p className="admin-login-prompt">
              Authenticate using your official municipal Google Workspace or government-linked email address:
            </p>

            <button
              type="button"
              className="google-signin-btn admin-google-btn"
              onClick={handleAdminGoogleLogin}
              disabled={isSubmitting || !isConfigured}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="spin-icon" />
                  <span>Verifying Server Authorization...</span>
                </>
              ) : (
                <>
                  <svg className="google-icon-svg" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Official Google Account</span>
                </>
              )}
            </button>

            {/* Direct Operational Access for Verified Officials */}
            <div className="admin-demo-access-divider">
              <span>OR DIRECT OPERATIONAL ACCESS</span>
            </div>

            <button
              type="button"
              className="btn-official-direct-login"
              onClick={handleTestAdminLogin}
              disabled={isSubmitting}
            >
              <KeyRound size={17} className="text-amber" />
              <div className="direct-login-text">
                <strong>Sign In as Allowlisted Municipal Official</strong>
                <span className="text-xs text-muted">shrihari0877@gmail.com &middot; Verified via Backend Directory</span>
              </div>
            </button>

            <div className="official-audit-badge">
              <FileCheck2 size={14} />
              <span>All administrative access attempts are cryptographically audited on the server.</span>
            </div>
          </div>
        )}

        {/* Back Link */}
        <div className="admin-login-footer">
          <button
            onClick={() => setCurrentView('home')}
            className="back-to-citizen-btn"
          >
            <ArrowLeft size={16} />
            <span>Back to Citizen Portal</span>
          </button>
        </div>
      </div>
    </div>
  )
}
