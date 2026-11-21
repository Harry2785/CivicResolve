import { useState } from 'react'
import {
  ShieldAlert,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Home,
  Lock,
  UserCheck
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function CitizenLogin({ setCurrentView }) {
  const {
    user,
    role,
    isConfigured,
    authError,
    clearError,
    loginWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    logout
  } = useAuth()

  const [activeTab, setActiveTab] = useState('google')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [otpCode, setOtpCode] = useState('')
  const [confirmationResult, setConfirmationResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [useVisibleCaptcha, setUseVisibleCaptcha] = useState(false)

  // Handle Google Sign-in
  const handleGoogleSignIn = async () => {
    try {
      setIsSubmitting(true)
      await loginWithGoogle()
      setCurrentView('home')
    } catch {
      // Handled in AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Phone OTP Request
  const handleSendOtp = async (e) => {
    e.preventDefault()
    clearError()

    const raw = phoneNumber.trim().replace(/[\s-]/g, '')
    if (!raw) return
    const fullPhone = raw.startsWith('+') ? raw : `${countryCode}${raw}`

    try {
      setIsSubmitting(true)
      const confirmation = await sendPhoneOtp(fullPhone, 'recaptcha-citizen-container', useVisibleCaptcha)
      setConfirmationResult(confirmation)
    } catch {
      // Handled in AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Phone OTP Verification
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    clearError()

    if (!otpCode.trim() || otpCode.trim().length < 6) return

    try {
      setIsSubmitting(true)
      await verifyPhoneOtp(confirmationResult, otpCode.trim())
      setCurrentView('home')
    } catch {
      // Handled in AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page-container">
      <div className="login-card">
        {/* Header */}
        <div className="login-card-header">
          <div className="brand-badge-center">
            <ShieldAlert size={28} />
          </div>
          <h1 className="login-card-title">Citizen Sign-In</h1>
          <p className="login-card-subtitle">
            Report local civic issues, track real-time resolution progress, and receive community updates.
          </p>
          <div className="citizen-role-pill">
            <UserCheck size={14} />
            <span>Role: Standard Citizen</span>
          </div>
        </div>

        {/* If user is already signed in */}
        {user ? (
          <div className="already-logged-in-box">
            <CheckCircle2 size={24} className="text-emerald" />
            <div>
              <h4>Currently Signed In</h4>
              <p>{user.displayName || user.phoneNumber || user.email}</p>
              <span className="role-tag">Citizen Account</span>
            </div>
            <div className="already-btn-group">
              <button onClick={() => setCurrentView('report')} className="btn-primary-sm">
                Report an Issue
              </button>
              <button onClick={logout} className="btn-secondary-sm">
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Error Banner */}
            {authError && (
              <div className="auth-alert alert-error">
                <AlertCircle size={18} />
                <div className="alert-text-wrapper">
                  <span>{authError}</span>
                </div>
              </div>
            )}

            {/* Auth Method Tabs */}
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab-btn ${activeTab === 'google' ? 'tab-active' : ''}`}
                onClick={() => {
                  setActiveTab('google')
                  clearError()
                }}
              >
                <svg className="google-icon-svg" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Google Sign-In</span>
              </button>

              <button
                type="button"
                className={`auth-tab-btn ${activeTab === 'phone' ? 'tab-active' : ''}`}
                onClick={() => {
                  setActiveTab('phone')
                  clearError()
                }}
              >
                <Smartphone size={18} />
                <span>Mobile OTP</span>
              </button>
            </div>

            {/* Google Sign-in */}
            {activeTab === 'google' && (
              <div className="auth-tab-content">
                <p className="auth-desc">
                  Sign in or register automatically using your Google account. Your profile will be assigned the standard <strong>Citizen</strong> role.
                </p>

                <button
                  type="button"
                  className="google-signin-btn"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting || !isConfigured}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="spin-icon" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <svg className="google-icon-svg" viewBox="0 0 24 24" width="20" height="20">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>Continue with Google</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Mobile OTP */}
            {activeTab === 'phone' && (
              <div className="auth-tab-content">
                {!confirmationResult ? (
                  <form onSubmit={handleSendOtp} className="phone-auth-form">
                    <p className="auth-desc">
                      Enter your mobile number to receive a 6-digit SMS verification code.
                    </p>

                    <div className="phone-input-row">
                      <select
                        className="country-code-select"
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        disabled={isSubmitting || !isConfigured}
                      >
                        <option value="+91">+91 (India)</option>
                        <option value="+1">+1 (USA/Canada)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+61">+61 (Australia)</option>
                        <option value="+65">+65 (Singapore)</option>
                        <option value="+971">+971 (UAE)</option>
                      </select>

                      <input
                        type="tel"
                        className="phone-number-input"
                        placeholder="98765 43210"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        required
                        disabled={isSubmitting || !isConfigured}
                      />
                    </div>

                    <div className="captcha-toggle-row">
                      <label className="captcha-toggle-label">
                        <input
                          type="checkbox"
                          checked={useVisibleCaptcha}
                          onChange={(e) => setUseVisibleCaptcha(e.target.checked)}
                          disabled={isSubmitting || !isConfigured}
                        />
                        <span>Show visible reCAPTCHA badge if needed</span>
                      </label>
                    </div>

                    <div id="recaptcha-citizen-container" className="recaptcha-mount-box"></div>

                    <button
                      type="submit"
                      className="send-otp-btn"
                      disabled={isSubmitting || !phoneNumber.trim() || !isConfigured}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={18} className="spin-icon" />
                          <span>Sending OTP...</span>
                        </>
                      ) : (
                        <>
                          <span>Send OTP Code</span>
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="phone-auth-form">
                    <p className="auth-desc">
                      Enter the 6-digit verification code sent to <strong>{countryCode}{phoneNumber}</strong>:
                    </p>

                    <div className="otp-input-group">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className="otp-code-input"
                        placeholder="123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        autoFocus
                        required
                        disabled={isSubmitting}
                      />
                    </div>

                    <button
                      type="submit"
                      className="send-otp-btn"
                      disabled={isSubmitting || otpCode.length < 6}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={18} className="spin-icon" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={18} />
                          <span>Verify &amp; Sign In</span>
                        </>
                      )}
                    </button>

                    <div className="otp-actions-row">
                      <button
                        type="button"
                        className="text-action-btn"
                        onClick={() => {
                          setConfirmationResult(null)
                          setOtpCode('')
                        }}
                      >
                        Change Number
                      </button>
                      <button
                        type="button"
                        className="text-action-btn"
                        onClick={handleSendOtp}
                      >
                        <RefreshCw size={14} />
                        <span>Resend OTP</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer Navigation Links */}
        <div className="login-card-footer">
          <div className="admin-redirect-callout">
            <Lock size={15} />
            <span>Municipal Officer or City Engineer?</span>
            <button
              onClick={() => setCurrentView('admin-login')}
              className="admin-link-btn"
            >
              Access Administrator Login &rarr;
            </button>
          </div>

          <div className="home-link-row">
            <button
              onClick={() => setCurrentView('home')}
              className="text-action-btn"
            >
              <Home size={14} />
              <span>Back to Citizen Home</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
