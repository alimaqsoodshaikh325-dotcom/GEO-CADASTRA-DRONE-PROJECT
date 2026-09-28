import { LayoutDashboard, BrainCircuit, Table, Map, AreaChart, FileText, LogOut, Sun, Moon, ToggleLeft, ToggleRight } from 'lucide-react'
import { mockAuth } from '../utils/mockAuth'
import { useDemo } from '../hooks/useDemo'

export default function AppLayout({ children, currentPath, navigate }) {
  const session = mockAuth.getSession()
  const { isDemo, toggleDemo } = useDemo()

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'AI Analysis', path: '/analysis', icon: BrainCircuit },
    { name: 'AI Models', path: '/models', icon: BrainCircuit },
    { name: 'Parcel Mapping', path: '/parcels', icon: Table },
    { name: 'GIS Map', path: '/map', icon: Map },
    { name: 'Analytics', path: '/analytics', icon: AreaChart },
    { name: 'Reports', path: '/reports', icon: FileText }
  ]

  const handleSignOut = () => {
    mockAuth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-brand" onClick={() => navigate('/')}>
          <span>◈</span>URBAN <em>AI</em>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPath === item.path
            return (
              <button
                key={item.path}
                className={`sidebar-item ${isActive ? 'sidebar-item--active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <Icon size={18} className="sidebar-icon" />
                <span>{item.name}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{session?.name?.[0] || 'U'}</div>
            <div className="user-details">
              <span className="user-name">{session?.name || 'Demo User'}</span>
              <span className="user-role">Analyst</span>
            </div>
          </div>
          <button className="signout-button" onClick={handleSignOut}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main">
        {/* Top Header */}
        <header className="app-header">
          <div className="header-left">
            <span className="platform-tag">SIH 2026 Platform</span>
          </div>

          <div className="header-right">
            {/* Live/Demo Mode Switcher */}
            <div className="demo-toggle-wrap">
              <span className={`toggle-label ${isDemo ? 'toggle-label--demo' : 'toggle-label--live'}`}>
                {isDemo ? 'DEMO MODE' : 'LIVE CONNECTION'}
              </span>
              <button className="demo-toggle-btn" onClick={toggleDemo} aria-label="Toggle Demo Mode">
                {isDemo ? (
                  <ToggleRight size={28} className="toggle-icon toggle-icon--active" />
                ) : (
                  <ToggleLeft size={28} className="toggle-icon" />
                )}
              </button>
            </div>

            {/* Notification Badge */}
            <div className="notification-bell">
              <span className="bell-badge"></span>
              🔔
            </div>
          </div>
        </header>

        {/* Global Demo Mode Warning Banner */}
        {isDemo && (
          <div className="demo-banner">
            ⚠️ <strong>DEMO MODE ACTIVE</strong> — Rendering high-fidelity Pune sample dataset for presentation.
          </div>
        )}

        {/* Dynamic Page Content */}
        <main className="app-content-view">
          {children}
        </main>
      </div>
    </div>
  )
}
