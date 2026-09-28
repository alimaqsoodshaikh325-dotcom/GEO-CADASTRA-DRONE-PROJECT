import { useEffect, useState } from 'react'
import { api } from '../../services/api'

// Compact inline system status bar for the top header
export default function SystemStatus({ layout = 'column' }) {
  const [health, setHealth]   = useState(null) // null=checking, false=offline, obj=ok
  const [pgData, setPgData]   = useState(null)

  useEffect(() => {
    let active = true

    api.getHealth()
      .then(d => { if (active) setHealth(d) })
      .catch(() => { if (active) setHealth(false) })

    api.getDashboardSummary()
      .then(d => { if (active) setPgData(d) })
      .catch(() => { if (active) setPgData(false) })

    return () => { active = false }
  }, [])

  const apiStatus  = health === null ? 'checking' : health === false ? 'offline' : 'online'
  const dbStatus   = health === null ? 'checking' : health?.database?.status === 'connected' ? 'online' : health?.database?.status === 'ok' ? 'online' : health === false ? 'offline' : 'unknown'
  const pgStatus   = pgData === null ? 'checking' : pgData === false ? 'unknown' : pgData?.postgis?.status === 'available' ? 'online' : pgData?.postgis?.status === 'not_configured' ? 'n/a' : 'unknown'

  const dot = (status) => {
    const color = status === 'online' ? '#16A34A'
      : status === 'offline' ? '#DC2626'
      : status === 'checking' ? '#D97706'
      : '#94A3B8'
    return (
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        display: 'inline-block', flexShrink: 0,
      }} />
    )
  }

  const items = [
    { key: 'api', label: 'API', status: apiStatus },
    { key: 'database', label: 'Database', status: dbStatus },
    { key: 'postgis', label: 'PostGIS', status: pgStatus },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      color: '#64748B',
    }}>
      {items.map(({ key, label, status }) => (
        <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {dot(status)}
          <span style={{ color: status === 'online' ? '#17212B' : status === 'offline' ? '#DC2626' : '#64748B' }}>
            {label}
          </span>
        </span>
      ))}
    </div>
  )
}
