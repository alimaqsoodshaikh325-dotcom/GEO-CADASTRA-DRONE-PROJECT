export default function CoordinateSpaceBadge({ space, crs }) {
  const geographic = String(space || '').toLowerCase() === 'geographic'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '4px', color: geographic ? 'var(--success)' : 'var(--warning)', background: 'rgba(10, 27, 42, 0.5)', fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {geographic ? 'GEOGRAPHIC' : 'PIXEL'}{crs ? ` · ${crs}` : ''}
    </span>
  )
}
