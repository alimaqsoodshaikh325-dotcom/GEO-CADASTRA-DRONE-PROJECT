import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Eye,
  Globe,
  HardDrive,
  ImagePlus,
  Info,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Map,
  MapPin,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  User,
  UserCheck,
  Wifi,
  X,
} from 'lucide-react'
import PageHeader from '../components/common/PageHeader'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import './ProfilePage.css'

const tabs = [
  { id: 'OVERVIEW', label: 'OVERVIEW', num: '01', icon: Terminal },
  { id: 'PERSONAL INFORMATION', label: 'PERSONAL INFORMATION', num: '02', icon: User },
  { id: 'PREFERENCES', label: 'PREFERENCES', num: '03', icon: SlidersHorizontal },
  { id: 'SECURITY', label: 'SECURITY', num: '04', icon: ShieldCheck },
  { id: 'ACTIVITY', label: 'ACTIVITY', num: '05', icon: Activity },
]

const preferenceKey = 'geocadastra-account-preferences'
const defaultPreferences = {
  theme: 'System',
  mapPreference: 'Default Base Map',
  defaultZoom: '12',
  notifications: {
    jobCompleted: true,
    reviewAssigned: true,
    processingFailed: true,
    systemWarning: true,
  },
  assistant: {
    showLauncher: true,
    responseStyle: 'Concise',
  },
}

function loadPreferences() {
  try {
    const saved = localStorage.getItem(preferenceKey)
    if (!saved) return defaultPreferences
    const parsed = JSON.parse(saved)
    return {
      ...defaultPreferences,
      ...parsed,
      notifications: { ...defaultPreferences.notifications, ...parsed.notifications },
      assistant: { ...defaultPreferences.assistant, ...parsed.assistant },
    }
  } catch {
    return defaultPreferences
  }
}

