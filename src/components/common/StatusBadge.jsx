const toneByStatus = {
  COMPLETED: ['var(--success)', 'rgba(46, 212, 122, 0.12)'],
  PASS: ['var(--success)', 'rgba(46, 212, 122, 0.12)'],
  ACTIVE: ['var(--success)', 'rgba(46, 212, 122, 0.12)'],
  RUNNING: ['var(--cyan)', 'rgba(57, 243, 208, 0.12)'],
  REVIEW_REQUIRED: ['var(--warning)', 'rgba(244, 183, 64, 0.12)'],
  FAILED: ['var(--error)', 'rgba(255, 107, 107, 0.12)'],
  ERROR: ['var(--error)', 'rgba(255, 107, 107, 0.12)'],
}

export default function StatusBadge({ status, label, size = 'md' }) {
  const value = String(label || status || 'NOT AVAILABLE').toUpperCase()
  const [color, background] = toneByStatus[String(status || '').toUpperCase()] || ['var(--muted)', 'rgba(143, 164, 184, 0.12)']
  return (
    <span className={`status-badge status-badge-${size}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: size === 'sm' ? '4px 8px' : '6px 10px', border: `1px solid ${color}`, borderRadius: '4px', background, color, fontSize: size === 'sm' ? '10px' : '11px', fontWeight: 800, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
      <span className="status-badge-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
      {value}
    </span>
  )
}
