import { useState, useEffect } from 'react'
import {
  X,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  RefreshCw,
  KeyRound
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function AuthModal({ isOpen, onClose }) {
  const {
    user,
    isConfigured,
    authError,
    clearError,
    loginWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
  } = useAuth()

  const [activeTab, setActiveTab] = useState('google') // 'google' | 'phone'
  const [phoneNumber, setPhoneNumber] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [otpCode, setOtpCode] = useState('')
  const [confirmationResult, setConfirmationResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [useVisibleCaptcha, setUseVisibleCaptcha] = useState(false)

  // Reset states when modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      clearError()
      setSuccessMessage(null)
      setIsSubmitting(false)
    } else {
      setConfirmationResult(null)
      setOtpCode('')
      setPhoneNumber('')
    }
  }, [isOpen])

  // Auto-close modal when user signs in
  useEffect(() => {
    if (user && isOpen) {
      setSuccessMessage(`Welcome, ${user.displayName || user.phoneNumber || user.email}!`)
      const timer = setTimeout(() => {
        onClose()
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [user, isOpen])

  if (!isOpen) return null

  // Handle Google Sign-in
  const handleGoogleSignIn = async () => {
    try {
      setIsSubmitting(true)
      await loginWithGoogle()
    } catch (err) {
      // Error handled in AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Phone OTP Request
  const handleSendOtp = async (e) => {
    e.preventDefault()
    clearError()

    const raw = phoneNumber.trim().replace(/[\s-]/g, '')
    if (!raw) {
      return
    }

    const fullPhone = raw.startsWith('+') ? raw : `${countryCode}${raw}`

    try {
      setIsSubmitting(true)
      const confirmation = await sendPhoneOtp(fullPhone, 'recaptcha-container', useVisibleCaptcha)
      setConfirmationResult(confirmation)
    } catch (err) {
      // Error handled in AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Phone OTP Verification
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    clearError()

    if (!otpCode.trim() || otpCode.trim().length < 6) {
      return
    }

    try {
      setIsSubmitting(true)
      await verifyPhoneOtp(confirmationResult, otpCode.trim())
    } catch (err) {
      // Error handled in AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  // Reset to phone input step
  const handleResetPhone = () => {
    setConfirmationResult(null)
    setOtpCode('')
    clearError()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-title-group">
            <div className="auth-icon-badge">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="auth-modal-title">Citizen &amp; Official Access</h2>
              <p className="auth-modal-subtitle">Secure authentication powered by Firebase</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="auth-alert alert-success">
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {authError && (
          <div className="auth-alert alert-error">
            <AlertCircle size={18} />
            <div className="alert-text-wrapper">
              <span>{authError}</span>
            </div>
            <button className="alert-dismiss-btn" onClick={clearError}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Unconfigured Notice */}
        {!isConfigured && (
          <div className="auth-unconfigured-banner">
            <div className="unconfigured-header">
              <KeyRound size={20} className="unconfigured-icon" />
              <div>
                <h4>Firebase Configuration Pending</h4>
                <p>
                  To enable live Google Sign-In and Phone OTP SMS authentication, copy your Firebase SDK parameters into{' '}
                  <code>frontend/.env.local</code> and restart the Vite dev server.
                </p>
              </div>
            </div>
            <div className="env-guide-box">
              <div className="env-guide-title">Required in <code>frontend/.env.local</code>:</div>
              <pre className="env-code-preview">
{`VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=civicresolve.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=civicresolve
VITE_FIREBASE_STORAGE_BUCKET=civicresolve.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...`}
              </pre>
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
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google Account</span>
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

        {/* Tab Content: Google */}
        {activeTab === 'google' && (
          <div className="auth-tab-content">
            <p className="auth-desc">
              Sign in instantly with your verified Google account. Keep track of all complaints you report and receive resolution updates.
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
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <svg className="google-icon-svg" viewBox="0 0 24 24" width="20" height="20">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <div className="auth-features-list">
              <div className="auth-feature-item">
                <CheckCircle2 size={15} className="feature-check" />
                <span>Instant single-click citizen verification</span>
              </div>
              <div className="auth-feature-item">
                <CheckCircle2 size={15} className="feature-check" />
                <span>Direct notification dispatch for complaint status changes</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Phone OTP */}
        {activeTab === 'phone' && (
          <div className="auth-tab-content">
            {!confirmationResult ? (
              /* Step 1: Request OTP */
              <form onSubmit={handleSendOtp} className="phone-auth-form">
                <p className="auth-desc">
                  Enter your mobile number to receive a one-time 6-digit SMS verification code.
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
                    <span>Show visible reCAPTCHA badge (if ad-blocker blocks invisible captcha)</span>
                  </label>
                </div>

                {/* reCAPTCHA DOM Mount Point */}
                <div id="recaptcha-container" className="recaptcha-mount-box"></div>

                <button
                  type="submit"
                  className="send-otp-btn"
                  disabled={isSubmitting || !phoneNumber.trim() || !isConfigured}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="spin-icon" />
                      <span>Sending Verification Code...</span>
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
              /* Step 2: Confirm OTP */
              <form onSubmit={handleVerifyOtp} className="phone-auth-form">
                <p className="auth-desc">
                  Enter the 6-digit verification code sent to{' '}
                  <strong>{phoneNumber.startsWith('+') ? phoneNumber : `${countryCode}${phoneNumber}`}</strong>:
                </p>

                <div className="otp-input-group">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
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
                      <span>Verifying Code...</span>
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
                    onClick={handleResetPhone}
                    disabled={isSubmitting}
                  >
                    Change phone number
                  </button>
                  <button
                    type="button"
                    className="text-action-btn"
                    onClick={handleSendOtp}
                    disabled={isSubmitting}
                  >
                    <RefreshCw size={14} />
                    <span>Resend OTP</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Security Footnote */}
        <div className="auth-modal-footer">
          <ShieldCheck size={14} />
          <span>End-to-end encrypted session &middot; CivicResolve Privacy Protected</span>
        </div>
      </div>
    </div>
  )
}
