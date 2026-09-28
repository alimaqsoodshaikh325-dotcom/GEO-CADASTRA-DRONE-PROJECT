import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Clock3,
  Clipboard,
  Database,
  HardDrive,
  Info,
  LoaderCircle,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import { api } from '../services/api'
import './SettingsPage.css'

function normalizeStatus(value, fallback = 'NOT VERIFIED') {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const normalized = value.trim().replace(/[_-]+/g, ' ').toUpperCase()
  if (normalized === 'OK') return 'CONNECTED'
  return normalized
}

function statusTone(status) {
  const normalized = status.toLowerCase()
  if (['connected', 'available'].includes(normalized)) return 'connected'
  if (normalized === 'checking') return 'checking'
  if (['unavailable', 'offline', 'error'].includes(normalized)) return 'error'
  return 'unverified'
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'NOT AVAILABLE'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(timestamp)
}

function safeApiBaseUrl() {
  if (import.meta.env.DEV && !api.baseUrl) return 'SAME-ORIGIN · VITE DEV PROXY'
  if (!api.baseUrl) return 'NOT AVAILABLE'
  try {
    const url = new URL(api.baseUrl, window.location.origin)
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return 'NOT AVAILABLE'
  }
}

function getRequestErrorCode(error) {
  if (typeof error?.status === 'number' && error.status > 0) return `HTTP ${error.status}`
  return 'REQUEST FAILED'
}

