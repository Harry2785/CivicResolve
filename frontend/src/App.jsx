import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import CitizenHome from './components/CitizenHome'
import ReportIssue from './components/ReportIssue'
import TrackComplaint from './components/TrackComplaint'
import IssuesFeed from './components/IssuesFeed'
import AdminPortal from './components/AdminPortal'
import AdminLogin from './components/AdminLogin'
import CitizenLogin from './components/CitizenLogin'
import AccessDenied from './components/AccessDenied'
import SystemDiagnostics from './components/SystemDiagnostics'
import AuthModal from './components/AuthModal'
import { useAuth } from './context/AuthContext'
import { Loader2 } from 'lucide-react'
import './App.css'

export default function App() {
  const { user, isAdmin, loading, adminVerificationLoading } = useAuth()

  // Parse initial route from URL hash or default to 'home'
  const getInitialView = () => {
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase()
    if (['report', 'track', 'feed', 'admin', 'admin-login', 'login', 'diagnostics'].includes(hash)) {
      return hash
    }
    return 'home'
  }

  const [currentView, setCurrentView] = useState(getInitialView)
  const [selectedCategory, setSelectedCategory] = useState('Roads & Potholes')
  const [trackTrackingId, setTrackTrackingId] = useState('')
  const [isHealthy, setIsHealthy] = useState(true)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  // Sync state with URL hash
  const changeView = (view) => {
    setCurrentView(view)
    if (view === 'home') {
      window.history.pushState(null, '', '/')
    } else {
      window.location.hash = `#/${view}`
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Listen to browser back/forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase()
      if (['report', 'track', 'feed', 'admin', 'admin-login', 'login', 'diagnostics'].includes(hash)) {
        setCurrentView(hash)
      } else {
        setCurrentView('home')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Check backend health status
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health')
        setIsHealthy(res.ok)
      } catch {
        setIsHealthy(false)
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="civic-app">
      {/* Primary Navigation */}
      <Navbar
        currentView={currentView}
        setCurrentView={changeView}
        isHealthy={isHealthy}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="civic-main-content">
        {currentView === 'home' && (
          <CitizenHome
            setCurrentView={changeView}
            setSelectedCategory={setSelectedCategory}
          />
        )}

        {currentView === 'report' && (
          <ReportIssue
            initialCategory={selectedCategory}
            setCurrentView={changeView}
            setTrackTrackingId={setTrackTrackingId}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {currentView === 'track' && (
          <TrackComplaint
            initialTrackingId={trackTrackingId}
            setCurrentView={changeView}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {currentView === 'feed' && (
          <IssuesFeed
            setCurrentView={changeView}
          />
        )}

        {/* Dedicated Citizen Login Route */}
        {currentView === 'login' && (
          <CitizenLogin setCurrentView={changeView} />
        )}

        {/* Dedicated Administrator Login Route */}
        {currentView === 'admin-login' && (
          <AdminLogin setCurrentView={changeView} />
        )}

        {/* Protected Administrator Route */}
        {currentView === 'admin' && (
          loading || adminVerificationLoading ? (
            <div className="admin-loading-screen">
              <Loader2 size={36} className="spin-icon text-primary" />
              <h3>Verifying Municipal Authorization...</h3>
              <p>Cryptographically checking credentials against the backend administrator allowlist.</p>
            </div>
          ) : !user ? (
            // Unauthenticated: Redirect to dedicated administrator login
            <AdminLogin setCurrentView={changeView} />
          ) : !isAdmin ? (
            // Authenticated as citizen: Show Access Denied
            <AccessDenied setCurrentView={changeView} />
          ) : (
            // Authenticated and verified as admin: Show Admin Portal
            <AdminPortal setCurrentView={changeView} />
          )
        )}

        {currentView === 'diagnostics' && (
          <SystemDiagnostics />
        )}
      </main>

      {/* Quick Citizen Sign-In Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Footer */}
      <footer className="civic-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">CivicResolve</span>
            <p className="footer-text">
              AI-Powered Civic Issue Reporting and Resolution Platform. Building Better Communities, One Resolution at a Time.
            </p>
          </div>
          <div className="footer-links">
            <button onClick={() => changeView('home')} className="footer-btn">Home</button>
            <button onClick={() => changeView('report')} className="footer-btn">Report Issue</button>
            <button onClick={() => changeView('track')} className="footer-btn">Track Status</button>
            <button onClick={() => changeView('feed')} className="footer-btn">Public Feed</button>
            <button onClick={() => changeView('admin')} className="footer-btn">Admin Portal</button>
            <button onClick={() => changeView('login')} className="footer-btn">Citizen Login</button>
            <button onClick={() => changeView('admin-login')} className="footer-btn text-amber">Official Login</button>
            <button onClick={() => changeView('diagnostics')} className="footer-btn dev-link">System Diagnostics</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
