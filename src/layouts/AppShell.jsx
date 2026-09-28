import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Bot,
  BrainCircuit,
  ChevronDown,
  FileBarChart2,
  History,
  Images,
  Info,
  LandPlot,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  PlusSquare,
  ScanSearch,
  Search,
  Settings2,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'

import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import SystemStatus from '../components/common/SystemStatus'
import './AppShell.css'

const operationsNav = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['New Analysis', '/analysis', PlusSquare],
  ['Map Explorer', '/map', MapPinned],
  ['GeoAI Assistant', '/assistant', Bot],
  ['Extraction Results', '/results', ScanSearch],
  ['Review Center', '/review', ShieldCheck],
]

const dataNav = [
  ['Parcels', '/parcels', LandPlot],
  ['Models', '/models', BrainCircuit],
  ['Datasets', '/datasets', Images],
  ['History', '/history', History],
  ['Reports', '/reports', FileBarChart2],
]

const systemNav = [
  ['About', '/about', Info],
  ['Settings', '/settings', Settings2],
]

const routeContextMap = {
  '/dashboard': { title: 'GEOSPATIAL OPERATIONS', subtitle: 'Aerial surveying and automated extraction workspace' },
  '/analysis': { title: 'ANALYSIS STUDIO', subtitle: 'Submit source imagery for AI segmentation and GIS consensus' },
  '/processing': { title: 'PROCESSING ENGINE', subtitle: 'Live pipeline inference and cadastral extraction stages' },
  '/results': { title: 'EXTRACTION RESULTS', subtitle: 'Spatial footprint extraction and measurement inspection' },
  '/map': { title: 'MAP EXPLORER', subtitle: 'Interactive aerial map and coordinate-safe GIS viewer' },
  '/assistant': { title: 'GEOAI ASSISTANT', subtitle: 'Project-aware analysis, GIS, and review guidance' },
  '/profile': { title: 'ACCOUNT & PROFILE', subtitle: 'Workspace identity, preferences, and account status' },
  '/review': { title: 'REVIEW CENTER', subtitle: 'Human-in-the-loop spatial consensus verification' },
  '/parcels': { title: 'PARCEL INTELLIGENCE', subtitle: 'Cadastral parcel relationships and building coverage' },
  '/models': { title: 'MODEL BENCHMARK', subtitle: 'Tile 8 geographically held-out segmentation metrics' },
  '/datasets': { title: 'DATASET PROVENANCE', subtitle: 'ML training, validation, Tile 8 test imagery & ground truth' },
  '/history': { title: 'OPERATION HISTORY', subtitle: 'Persisted processing records from PostgreSQL' },
  '/reports': { title: 'REPORT CENTER', subtitle: 'Generated GeoJSON, spatial consensus, and survey reports' },
  '/settings': { title: 'SYSTEM SETTINGS', subtitle: 'Geospatial service configuration and connectivity' },
  '/about': { title: 'SYSTEM ARCHITECTURE', subtitle: 'End-to-end aerial segmentation & PostGIS pipeline' },
}

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    let active = true

    api.getHistory()
      .then((data) => {
        if (!active) return
        const jobs = Array.isArray(data?.jobs) ? data.jobs.slice(0, 5) : []
        const nextNotifications = jobs.map((job, index) => ({
          id: job.job_id || `job-${index}`,
          title: job.status || 'Job status updated',
          message: job.job_id ? `Analysis job ${job.job_id} is available for review in the project workspace.` : 'Recent project activity is available.',
          time: job.completed_at || job.started_at || new Date().toISOString(),
          href: job.job_id ? `/results/${job.job_id}` : '/results',
          type: index % 2 === 0 ? 'PROCESSING' : 'REVIEW',
        }))
        setNotifications(nextNotifications)
      })
      .catch(() => {
        if (active) setNotifications([])
      })

    return () => { active = false }
  }, [])

  // Match route context
  const currentPath = '/' + location.pathname.split('/')[1]
  const context = routeContextMap[currentPath] || {
    title: 'GEOCADASTRA WORKSPACE',
    subtitle: 'Cadastral AI operations'
  }

  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const q = searchQuery.trim()
      if (q.startsWith('job_') || q.includes('-')) {
        navigate(`/results/${q}`)
      } else {
        navigate(`/parcels?search=${encodeURIComponent(q)}`)
      }
    }
  }

  const renderNavItems = (items) => (
    items.map(([label, to, Icon]) => (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        title={collapsed ? label : undefined}
      >
        <Icon size={18} strokeWidth={1.9} className="nav-icon" />
        {!collapsed && <span>{label}</span>}
      </NavLink>
    ))
  )

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-area" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <b>GEOCADASTRA</b>
            <span>CADASTRAL AI</span>
          </div>
          <button 
            className="collapse-btn" 
            onClick={() => setCollapsed(!collapsed)} 
            aria-label="Toggle navigation"
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {!collapsed && <div className="nav-label">OPERATIONS WORKSPACE</div>}
          <div className="nav-group">{renderNavItems(operationsNav)}</div>
          <hr className="nav-divider" />
          {!collapsed && <div className="nav-label">DATA</div>}
          <div className="nav-group">{renderNavItems(dataNav)}</div>
          <hr className="nav-divider" />
          {!collapsed && <div className="nav-label">SYSTEM</div>}
          <div className="nav-group">{renderNavItems(systemNav)}</div>
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <div className="sidebar-user-block">
              <div className="user-profile">
                <span className="user-initial">
                  {(user?.full_name || user?.email || 'U').slice(0, 1).toUpperCase()}
                </span>
                <div className="user-text">
                  <span className="user-name">{user?.full_name || 'Geospatial Analyst'}</span>
                  <span className="user-role">{user?.email || 'operator@geocadastra.ai'}</span>
                </div>
              </div>
            </div>
          )}
          <button 
            className="signout-btn" 
            onClick={() => { logout(); navigate('/login') }}
            title="Sign out from session"
          >
            <LogOut size={16} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main-content">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-context">
            <span className="context-title">{context.title}</span>
            <small className="context-subtitle">{context.subtitle}</small>
          </div>

          <label className="global-search">
            <Search size={15} />
            <input 
              placeholder="Search jobs, buildings, parcels… (Press Enter)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              aria-label="Global search" 
            />
          </label>

          <div className="header-right">
            <div className="header-system-status">
              <SystemStatus layout="row" />
            </div>

            <div className="notification-wrapper" style={{ position: 'relative' }}>
              <button
                className="notification-button"
                onClick={() => { setNotificationOpen((open) => !open); setUserMenuOpen(false) }}
                aria-label="Notification center"
                title="Notification center"
              >
                <Bell size={16} />
                {notifications.length > 0 && <span className="notification-badge">{notifications.length}</span>}
              </button>

              {notificationOpen && (
                <div className="notification-panel" onMouseLeave={() => setNotificationOpen(false)}>
                  <div className="notification-header">
                    <strong>Notification Center</strong>
                    <small>{notifications.length} unread</small>
                  </div>
                  <div className="notification-list">
                    {notifications.length ? notifications.map((item) => (
                      <button key={item.id} className="notification-item" onClick={() => { setNotificationOpen(false); navigate(item.href) }}>
                        <div className="notification-dot" />
                        <div>
                          <div className="notification-title">{item.title}</div>
                          <div className="notification-message">{item.message}</div>
                          <div className="notification-time">{new Date(item.time).toLocaleString()}</div>
                        </div>
                      </button>
                    )) : (
                      <div className="notification-empty">No live notifications available from the current backend data.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="user-menu-wrapper" style={{ position: 'relative' }}>
              <button 
                className="account-button" 
                onClick={() => { setUserMenuOpen(!userMenuOpen); setNotificationOpen(false) }}
                aria-expanded={userMenuOpen}
              >
                <span className="account-avatar">
                  {(user?.full_name || user?.email || 'U').slice(0, 1).toUpperCase()}
                </span>
                <span className="account-name">{user?.full_name || user?.email || 'Operator'}</span>
                <ChevronDown size={14} />
              </button>

              {userMenuOpen && (
                <div 
                  className="user-dropdown-menu"
                  onMouseLeave={() => setUserMenuOpen(false)}
                >
                  <div className="dropdown-header">
                    <strong>{user?.full_name || 'Geospatial Operator'}</strong>
                    <small>{user?.email || 'operator@geocadastra.ai'}</small>
                  </div>
                  <hr />
                  <button onClick={() => { setUserMenuOpen(false); navigate('/profile') }}>
                    <User size={14} /> View Profile
                  </button>
                  <button onClick={() => { setUserMenuOpen(false); navigate('/settings') }}>
                    <Settings2 size={14} /> Account Settings
                  </button>
                  <button onClick={() => { setUserMenuOpen(false); setNotificationOpen(true) }}>
                    <Bell size={14} /> Notifications
                  </button>
                  <button onClick={() => { setUserMenuOpen(false); navigate('/settings') }}>
                    <ShieldCheck size={14} /> System Status
                  </button>
                  <hr />
                  <button className="dropdown-logout" onClick={() => { logout(); navigate('/login') }}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Body */}
        <section className="page-body" key={location.pathname}>
          {children}
        </section>
      </main>
    </div>
  )
}
