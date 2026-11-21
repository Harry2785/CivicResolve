import { ShieldAlert, PlusCircle, Search, ListFilter, SlidersHorizontal, Activity, LogIn, LogOut, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Navbar({ currentView, setCurrentView, isHealthy }) {
  const { user, isAdmin, logout } = useAuth()

  const navItems = [
    { id: 'home', label: 'Home', icon: null },
    { id: 'report', label: 'Report an Issue', icon: PlusCircle, isPrimary: true },
    { id: 'track', label: 'Track Complaint', icon: Search },
    { id: 'feed', label: 'Public Issues', icon: ListFilter },
    { id: 'admin', label: 'Admin Portal', icon: SlidersHorizontal },
  ]

  const getUserLabel = () => {
    if (!user) return ''
    if (user.displayName) return user.displayName.split(' ')[0]
    if (user.phoneNumber) return user.phoneNumber
    if (user.email) return user.email.split('@')[0]
    return 'User'
  }

  return (
    <header className="navbar-container">
      <div className="navbar-brand" onClick={() => setCurrentView('home')}>
        <div className="brand-logo-box">
          <ShieldAlert size={24} />
        </div>
        <div className="brand-text-group">
          <span className="brand-name">CivicResolve</span>
          <span className="brand-tagline">AI Civic Resolution Platform</span>
        </div>
      </div>

      <nav className="navbar-links">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`nav-link-btn ${isActive ? 'nav-active' : ''} ${item.isPrimary ? 'nav-btn-primary' : ''}`}
            >
              {Icon && <Icon size={16} />}
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="navbar-right">
        {/* Firebase Authentication Button / User Profile */}
        {user ? (
          <div className="nav-user-profile">
            <div className="nav-user-badge" title={`Signed in as ${user.displayName || user.phoneNumber || user.email}`}>
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="nav-avatar-img" />
              ) : (
                <div className="nav-avatar-fallback">
                  {isAdmin ? <ShieldAlert size={14} className="text-amber" /> : <User size={14} />}
                </div>
              )}
              <span className="nav-user-name">{getUserLabel()}</span>
              {isAdmin ? (
                <span className="nav-role-badge admin" title="Server-Verified Administrator">Official</span>
              ) : (
                <span className="nav-role-badge citizen" title="Citizen Account">Citizen</span>
              )}
            </div>
            <button
              onClick={logout}
              className="nav-logout-btn"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <div className="nav-auth-buttons">
            <button
              onClick={() => setCurrentView('login')}
              className="nav-signin-btn"
              title="Citizen Sign In"
            >
              <LogIn size={15} />
              <span>Sign In</span>
            </button>
          </div>
        )}

        {/* Developer Diagnostics Pill */}
        <button
          onClick={() => setCurrentView('diagnostics')}
          className={`dev-diag-pill ${currentView === 'diagnostics' ? 'diag-active' : ''}`}
          title="Developer Diagnostics"
        >
          <span className={`status-dot ${isHealthy ? 'dot-online' : 'dot-offline'}`} />
          <Activity size={13} />
          <span className="dev-text">System</span>
        </button>
      </div>
    </header>
  )
}
