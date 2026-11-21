import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

/**
 * Firebase Web App Configuration for CivicResolve
 * 
 * Loaded safely from client-side environment variables prefixed with VITE_.
 * 
 * SECURITY BEST PRACTICES:
 * 1. These parameters are client-side public identifiers for your Firebase project.
 * 2. NEVER put Firebase Admin / Service Account private keys in this file or any frontend code!
 * 3. The actual security boundaries are enforced by Firebase Authentication, Firebase Security Rules,
 *    and your backend API verification.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Check if valid Firebase configuration has been provided
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your_firebase_api_key_here' &&
  !firebaseConfig.apiKey.includes('placeholder') &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your_project_id'
)

let app = null
let auth = null
let googleProvider = null

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
    auth = getAuth(app)
    googleProvider = new GoogleAuthProvider()
    // Always prompt account selection so users can switch accounts easily
    googleProvider.setCustomParameters({ prompt: 'select_account' })
  } catch (error) {
    console.error('CivicResolve: Error initializing Firebase App:', error)
  }
} else {
  console.info(
    'CivicResolve: Firebase credentials not yet configured in frontend/.env.local. ' +
    'Authentication is ready and will activate automatically once credentials are supplied.'
  )
}

export { app, auth, googleProvider, firebaseConfig }