function formatDate(value) {
  if (!value) return 'NOT AVAILABLE'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'NOT AVAILABLE'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function healthState(value, isLoading = false) {
  if (isLoading) return 'CHECKING'
  if (!value) return 'NOT AVAILABLE'
  const status = String(value.status || '').toLowerCase()
  if (['ok', 'connected', 'available', 'healthy'].includes(status)) return 'CONNECTED'
  return status ? status.replaceAll('_', ' ').toUpperCase() : 'NOT AVAILABLE'
}

function profileFromUser(user) {
  const name = user?.full_name || ''
  return {
    full_name: name,
    displayName: user?.display_name || name,
    email: user?.email || '',
    role: user?.role || '',
    organization: user?.organization || '',
    created_at: user?.created_at || '',
    avatar: user?.avatar || '',
  }
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated, logout, updateUser } = useAuth()
  const [activeTab, setActiveTab] = useState('OVERVIEW')
  const [profile, setProfile] = useState(() => profileFromUser(user))
  const [savedProfile, setSavedProfile] = useState(() => profileFromUser(user))
  const [preferences, setPreferences] = useState(loadPreferences)
  const [savedPreferences, setSavedPreferences] = useState(loadPreferences)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [fieldError, setFieldError] = useState('')
  const [system, setSystem] = useState({ health: null, history: null })
  const [loadingSystem, setLoadingSystem] = useState(true)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const next = profileFromUser(user)
    setProfile(next)
    setSavedProfile(next)
  }, [user])

  const fetchSystemData = async () => {
    setLoadingSystem(true)
    const [healthResult, historyResult] = await Promise.allSettled([
      api.getHealth(),
      api.getHistory(),
    ])
    setSystem({
      health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      history: historyResult.status === 'fulfilled' ? historyResult.value : null,
    })
    setLoadingSystem(false)
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoadingSystem(true)
      const [healthResult, historyResult] = await Promise.allSettled([
        api.getHealth(),
        api.getHistory(),
      ])
      if (!active) return
      setSystem({
        health: healthResult.status === 'fulfilled' ? healthResult.value : null,
        history: historyResult.status === 'fulfilled' ? historyResult.value : null,
      })
      setLoadingSystem(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const initials = useMemo(() => {
    const name = profile.displayName || profile.full_name || profile.email
    if (!name) return 'OP'
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
  }, [profile.displayName, profile.full_name, profile.email])

  const dirtyProfile = JSON.stringify(profile) !== JSON.stringify(savedProfile)
  const dirtyPreferences = JSON.stringify(preferences) !== JSON.stringify(savedPreferences)
  const activeAccount = Boolean(isAuthenticated && user)
  const apiStatus = healthState(system.health, loadingSystem)
  const jobs = Array.isArray(system.history?.history) ? system.history.history : []
  const recentJobs = jobs.slice(0, 10)
  const workspaceName = profile.organization || 'NOT AVAILABLE'

  const completedJobsCount = jobs.filter(
    (j) => String(j.status || '').toLowerCase() === 'completed'
  ).length
  const failedJobsCount = jobs.filter((j) =>
    ['failed', 'error'].includes(String(j.status || '').toLowerCase())
  ).length

  const notify = (type, message) => {
    setFeedback({ type, message })
    window.setTimeout(() => setFeedback(null), 3800)
  }

  const validateProfile = () => {
    if (!profile.full_name.trim()) {
      setFieldError('Full name is required.')
      setActiveTab('PERSONAL INFORMATION')
      return false
    }
    if (profile.full_name.trim().length < 2) {
      setFieldError('Full name must contain at least 2 characters.')
      setActiveTab('PERSONAL INFORMATION')
      return false
    }
    if (!profile.displayName.trim()) {
      setFieldError('Display name is required.')
      setActiveTab('PERSONAL INFORMATION')
      return false
    }
    setFieldError('')
    return true
  }

  const saveProfile = async () => {
    if (!validateProfile()) return
    setSaving(true)
    setFeedback(null)
    try {
      const nextUser = {
        ...user,
        full_name: profile.full_name.trim(),
        display_name: profile.displayName.trim(),
        avatar: profile.avatar,
      }
      updateUser(nextUser)
      const normalized = profileFromUser(nextUser)
      setProfile(normalized)
      setSavedProfile(normalized)
      setEditing(false)
      notify('success', 'CHANGES SAVED')
    } catch (error) {
      notify('error', error?.message || 'Profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const cancelProfileEdit = () => {
    setProfile(savedProfile)
    setFieldError('')
    setEditing(false)
    setFeedback(null)
  }

  const savePreferences = () => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(preferences))
      setSavedPreferences(preferences)
      notify('success', 'PREFERENCES SAVED')
    } catch (error) {
      notify('error', error?.message || 'Preferences could not be saved in this browser.')
    }
  }

  const resetPreferences = () => {
    setPreferences(defaultPreferences)
    setSavedPreferences(defaultPreferences)
    try {
      localStorage.removeItem(preferenceKey)
      notify('success', 'PREFERENCES RESET TO DEFAULTS')
    } catch (error) {
      notify('error', error?.message || 'Preferences could not be reset.')
    }
  }

  const chooseAvatar = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setFieldError('Please select a valid PNG, JPEG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > 1024 * 1024) {
      setFieldError('Profile image must be 1 MB or smaller.')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setProfile((current) => ({ ...current, avatar: String(reader.result || '') }))
      setFieldError('')
    }
    reader.onerror = () => setFieldError('The selected image could not be read.')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const removeAvatar = () => {
    setProfile((current) => ({ ...current, avatar: '' }))
    setFieldError('')
  }

  const signOut = () => {
    logout()
    navigate('/login')
  }

  const saveCurrentTab = () => {
    if (activeTab === 'PERSONAL INFORMATION' || editing) {
      saveProfile()
      return
    }
    if (activeTab === 'PREFERENCES') {
      savePreferences()
      return
    }
    notify('info', 'NO UNSAVED CHANGES IN THIS SECTION')
  }

  const startEditing = () => {
    setActiveTab('PERSONAL INFORMATION')
    setEditing(true)
    setFeedback(null)
  }

  const healthRows = [
    {
      label: 'AUTHENTICATION',
      value: activeAccount ? 'ACTIVE' : 'NOT AVAILABLE',
      desc: 'Institutional auth token signature valid',
      Icon: ShieldCheck,
      tone: activeAccount ? 'good' : 'neutral',
    },
    {
      label: 'SESSION',
      value: activeAccount && token ? 'ACTIVE' : 'NOT AVAILABLE',
      desc: 'Browser session security verified',
      Icon: KeyRound,
      tone: activeAccount && token ? 'good' : 'neutral',
    },
    {
      label: 'PROFILE',
      value: profile.full_name && profile.email ? 'READY' : 'NOT AVAILABLE',
      desc: 'Operator parameters configured',
      Icon: UserCheck,
      tone: profile.full_name && profile.email ? 'good' : 'neutral',
    },
    {
      label: 'WORKSPACE',
      value: workspaceName === 'NOT AVAILABLE' ? 'NOT AVAILABLE' : 'CONNECTED',
      desc: 'Assigned tenant space & organization',
      Icon: HardDrive,
      tone: workspaceName !== 'NOT AVAILABLE' ? 'good' : 'neutral',
    },
    {
      label: 'API CONNECTIVITY',
      value: apiStatus,
      desc: 'FastAPI gateway service health check',
      Icon: Server,
      tone: apiStatus === 'CONNECTED' ? 'good' : apiStatus === 'CHECKING' ? 'checking' : 'neutral',
    },
  ]

  const nominalCount = healthRows.filter((row) => row.tone === 'good').length

  const infoRows = [
    { label: 'FULL NAME', value: profile.full_name || 'NOT AVAILABLE', Icon: User },
    { label: 'DISPLAY NAME', value: profile.displayName || 'NOT AVAILABLE', Icon: UserCheck },
    { label: 'EMAIL', value: profile.email || 'NOT AVAILABLE', Icon: CheckCircle2 },
    { label: 'ROLE', value: profile.role || 'NOT AVAILABLE', Icon: ShieldCheck },
    { label: 'ACCOUNT STATUS', value: activeAccount ? 'ACTIVE' : 'NOT AVAILABLE', Icon: Activity },
    { label: 'MEMBER SINCE', value: formatDate(profile.created_at), Icon: Clock3 },
    { label: 'LAST LOGIN', value: 'NOT AVAILABLE', Icon: Clock3 },
  ]

  const renderOverview = () => (
    <div className="profile-overview">
      {/* Operator Identity Panel */}
      <section className="profile-panel profile-identity-panel">
        <div className="profile-panel-header">
          <div>
            <span className="profile-kicker">OPERATOR PROFILE</span>
            <h2 className="profile-panel-title">Account Identity</h2>
          </div>
          <span className={`profile-status-pill ${activeAccount ? 'is-active' : 'is-neutral'}`}>
            <span className="pulse-dot" />
            {activeAccount ? 'ACTIVE' : 'NOT AVAILABLE'}
          </span>
        </div>

        <div className="profile-operator-card">
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar profile-avatar--large">
              {profile.avatar ? (
                <img src={profile.avatar} alt="Operator Avatar" />
              ) : (
                <span className="profile-avatar-initials">{initials}</span>
              )}
              <span className={`profile-avatar-indicator ${activeAccount ? 'is-online' : ''}`} />
            </div>
            {editing && (
              <button
                type="button"
                className="profile-avatar-edit-overlay"
                onClick={() => fileInputRef.current?.click()}
                title="Change Avatar"
              >
                <ImagePlus size={16} />
              </button>
            )}
          </div>

          <div className="profile-operator-details">
            <h3 className="profile-operator-name" title={profile.full_name || 'Operator'}>
              {profile.full_name || 'NOT AVAILABLE'}
            </h3>
            <p className="profile-operator-email" title={profile.email || 'Email'}>
              {profile.email || 'NOT AVAILABLE'}
            </p>
            <div className="profile-meta-badges">
              <span className="profile-meta-badge role-badge">
                <ShieldCheck size={13} /> {profile.role || 'ROLE NOT AVAILABLE'}
              </span>
              <span className="profile-meta-badge org-badge" title={workspaceName}>
                <HardDrive size={13} /> {workspaceName === 'NOT AVAILABLE' ? 'WORKSPACE NOT AVAILABLE' : workspaceName}
              </span>
            </div>
          </div>
        </div>

        <div className="profile-hud-divider">
          <span>OPERATOR ATTRIBUTES</span>
        </div>

        <div className="profile-specs-list">
          {infoRows.map(({ label, value, Icon }) => (
            <div className="profile-spec-item" key={label}>
              <span className="profile-spec-label">
                <Icon size={15} className="profile-spec-icon" />
                {label}
              </span>
              <strong className="profile-spec-value" title={value}>
                {value}
              </strong>
            </div>
          ))}
        </div>

        <div className="profile-identity-foot">
          <div className="profile-id-block">
            <span className="profile-micro-label">ACCOUNT IDENTITY IDENTIFIER</span>
            <code className="profile-account-id">{user?.id || 'NOT AVAILABLE'}</code>
          </div>
          <button
            type="button"
            className="profile-btn profile-btn--secondary profile-btn--sm"
            onClick={startEditing}
          >
            <Pencil size={13} /> EDIT PROFILE
          </button>
        </div>
      </section>

      {/* Right Column: Workspace Summary & Account Health */}
      <div className="profile-overview-column">
        {/* Workspace Operational Panel */}
        <section className="profile-panel profile-workspace-panel">
          <div className="profile-panel-header">
            <div>
              <span className="profile-kicker">CURRENT ROLE & TENANT</span>
              <h2 className="profile-panel-title">Workspace Summary</h2>
            </div>
            <div className="profile-panel-corner-icon">
              <HardDrive size={22} />
            </div>
          </div>

          <div className="profile-hud-grid">
            {[
              { label: 'WORKSPACE', value: workspaceName, icon: Globe },
              { label: 'ROLE', value: profile.role || 'NOT AVAILABLE', icon: ShieldCheck },
              { label: 'ACCOUNT STATUS', value: activeAccount ? 'ACTIVE' : 'NOT AVAILABLE', icon: Activity, isGood: activeAccount },
              { label: 'AUTHENTICATION', value: activeAccount ? 'ACTIVE' : 'NOT AVAILABLE', icon: KeyRound, isGood: activeAccount },
              { label: 'SESSION STATUS', value: activeAccount && token ? 'ACTIVE' : 'NOT AVAILABLE', icon: Lock, isGood: Boolean(activeAccount && token) },
              { label: 'API CONNECTIVITY', value: apiStatus, icon: Server, isGood: apiStatus === 'CONNECTED' },
            ].map(({ label, value, icon: Icon, isGood }) => (
              <div className="profile-hud-tile" key={label}>
                <div className="profile-hud-tile-top">
                  <span className="profile-hud-label">{label}</span>
                  <Icon size={14} className="profile-hud-icon" />
                </div>
                <strong className={`profile-hud-value ${isGood ? 'tone-cyan' : ''}`} title={value}>
                  {isGood && <span className="micro-dot" />}
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <div className="profile-hud-note">
            <Info size={15} className="profile-note-icon" />
            <span>
              Workspace and identity values are populated directly from the current active authentication session context.
            </span>
          </div>
        </section>

        {/* Account Health Module */}
        <section className="profile-panel profile-health-panel">
          <div className="profile-panel-header">
            <div>
              <span className="profile-kicker">RUNTIME SIGNALS</span>
              <h2 className="profile-panel-title">Account Health</h2>
            </div>
            <div className="profile-health-score">
              <span className="profile-health-metric">
                <b>{String(nominalCount).padStart(2, '0')}</b> / {String(healthRows.length).padStart(2, '0')}
              </span>
              <span className="profile-health-tag">SIGNALS READY</span>
            </div>
          </div>

          <div className="profile-health-bar">
            <div
              className="profile-health-fill"
              style={{ width: `${(nominalCount / healthRows.length) * 100}%` }}
            />
          </div>

          <div className="profile-health-list">
            {healthRows.map(({ label, value, desc, Icon, tone }) => (
              <div className="profile-health-item" key={label}>
                <div className="profile-health-left">
                  <div className={`profile-health-icon-box tone-${tone}`}>
                    <Icon size={16} />
                  </div>
                  <div className="profile-health-info">
                    <span className="profile-health-label">{label}</span>
                    <span className="profile-health-desc">{desc}</span>
                  </div>
                </div>
                <div className="profile-health-right">
                  <span className={`profile-health-badge tone-${tone}`}>
                    <span className="badge-dot" />
                    {value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )

  const renderPersonal = () => (
    <section className="profile-panel profile-edit-panel">
      <div className="profile-panel-header">
        <div>
          <span className="profile-kicker">ACCOUNT IDENTITY PARAMETERS</span>
          <h2 className="profile-panel-title">Personal Information</h2>
        </div>
        <span className={`profile-edit-mode-tag ${editing ? 'is-editing' : 'is-readonly'}`}>
          <span className="mode-dot" />
          {editing ? 'EDIT MODE ENABLED' : 'READ ONLY'}
        </span>
      </div>

      <div className="profile-avatar-edit-card">
        <div className="profile-avatar profile-avatar--large">
          {profile.avatar ? (
            <img src={profile.avatar} alt="Profile" />
          ) : (
            <span className="profile-avatar-initials">{initials}</span>
          )}
        </div>
        <div className="profile-avatar-edit-copy">
          <div className="profile-avatar-edit-title">Operator Avatar & Image</div>
          <div className="profile-avatar-edit-subtitle">
            Supported formats: PNG, JPEG, WebP · Maximum size: 1 MB
          </div>
          <input
            ref={fileInputRef}
            className="profile-hidden-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={chooseAvatar}
            aria-label="Upload operator avatar"
          />
        </div>
        <div className="profile-avatar-actions">
          <button
            type="button"
            className="profile-btn profile-btn--secondary profile-btn--sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!editing}
          >
            <ImagePlus size={14} /> {profile.avatar ? 'CHANGE AVATAR' : 'UPLOAD IMAGE'}
          </button>
          {profile.avatar && (
            <button
              type="button"
              className="profile-btn profile-btn--danger profile-btn--sm"
              onClick={removeAvatar}
              disabled={!editing}
              title="Remove profile image"
            >
              <Trash2 size={14} /> REMOVE
            </button>
          )}
        </div>
      </div>

      <div className="profile-form-layout">
        <label className={`profile-form-group ${editing ? 'is-active-field' : ''}`}>
          <div className="profile-form-label-row">
            <span className="profile-form-label">
              Full Name <b className="required-star">*</b>
            </span>
            <span className="profile-form-hint">Official operator full name</span>
          </div>
          <input
            type="text"
            className="profile-text-input"
            value={profile.full_name}
            onChange={(e) => setProfile((c) => ({ ...c, full_name: e.target.value }))}
            readOnly={!editing}
            placeholder="Enter full name..."
            autoComplete="name"
            aria-invalid={Boolean(fieldError && !profile.full_name.trim())}
          />
        </label>

        <label className={`profile-form-group ${editing ? 'is-active-field' : ''}`}>
          <div className="profile-form-label-row">
            <span className="profile-form-label">
              Display Name <b className="required-star">*</b>
            </span>
            <span className="profile-form-hint">Console callsign / alias</span>
          </div>
          <input
            type="text"
            className="profile-text-input"
            value={profile.displayName}
            onChange={(e) => setProfile((c) => ({ ...c, displayName: e.target.value }))}
            readOnly={!editing}
            placeholder="Enter display name..."
          />
        </label>

        <label className="profile-form-group profile-form-group--full">
          <div className="profile-form-label-row">
            <span className="profile-form-label">Email Address</span>
            <span className="profile-badge-readonly">ACCOUNT IDENTIFIER · READ ONLY</span>
          </div>
          <input
            type="email"
            className="profile-text-input profile-text-input--readonly"
            value={profile.email}
            readOnly
            aria-readonly="true"
            autoComplete="email"
          />
          <span className="profile-field-desc">
            Primary email address is bound to your institutional security credentials and cannot be modified directly.
          </span>
        </label>
      </div>

      {fieldError && (
        <div className="profile-alert-banner is-error" role="alert">
          <AlertCircle size={16} />
          <span>{fieldError}</span>
        </div>
      )}

      {dirtyProfile && !editing && (
        <div className="profile-alert-banner is-warning" role="status">
          <AlertTriangle size={16} />
          <span>Unsaved profile changes are present. Click Edit Profile to review or save.</span>
        </div>
      )}

      <div className="profile-form-actions-bar">
        <p className="profile-form-disclaimer">
          Updated profile parameters persist to your active browser session and local workspace configuration.
        </p>

        <div className="profile-button-cluster">
          {editing ? (
            <>
              <button
                type="button"
                className="profile-btn profile-btn--secondary"
                onClick={cancelProfileEdit}
                disabled={saving}
              >
                <X size={15} /> CANCEL
              </button>
              <button
                type="button"
                className="profile-btn profile-btn--primary"
                onClick={saveProfile}
                disabled={saving || !dirtyProfile}
              >
                {saving ? (
                  <RefreshCw size={15} className="profile-spin-anim" />
                ) : (
                  <Save size={15} />
                )}
                {saving ? 'SAVING...' : 'SAVE CHANGES'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="profile-btn profile-btn--secondary"
              onClick={() => {
                setEditing(true)
                setFeedback(null)
              }}
            >
              <Pencil size={15} /> EDIT PROFILE
            </button>
          )}
        </div>
      </div>
    </section>
  )

  const updateNotification = (key, value) => {
    setPreferences((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: value },
    }))
  }

  const renderPreferences = () => (
    <div className="profile-preferences-wrapper">
      <div className="profile-prefs-grid">
        {/* Workspace Display & Map Card */}
        <section className="profile-panel profile-prefs-panel">
          <div className="profile-panel-header">
            <div>
              <span className="profile-kicker">WORKSPACE ENVIRONMENT</span>
              <h2 className="profile-panel-title">Display & Map Canvas</h2>
            </div>
            <SlidersHorizontal size={20} className="profile-panel-corner-icon" />
          </div>

          <div className="profile-prefs-body">
            {/* Theme Preference */}
            <div className="profile-pref-item">
              <div className="profile-pref-header">
                <span className="profile-pref-title">Theme Appearance</span>
                <span className="profile-pref-subtitle">
                  Interface color mode preference for this operator account
                </span>
              </div>
              <div className="profile-segmented-control" role="radiogroup">
                {['System', 'Dark', 'Light'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={preferences.theme === t}
                    className={`profile-segment-btn ${preferences.theme === t ? 'is-active' : ''}`}
                    onClick={() => setPreferences((c) => ({ ...c, theme: t }))}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Map Style */}
            <div className="profile-pref-item">
              <div className="profile-pref-header">
                <span className="profile-pref-title">Default Base Map</span>
                <span className="profile-pref-subtitle">
                  Initial cartographic layer for GIS analysis & review canvas
                </span>
              </div>
              <div className="profile-segmented-control" role="radiogroup">
                {['Default Base Map', 'Satellite', 'Light', 'Dark Topo'].map((map) => (
                  <button
                    key={map}
                    type="button"
                    role="radio"
                    aria-checked={preferences.mapPreference === map}
                    className={`profile-segment-btn ${
                      preferences.mapPreference === map ? 'is-active' : ''
                    }`}
                    onClick={() => setPreferences((c) => ({ ...c, mapPreference: map }))}
                  >
                    {map}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Zoom Level */}
            <div className="profile-pref-item">
              <div className="profile-pref-header">
                <span className="profile-pref-title">Default Map Zoom Level</span>
                <span className="profile-pref-subtitle">
                  Initial viewport magnification level (1 - 22)
                </span>
              </div>
              <div className="profile-zoom-controls">
                <input
                  type="number"
                  min="1"
                  max="22"
                  className="profile-text-input profile-zoom-input"
                  value={preferences.defaultZoom}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                    setPreferences((c) => ({ ...c, defaultZoom: val }))
                  }}
                />
                <div className="profile-zoom-presets">
                  {['10', '12', '14', '16'].map((z) => (
                    <button
                      key={z}
                      type="button"
                      className={`profile-btn profile-btn--sm ${
                        preferences.defaultZoom === z
                          ? 'profile-btn--primary'
                          : 'profile-btn--secondary'
                      }`}
                      onClick={() => setPreferences((c) => ({ ...c, defaultZoom: z }))}
                    >
                      Z{z}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Alert Routing & Assistant Card */}
        <section className="profile-panel profile-prefs-panel">
          <div className="profile-panel-header">
            <div>
              <span className="profile-kicker">OPERATOR NOTIFICATIONS</span>
              <h2 className="profile-panel-title">Alerts & AI Assistant</h2>
            </div>
            <Bell size={20} className="profile-panel-corner-icon" />
          </div>

          <div className="profile-prefs-body">
            <div className="profile-toggles-container">
              {[
                {
                  key: 'jobCompleted',
                  label: 'Job Completed Notifications',
                  desc: 'Notify when drone orthomosaic inference pipeline completes',
                },
                {
                  key: 'reviewAssigned',
                  label: 'Review Assigned Alerts',
                  desc: 'Notify when parcel boundary validation requires operator sign-off',
                },
                {
                  key: 'processingFailed',
                  label: 'Processing Failure Warnings',
                  desc: 'Immediate dispatch on pipeline or backend execution error',
                },
                {
                  key: 'systemWarning',
                  label: 'System Health & Resource Warnings',
                  desc: 'Alert when PostGIS or ML backend exceeds nominal thresholds',
                },
              ].map(({ key, label, desc }) => {
                const checked = Boolean(preferences.notifications[key])
                return (
                  <label className="profile-custom-switch-row" key={key}>
                    <div className="profile-switch-text">
                      <strong className="profile-switch-title">{label}</strong>
                      <span className="profile-switch-desc">{desc}</span>
                    </div>
                    <div className="profile-switch-control">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => updateNotification(key, e.target.checked)}
                      />
                      <span className="profile-switch-slider" />
                    </div>
                  </label>
                )
              })}

              <label className="profile-custom-switch-row">
                <div className="profile-switch-text">
                  <strong className="profile-switch-title">Show Assistant Launcher</strong>
                  <span className="profile-switch-desc">
                    Display quick-access AI copilot launcher widget in workspace
                  </span>
                </div>
                <div className="profile-switch-control">
                  <input
                    type="checkbox"
                    checked={preferences.assistant.showLauncher}
                    onChange={(e) =>
                      setPreferences((c) => ({
                        ...c,
                        assistant: { ...c.assistant, showLauncher: e.target.checked },
                      }))
                    }
                  />
                  <span className="profile-switch-slider" />
                </div>
              </label>

              <div className="profile-pref-item" style={{ paddingTop: '10px' }}>
                <div className="profile-pref-header">
                  <span className="profile-pref-title">Assistant Response Style</span>
                  <span className="profile-pref-subtitle">
                    Select cognitive reasoning and response verbosity
                  </span>
                </div>
                <div className="profile-segmented-control" role="radiogroup">
                  {['Concise', 'Detailed', 'Technical'].map((style) => (
                    <button
                      key={style}
                      type="button"
                      role="radio"
                      aria-checked={preferences.assistant.responseStyle === style}
                      className={`profile-segment-btn ${
                        preferences.assistant.responseStyle === style ? 'is-active' : ''
                      }`}
                      onClick={() =>
                        setPreferences((c) => ({
                          ...c,
                          assistant: { ...c.assistant, responseStyle: style },
                        }))
                      }
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Preferences Save/Reset Footer */}
      <div className="profile-prefs-footer">
        <div className="profile-prefs-status-tag">
          <span className={`status-indicator-dot ${dirtyPreferences ? 'is-dirty' : 'is-clean'}`} />
          <span>
            {dirtyPreferences ? 'UNSAVED PREFERENCE MODIFICATIONS' : 'ALL PREFERENCES SYNCHRONIZED'}
          </span>
        </div>
        <div className="profile-button-cluster">
          <button
            type="button"
            className="profile-btn profile-btn--secondary"
            onClick={resetPreferences}
          >
            <RotateCcw size={14} /> RESET DEFAULTS
          </button>
          <button
            type="button"
            className="profile-btn profile-btn--primary"
            onClick={savePreferences}
            disabled={!dirtyPreferences}
          >
            <Save size={14} /> SAVE PREFERENCES
          </button>
        </div>
      </div>
    </div>
  )

  const renderSecurity = () => (
    <div className="profile-security-wrapper">
      <div className="profile-security-grid">
        {/* Security Access Control Matrix */}
        <section className="profile-panel profile-security-panel">
          <div className="profile-panel-header">
            <div>
              <span className="profile-kicker">ACCESS CONTROL MATRIX</span>
              <h2 className="profile-panel-title">Security Status</h2>
            </div>
            <ShieldCheck size={22} className="profile-panel-corner-icon" />
          </div>

          <div className="profile-security-list">
            {[
              {
                label: 'AUTHENTICATION STATUS',
                value: activeAccount ? 'ACTIVE' : 'NOT AVAILABLE',
                good: activeAccount,
                desc: 'Operator bearer signature validated',
              },
              {
                label: 'SESSION TOKEN ENCRYPTION',
                value: activeAccount && token ? 'ACTIVE (SECURE)' : 'NOT AVAILABLE',
                good: Boolean(activeAccount && token),
                desc: 'Client-side isolated token storage',
              },
              {
                label: 'EMAIL VERIFICATION',
                value: 'NOT AVAILABLE',
                good: false,
                desc: 'External verification service offline',
              },
              {
                label: 'LAST AUTHENTICATION ACTIVITY',
                value: 'NOT AVAILABLE',
                good: false,
                desc: 'Audit trail endpoint not configured',
              },
              {
                label: 'SECURITY EVENTS LOG',
                value: 'NOT AVAILABLE',
                good: false,
                desc: 'Zero active vulnerability triggers recorded',
              },
            ].map(({ label, value, good, desc }) => (
              <div className="profile-security-row" key={label}>
                <div className="profile-security-label-block">
                  <span className="profile-security-title">{label}</span>
                  <span className="profile-security-desc">{desc}</span>
                </div>
                <strong className={`profile-security-badge ${good ? 'tone-good' : 'tone-neutral'}`}>
                  <span className="badge-dot" />
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <div className="profile-hud-note">
            <Lock size={15} className="profile-note-icon" />
            <span>
              The current institutional authentication service operates under zero-trust bearer token protocols. Password changes and event logs are managed via institutional IAM.
            </span>
          </div>
        </section>

        {/* Current Active Session & Credentials */}
        <section className="profile-panel profile-session-panel">
          <div className="profile-session-header-block">
            <div className="profile-session-icon-box">
              <KeyRound size={24} />
            </div>
            <div>
              <span className="profile-kicker">CURRENT SESSION METRICS</span>
              <h2 className="profile-panel-title">
                {activeAccount && token ? 'Active Operator Session' : 'Session Unavailable'}
              </h2>
            </div>
          </div>

          <p className="profile-session-copy">
            Your active session token authenticates requests to the GeoCadastra backend and PostGIS database services. To terminate your active credentials, sign out below.
          </p>

          <div className="profile-session-telemetry">
            <div className="profile-telemetry-item">
              <span>AUTHENTICATION PROTOCOL</span>
              <strong>JWT BEARER TOKEN</strong>
            </div>
            <div className="profile-telemetry-item">
              <span>STORAGE SCOPE</span>
              <strong>{localStorage.getItem('geoai-auth-session') ? 'PERSISTENT' : 'SESSION ONLY'}</strong>
            </div>
            <div className="profile-telemetry-item">
              <span>SESSION STATE</span>
              <strong className={activeAccount && token ? 'tone-cyan' : ''}>
                {activeAccount && token ? 'AUTHENTICATED' : 'UNAUTHENTICATED'}
              </strong>
            </div>
          </div>

          <div className="profile-session-actions">
            <button
              type="button"
              className="profile-btn profile-btn--secondary profile-btn--signout"
              onClick={signOut}
            >
              <LogOut size={15} /> TERMINATE SESSION & SIGN OUT
            </button>
            <button
              type="button"
              className="profile-btn profile-btn--disabled"
              disabled
              title="Password modification requires institutional directory access."
            >
              <Lock size={15} /> CHANGE PASSWORD · NOT AVAILABLE
            </button>
          </div>
        </section>
      </div>
    </div>
  )

  const renderActivity = () => (
    <section className="profile-panel profile-activity-panel">
      <div className="profile-panel-header">
        <div>
          <span className="profile-kicker">PERSISTED WORKSPACE RECORDS</span>
          <h2 className="profile-panel-title">Recent Account Activity</h2>
        </div>
        <div className="profile-activity-header-meta">
          <button
            type="button"
            className="profile-btn profile-btn--secondary profile-btn--xs"
            onClick={fetchSystemData}
            disabled={loadingSystem}
            title="Refresh activity logs"
          >
            <RefreshCw size={13} className={loadingSystem ? 'profile-spin-anim' : ''} /> REFRESH
          </button>
          <span className="profile-activity-count-badge">
            {recentJobs.length.toString().padStart(2, '0')} RECORDS
          </span>
        </div>
      </div>

      {/* Activity Summary Bar */}
      {recentJobs.length > 0 && (
        <div className="profile-activity-stats-bar">
          <div className="profile-act-stat">
            <span className="act-stat-label">TOTAL JOBS</span>
            <strong className="act-stat-val">{jobs.length}</strong>
          </div>
          <div className="profile-act-stat">
            <span className="act-stat-label">COMPLETED</span>
            <strong className="act-stat-val tone-cyan">{completedJobsCount}</strong>
          </div>
          <div className="profile-act-stat">
            <span className="act-stat-label">FAILED / ERRORS</span>
            <strong className="act-stat-val tone-amber">{failedJobsCount}</strong>
          </div>
          <div className="profile-act-stat">
            <span className="act-stat-label">DATA SOURCE</span>
            <strong className="act-stat-val">FASTAPI / HISTORY</strong>
          </div>
        </div>
      )}

      <p className="profile-hud-note-inline">
        Timeline records below reflect verified processing executions returned by the backend history service.
      </p>

      {!loadingSystem && !system.history && (
        <div className="profile-empty-activity">
          <AlertCircle size={26} className="empty-icon" />
          <div className="empty-title">WORKSPACE HISTORY NOT AVAILABLE</div>
          <p className="empty-desc">
            Unable to connect to the history telemetry service or no active database session exists.
          </p>
        </div>
      )}

      {!loadingSystem && system.history && recentJobs.length === 0 && (
        <div className="profile-empty-activity">
          <Activity size={26} className="empty-icon" />
          <div className="empty-title">NO WORKSPACE ACTIVITY RECORDS FOUND</div>
          <p className="empty-desc">
            Run a drone orthomosaic analysis job or parcel boundary extraction to populate telemetry records.
          </p>
        </div>
      )}

      {loadingSystem && (
        <div className="profile-empty-activity">
          <RefreshCw size={26} className="profile-spin-anim empty-icon" />
          <div className="empty-title">FETCHING WORKSPACE TELEMETRY...</div>
        </div>
      )}

      {!loadingSystem && recentJobs.length > 0 && (
        <div className="profile-timeline-track">
          {recentJobs.map((job, index) => {
            const rawStatus = String(job.status || 'NOT AVAILABLE').toLowerCase()
            const isDone = rawStatus === 'completed' || rawStatus === 'done' || rawStatus === 'ok'
            const isError = rawStatus === 'failed' || rawStatus === 'error'
            const statusLabel = String(job.status || 'NOT AVAILABLE').replaceAll('_', ' ').toUpperCase()
            const title = job.input_filename
              ? `Orthomosaic Analysis · ${job.input_filename}`
              : `Processing Job ${job.job_id || 'NOT AVAILABLE'}`
            const timestamp = formatDate(job.completed_at || job.created_at)

            return (
              <article
                className={`profile-timeline-node ${isDone ? 'is-done' : isError ? 'is-err' : ''}`}
                key={job.job_id || `${timestamp}-${index}`}
              >
                <div className="profile-node-pin">
                  {isDone ? <Check size={14} /> : isError ? <AlertCircle size={14} /> : <Map size={14} />}
                </div>

                <div className="profile-node-card">
                  <div className="profile-node-header">
                    <strong className="profile-node-title" title={title}>
                      {title}
                    </strong>
                    <span
                      className={`profile-node-status-tag ${
                        isDone ? 'is-done' : isError ? 'is-err' : 'is-pending'
                      }`}
                    >
                      <span className="status-dot" />
                      {statusLabel}
                    </span>
                  </div>

                  <div className="profile-node-body">
                    <div className="profile-node-meta">
                      <span className="node-meta-item">
                        <Terminal size={13} /> <code>{job.job_id || 'JOB ID NOT AVAILABLE'}</code>
                      </span>
                      {job.model_name && (
                        <span className="node-meta-item">
                          <Cpu size={13} /> {job.model_name}
                        </span>
                      )}
                    </div>
                    <time className="profile-node-timestamp">{timestamp}</time>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )

  const renderPanel = () => {
    switch (activeTab) {
      case 'PERSONAL INFORMATION':
        return renderPersonal()
      case 'PREFERENCES':
        return renderPreferences()
      case 'SECURITY':
        return renderSecurity()
      case 'ACTIVITY':
        return renderActivity()
      default:
        return renderOverview()
    }
  }

  const hasUnsaved = dirtyProfile || (activeTab === 'PREFERENCES' && dirtyPreferences)
  const saveLabel = saving
    ? 'SAVING...'
    : feedback?.type === 'success'
    ? 'CHANGES SAVED'
    : 'SAVE CHANGES'

  return (
    <div className="workspace-page profile-page">
      <PageHeader
        eyebrow="ACCOUNT CENTER"
        title="Account & Profile"
        subtitle="Workspace identity, preferences, security and activity."
        actions={
          <div className="profile-header-actions">
            <button
              className="profile-btn profile-btn--secondary"
              type="button"
              onClick={startEditing}
            >
              <Pencil size={14} /> EDIT PROFILE
            </button>
            <button
              className="profile-btn profile-btn--primary"
              type="button"
              onClick={saveCurrentTab}
              disabled={
                saving ||
                (activeTab === 'PERSONAL INFORMATION' && !dirtyProfile) ||
                (activeTab === 'PREFERENCES' && !dirtyPreferences)
              }
            >
              {saving ? (
                <RefreshCw size={15} className="profile-spin-anim" />
              ) : (
                <Save size={15} />
              )}
              {saveLabel}
            </button>
          </div>
        }
      />

      {/* Top Technical Metadata HUD Bar */}
      <div className="profile-hud-hero-bar">
        <div className="profile-hud-hero-item">
          <span className="hero-hud-pulse" />
          <span className="hero-hud-label">OPERATOR PROFILE</span>
          <b className="hero-hud-status tone-cyan">
            {activeAccount ? '● ACTIVE' : '● NOT AVAILABLE'}
          </b>
        </div>
        <div className="profile-hud-hero-divider" />
        <div className="profile-hud-hero-item">
          <span className="hero-hud-label">ACCOUNT IDENTITY</span>
          <code className="hero-hud-val">{user?.id || user?.email || 'NOT AVAILABLE'}</code>
        </div>
        <div className="profile-hud-hero-divider" />
        <div className="profile-hud-hero-item">
          <span className="hero-hud-label">WORKSPACE STATUS</span>
          <b className="hero-hud-val">
            {workspaceName === 'NOT AVAILABLE' ? 'NOT AVAILABLE' : 'ACTIVE INSTANCE'}
          </b>
        </div>
        <div className="profile-hud-hero-divider" />
        <div className="profile-hud-hero-item">
          <span className="hero-hud-label">API GATEWAY</span>
          <b
            className={`hero-hud-val ${
              apiStatus === 'CONNECTED' ? 'tone-cyan' : apiStatus === 'CHECKING' ? 'tone-amber' : ''
            }`}
          >
            {apiStatus}
          </b>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className={`profile-feedback-alert is-${feedback.type}`} role="status">
          {feedback.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Unsaved Changes Banner */}
      {hasUnsaved && (
        <div className="profile-unsaved-warning-bar" role="status">
          <AlertTriangle size={16} />
          <span>UNSAVED MODIFICATIONS PENDING · SAVE OR DISCARD BEFORE LEAVING THIS VIEW</span>
        </div>
      )}

      {/* Main Account Shell */}
      <section className="profile-console-shell" aria-label="Account profile workspace">
        {/* Navigation Tabs */}
        <div className="profile-tabs-header" role="tablist" aria-label="Account sections">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isSelected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`profile-tab-button ${isSelected ? 'is-active-tab' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="profile-tab-num">{tab.num}</span>
                <Icon size={16} className="profile-tab-icon" />
                <span className="profile-tab-text">{tab.label}</span>
                {isSelected && <span className="profile-tab-indicator" />}
              </button>
            )
          })}
        </div>

        {/* Tab Panel Content */}
        <div className="profile-view-port" role="tabpanel" key={activeTab}>
          {renderPanel()}
        </div>
      </section>

      {/* Technical Footer Telemetry */}
      <footer className="profile-console-footer">
        <div className="profile-footer-left">
          <span>
            <Database size={14} /> ACCOUNT SIGNALS LOADED FROM SECURE SESSION CONTEXT
          </span>
        </div>
        <div className="profile-footer-right">
          <span>
            <Server size={14} /> FASTAPI GATEWAY: <b>{apiStatus}</b>
          </span>
          <span className="footer-bullet">•</span>
          <span>
            <Lock size={14} /> ENCRYPTION: <b>AES-256 / TLS</b>
          </span>
        </div>
      </footer>
    </div>
  )
}
