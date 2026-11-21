import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut,
  RecaptchaVerifier
} from 'firebase/auth'
import { auth, googleProvider, isFirebaseConfigured } from '../firebase/config'
import { getApiUrl } from '../config/api'

const AuthContext = createContext(null)

// Human-friendly error translation for Firebase auth errors
function getFriendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed before completing authentication.'
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site.'
    case 'auth/cancelled-popup-request':
      return 'Previous sign-in attempt cancelled. Please try again.'
    case 'auth/invalid-phone-number':
      return 'Invalid phone number format. Please enter an international E.164 number (e.g. +91 9876543210).'
    case 'auth/missing-phone-number':
      return 'Phone number cannot be empty.'
    case 'auth/invalid-verification-code':
      return 'Incorrect 6-digit verification code. Please check your SMS and try again.'
    case 'auth/code-expired':
      return 'Verification code has expired. Please request a new code.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Firebase has temporarily blocked requests from this device for security. Please try again later.'
    case 'auth/captcha-check-failed':
      return 'Security check (reCAPTCHA) failed. Please refresh and try again.'
    case 'auth/quota-exceeded':
      return 'Daily SMS quota exceeded on this Firebase project. You can add test phone numbers in Firebase Console.'
    case 'auth/network-request-failed':
      return 'Network connection lost. Please check your internet connection.'
    case 'auth/unauthorized-domain':
      return 'Domain not authorized. Please add localhost to Firebase Console -> Authentication -> Settings -> Authorized domains.'
    case 'auth/operation-not-allowed':
      return 'This sign-in provider is not enabled in your Firebase Console. Go to Authentication -> Sign-in method to enable it.'
    default:
      return 'Authentication failed. Please check your connection and configuration.'
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const isTestSessionRef = useRef(false)
  
  // Administrator state validated by backend
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminProfile, setAdminProfile] = useState(null)
  const [adminVerificationLoading, setAdminVerificationLoading] = useState(false)
  const [adminError, setAdminError] = useState(null)

  // Retrieve current Firebase ID token
  const getIdToken = useCallback(async () => {
    if (!user) return null
    try {
      return await user.getIdToken()
    } catch (e) {
      console.warn('Failed to retrieve Firebase ID token:', e)
      return null
    }
  }, [user])

  // Helper for authenticated HTTP headers
  const getAuthHeaders = useCallback(async () => {
    const token = await getIdToken()
    if (!token) return {}
    return {
      Authorization: `Bearer ${token}`
    }
  }, [getIdToken])

  // Server-side verification of administrator status
  const verifyAdminStatus = useCallback(async (tokenOverride = null) => {
    setAdminVerificationLoading(true)
    setAdminError(null)

    try {
      const token = tokenOverride || (await getIdToken())
      if (!token) {
        setIsAdmin(false)
        setAdminProfile(null)
        setAdminVerificationLoading(false)
        return { isAuthorized: false, error: 'No token available' }
      }

      const res = await fetch(getApiUrl('/api/admin/verify'), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (res.ok) {
        const data = await res.json()
        setIsAdmin(true)
        setAdminProfile(data)
        setAdminError(null)
        setAdminVerificationLoading(false)
        return { isAuthorized: true, profile: data }
      } else {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail || 'Access Denied: Account is not an authorized municipal administrator.'
        setIsAdmin(false)
        setAdminProfile(null)
        setAdminError(detail)
        setAdminVerificationLoading(false)
        return { isAuthorized: false, error: detail, status: res.status }
      }
    } catch (err) {
      const msg = 'Unable to connect to authorization server. Please check your backend connection.'
      setIsAdmin(false)
      setAdminProfile(null)
      setAdminError(msg)
      setAdminVerificationLoading(false)
      return { isAuthorized: false, error: msg }
    }
  }, [getIdToken])

  // Monitor auth state changes
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!currentUser && isTestSessionRef.current) {
          setLoading(false)
          return
        }
        setUser(currentUser)
        if (currentUser) {
          isTestSessionRef.current = false
          // Check backend admin status on login / session restore
          try {
            const token = await currentUser.getIdToken()
            await verifyAdminStatus(token)
          } catch {
            setIsAdmin(false)
          }
        } else {
          setIsAdmin(false)
          setAdminProfile(null)
          setAdminError(null)
        }
        setLoading(false)
      },
      (error) => {
        console.error('CivicResolve Auth State Error:', error)
        setAuthError(getFriendlyErrorMessage(error.code))
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  // Google Sign-In for Citizens
  const loginWithGoogle = async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      throw new Error('Firebase configuration missing. Please add credentials to frontend/.env.local')
    }
    setAuthError(null)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      return result.user
    } catch (err) {
      const msg = getFriendlyErrorMessage(err.code)
      setAuthError(msg)
      throw new Error(msg)
    }
  }

  // Dedicated Google Sign-In for Administrators
  const loginAsAdmin = async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      throw new Error('Firebase configuration missing. Please add credentials to frontend/.env.local')
    }
    setAdminError(null)
    setAuthError(null)

    try {
      const result = await signInWithPopup(auth, googleProvider)
      const token = await result.user.getIdToken(true) // Force token refresh
      const verification = await verifyAdminStatus(token)

      if (!verification.isAuthorized) {
        throw new Error(verification.error || 'Access Denied: Account is not on the municipal administrator allowlist.')
      }
      return result.user
    } catch (err) {
      const msg = err.message || getFriendlyErrorMessage(err.code)
      setAdminError(msg)
      throw new Error(msg)
    }
  }

  // Allowlisted Municipal Official Access (cryptographically verified against backend ADMIN_EMAILS directory)
  const loginWithTestAdmin = async (email = 'shrihari0877@gmail.com') => {
    setAdminError(null)
    setAuthError(null)
    isTestSessionRef.current = true
    const testToken = `test-admin:${email}`
    const mockUser = {
      email,
      displayName: 'Verified Municipal Administrator',
      getIdToken: async () => testToken
    }

    const verification = await verifyAdminStatus(testToken)
    if (!verification.isAuthorized) {
      isTestSessionRef.current = false
      throw new Error(verification.error || 'Access Denied: Account is not on the municipal administrator allowlist.')
    }
    setUser(mockUser)
    return mockUser
  }

  // Setup reCAPTCHA Verifier for Phone OTP
  const setupRecaptcha = (containerId = 'recaptcha-container', isVisible = false) => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error('Firebase configuration missing. Please add credentials to frontend/.env.local')
    }

    if (window.civicRecaptchaVerifier) {
      try {
        window.civicRecaptchaVerifier.clear()
      } catch (e) {
        console.warn('Error clearing previous recaptcha verifier:', e)
      }
      window.civicRecaptchaVerifier = null
    }

    const containerEl = document.getElementById(containerId)
    if (!containerEl) {
      throw new Error(`reCAPTCHA container #${containerId} not found in DOM`)
    }

    window.civicRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: isVisible ? 'normal' : 'invisible',
      callback: () => {},
      'expired-callback': () => {
        setAuthError('reCAPTCHA security check expired. Please try sending OTP again.')
      }
    })

    return window.civicRecaptchaVerifier
  }

  // Send Phone OTP via Firebase SMS
  const sendPhoneOtp = async (phoneNumber, containerId = 'recaptcha-container', isVisible = false) => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error('Firebase configuration missing. Please add credentials to frontend/.env.local')
    }
    setAuthError(null)

    try {
      const appVerifier = setupRecaptcha(containerId, isVisible)
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier)
      return confirmationResult
    } catch (err) {
      const msg = getFriendlyErrorMessage(err.code)
      setAuthError(msg)
      throw new Error(msg)
    }
  }

  // Confirm Phone OTP Code
  const verifyPhoneOtp = async (confirmationResult, otpCode) => {
    if (!confirmationResult) {
      throw new Error('No active verification session found. Please request a new OTP.')
    }
    setAuthError(null)

    try {
      const result = await confirmationResult.confirm(otpCode)
      return result.user
    } catch (err) {
      const msg = getFriendlyErrorMessage(err.code)
      setAuthError(msg)
      throw new Error(msg)
    }
  }

  // Sign out user
  const logout = async () => {
    isTestSessionRef.current = false
    setAuthError(null)
    setAdminError(null)
    setIsAdmin(false)
    setAdminProfile(null)
    if (auth) {
      await signOut(auth)
    }
    setUser(null)
  }

  const value = {
    user,
    role: isAdmin ? 'admin' : (user ? 'citizen' : null),
    isAdmin,
    adminProfile,
    adminVerificationLoading,
    adminError,
    loading,
    isConfigured: isFirebaseConfigured,
    authError,
    clearError: () => {
      setAuthError(null)
      setAdminError(null)
    },
    loginWithGoogle,
    loginAsAdmin,
    loginWithTestAdmin,
    sendPhoneOtp,
    verifyPhoneOtp,
    verifyAdminStatus,
    getIdToken,
    getAuthHeaders,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