function StatusBadge({ status }) {
  const tone = statusTone(status)
  const StatusIcon = tone === 'connected'
    ? CheckCircle2
    : tone === 'checking'
      ? LoaderCircle
      : tone === 'error'
        ? CircleAlert
        : CircleHelp
  return (
    <span className={`settings-status settings-status--${tone}`} role="status" aria-label={`Status: ${status}`}>
      <StatusIcon size={12} aria-hidden="true" />
      {status}
    </span>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [health, setHealth] = useState(null)
  const [postgis, setPostgis] = useState(null)
  const [requestErrors, setRequestErrors] = useState({ health: null, postgis: null })
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState(null)
  const [actionMessage, setActionMessage] = useState('')
  const [copyState, setCopyState] = useState('idle')

  const load = useCallback(async () => {
    setLoading(true)
    setActionMessage('')
    setCopyState('idle')
    const [healthResult, postgisResult] = await Promise.allSettled([
      api.getHealth(),
      api.getPostgisStatus(),
    ])
    setHealth(healthResult.status === 'fulfilled' ? healthResult.value : null)
    setPostgis(postgisResult.status === 'fulfilled' ? postgisResult.value : null)
    setRequestErrors({
      health: healthResult.status === 'rejected' ? healthResult.reason : null,
      postgis: postgisResult.status === 'rejected' ? postgisResult.reason : null,
    })
    setLastChecked(Date.now())
    setLoading(false)

    if (healthResult.status === 'rejected' || postgisResult.status === 'rejected') {
      setActionMessage('One or more service checks returned an error. See the connectivity details below.')
    } else {
      setActionMessage('Connectivity check complete. Statuses below reflect the returned service data.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const serviceStatuses = useMemo(() => {
    const apiStatus = requestErrors.health
      ? 'ERROR'
      : normalizeStatus(health?.status)
    const databaseStatus = requestErrors.health
      ? 'NOT VERIFIED'
      : normalizeStatus(health?.database?.status)
    const postgisStatus = requestErrors.postgis
      ? 'ERROR'
      : normalizeStatus(postgis?.status)
    return [
      {
        id: 'api',
        name: 'FastAPI service',
        status: loading ? 'CHECKING' : apiStatus,
        detail: requestErrors.health ? getRequestErrorCode(requestErrors.health) : health?.service || health?.name || 'Health endpoint response',
        endpoint: '/health',
        icon: Server,
      },
      {
        id: 'database',
        name: 'Database',
        status: loading ? 'CHECKING' : databaseStatus,
        detail: requestErrors.health ? 'Health response unavailable' : health?.database?.database || 'Database detail not returned',
        endpoint: 'database field · /health',
        icon: Database,
      },
      {
        id: 'postgis',
        name: 'PostGIS service',
        status: loading ? 'CHECKING' : postgisStatus,
        detail: requestErrors.postgis
          ? getRequestErrorCode(requestErrors.postgis)
          : postgis?.version || postgis?.service || postgis?.name || 'Status endpoint response',
        endpoint: '/api/postgis/status',
        icon: ShieldCheck,
      },
    ]
  }, [health, loading, postgis, requestErrors])

  const environment = import.meta.env.DEV ? 'DEVELOPMENT' : 'PRODUCTION BUILD'
  const baseUrl = safeApiBaseUrl()
  const hasCompletedCheck = lastChecked !== null

  const goBack = () => {
    if (window.history.state?.idx > 0 && location.key !== 'default') {
      navigate(-1)
      return
    }
    navigate('/dashboard')
  }

  const copyDiagnostics = async () => {
    const lines = ['GEOCADASTRA SYSTEM STATUS']
    for (const service of serviceStatuses) {
      if (service.status !== 'CHECKING' && service.status !== 'NOT VERIFIED') {
        lines.push(`${service.name.toUpperCase()}: ${service.status}`)
      }
    }
    if (lastChecked) lines.push(`LAST CHECKED: ${formatTimestamp(lastChecked)}`)
    if (health?.version) lines.push(`API VERSION: ${String(health.version)}`)
    if (postgis?.version) lines.push(`POSTGIS VERSION: ${String(postgis.version)}`)

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopyState('copied')
      setActionMessage('Safe diagnostic summary copied to the clipboard.')
    } catch {
      setCopyState('error')
      setActionMessage('Clipboard access failed. No diagnostic data was copied.')
    }
  }

  const detailRows = [
    ['API base URL', baseUrl],
    ['Application mode', environment],
    ['API service', health?.service || health?.name || 'NOT AVAILABLE'],
    ['API version', health?.version ? String(health.version) : 'NOT AVAILABLE'],
    ['Database status', health?.database?.status ? normalizeStatus(health.database.status) : 'NOT AVAILABLE'],
    ['Database type', health?.database?.database || 'NOT AVAILABLE'],
    ['PostGIS status', postgis?.status ? normalizeStatus(postgis.status) : 'NOT AVAILABLE'],
    ['PostGIS version', postgis?.version ? String(postgis.version) : 'NOT AVAILABLE'],
    ['Last checked', formatTimestamp(lastChecked)],
  ]

  return (
    <div className="workspace-page settings-page">
      <div className="settings-topline">
        <button className="settings-back" type="button" onClick={goBack}>
          <ArrowLeft size={15} aria-hidden="true" />
          BACK
        </button>
        <span className="settings-mode"><Info size={13} aria-hidden="true" /> LIVE ENVIRONMENT CHECKS</span>
      </div>

      <PageHeader
        eyebrow="SYSTEM SETTINGS"
        title="System Settings"
        subtitle="Service configuration and connectivity reported by the current environment."
        actions={(
          <button className="btn-geo btn-geo-secondary settings-refresh" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'settings-spin' : ''} aria-hidden="true" />
            {loading ? 'Checking' : 'Refresh'}
          </button>
        )}
      />

      <section className="settings-console" aria-labelledby="settings-connectivity-title">
        <div className="settings-console__heading">
          <div>
            <p className="settings-eyebrow">SYSTEM HEALTH · LIVE RESPONSE</p>
            <h2 id="settings-connectivity-title">Service Connectivity</h2>
            <p>FastAPI and PostGIS are queried through the existing application API client.</p>
          </div>
          <div className={`settings-check-state${loading ? ' is-loading' : ''}`} aria-live="polite">
            {loading ? <RefreshCw size={13} className="settings-spin" aria-hidden="true" /> : <CircleCheckIcon />}
            {loading ? 'CHECKING SERVICES' : hasCompletedCheck ? 'CHECK COMPLETE' : 'NOT VERIFIED'}
          </div>
        </div>

        <div className="settings-health-summary" aria-label="Current service statuses">
          {serviceStatuses.map((service) => (
            <div className="settings-health-summary__item" key={service.id}>
              <span>{service.name}</span>
              <StatusBadge status={service.status} />
            </div>
          ))}
        </div>

        <div className="settings-service-grid">
          {serviceStatuses.map((service) => {
            const Icon = service.icon
            return (
              <article className="settings-service-card" key={service.id} tabIndex="0">
                <div className="settings-service-card__top">
                  <span className="settings-service-card__icon"><Icon size={18} aria-hidden="true" /></span>
                  <span className="settings-service-card__endpoint">{service.endpoint}</span>
                </div>
                <div className="settings-service-card__identity">
                  <div><span className="settings-eyebrow">SERVICE</span><h3>{service.name}</h3></div>
                  <StatusBadge status={service.status} />
                </div>
                <div className="settings-service-card__detail">
                  <span>AVAILABLE INFORMATION</span>
                  <strong>{service.detail}</strong>
                </div>
                <div className="settings-service-card__last">
                  <span>LAST CHECKED</span>
                  <time dateTime={lastChecked ? new Date(lastChecked).toISOString() : undefined}>
                    {formatTimestamp(lastChecked)}
                  </time>
                </div>
              </article>
            )
          })}
        </div>

        <div className="settings-console__footer">
          <p aria-live="polite">{actionMessage || (loading ? 'Checking service connectivity…' : 'Service states are based on the latest completed check.')}</p>
          <span>NO SYNTHETIC HEALTH DATA</span>
        </div>
      </section>

      <section className="settings-summary-grid" aria-label="Environment summary">
        <article className="settings-summary-card">
          <div className="settings-summary-card__head"><span className="settings-summary-card__icon"><Clock3 size={16} aria-hidden="true" /></span><span>LAST CHECKED</span></div>
          <strong>{formatTimestamp(lastChecked)}</strong>
          <small>{hasCompletedCheck ? 'Timestamp recorded after the latest endpoint check' : 'No completed check yet'}</small>
        </article>
        <article className="settings-summary-card">
          <div className="settings-summary-card__head"><span className="settings-summary-card__icon"><Server size={16} aria-hidden="true" /></span><span>ENVIRONMENT</span></div>
          <strong>{environment}</strong>
          <small>{import.meta.env.DEV ? 'Development client configuration' : 'Built frontend configuration'}</small>
        </article>
        <article className="settings-summary-card">
          <div className="settings-summary-card__head"><span className="settings-summary-card__icon"><HardDrive size={16} aria-hidden="true" /></span><span>API BASE URL</span></div>
          <strong className="settings-summary-card__url">{baseUrl}</strong>
          <small>Credentials and URL parameters are not displayed</small>
        </article>
      </section>

      <div className="settings-details-grid">
        <details className="settings-disclosure">
          <summary>
            <span><Database size={16} aria-hidden="true" /> CONNECTION DETAILS</span>
            <span className="settings-disclosure__summary-actions">
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </summary>
          <div className="settings-disclosure__clip">
            <div className="settings-disclosure__body">
              {detailRows.map(([label, value]) => (
                <div className="settings-detail-row" key={label}>
                  <span>{label}</span><strong>{value}</strong>
                </div>
              ))}
              <button className="settings-disclosure__copy" type="button" onClick={copyDiagnostics} disabled={loading || !hasCompletedCheck}>
                {copyState === 'copied' ? <Check size={13} aria-hidden="true" /> : <Clipboard size={13} aria-hidden="true" />}
                {copyState === 'copied' ? 'COPIED' : 'COPY SAFE DIAGNOSTICS'}
              </button>
            </div>
          </div>
        </details>

        <section className="settings-diagnostics">
          <div>
            <span className="settings-diagnostics__icon"><Clipboard size={17} aria-hidden="true" /></span>
            <div>
              <span className="settings-eyebrow">SAFE EXPORT</span>
              <h3>Diagnostic summary</h3>
              <p>Copies only returned status labels, available versions, and the actual last-check time.</p>
            </div>
          </div>
          <div className="settings-diagnostics__statuses" aria-label="Diagnostic status summary">
            {serviceStatuses.map((service) => <span key={service.id}>{service.name}: <b>{service.status}</b></span>)}
          </div>
          <button className="settings-copy" type="button" onClick={copyDiagnostics} disabled={loading || !hasCompletedCheck}>
            {copyState === 'copied' ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
            {copyState === 'copied' ? 'COPIED' : 'COPY DIAGNOSTICS'}
          </button>
          {copyState === 'error' && <p className="settings-copy-error" role="alert">Clipboard access failed. Try again in a supported browser context.</p>}
        </section>
      </div>
    </div>
  )
}

function CircleCheckIcon() {
  return <CheckCircle2 size={13} aria-hidden="true" />
}
