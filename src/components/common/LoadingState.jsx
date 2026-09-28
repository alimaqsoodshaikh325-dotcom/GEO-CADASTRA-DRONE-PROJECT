export default function LoadingState({ label = 'Loading...' }) {
  return <div className="panel" style={{ color: 'var(--muted)', textAlign: 'center' }} aria-live="polite">{label}</div>
}
