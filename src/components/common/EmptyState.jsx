export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction, actionIcon: ActionIcon }) {
  return (
    <section className="empty-state-panel" style={{ padding: '32px 24px', textAlign: 'center' }}>
      {Icon && <Icon size={28} style={{ color: 'var(--cyan)', marginBottom: '10px' }} />}
      <strong style={{ color: 'var(--white)', letterSpacing: '0.08em', fontSize: '12px' }}>{title}</strong>
      {description && <p style={{ maxWidth: '560px', color: 'var(--muted)', margin: '8px auto 0', fontSize: '13px', letterSpacing: 0, textTransform: 'none' }}>{description}</p>}
      {actionLabel && onAction && (
        <button className="btn primary" onClick={onAction} style={{ marginTop: '16px' }}>
          {ActionIcon && <ActionIcon size={14} />}
          {actionLabel}
        </button>
      )}
    </section>
  )
}
