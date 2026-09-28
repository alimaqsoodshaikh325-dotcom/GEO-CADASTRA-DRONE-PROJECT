export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '22px' }}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title" style={{ margin: '8px 0 8px', fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>{title}</h1>
        {subtitle && <p className="page-subtitle lede" style={{ margin: 0, fontSize: '14px' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
    </header>
  )
}
