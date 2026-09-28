import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="workspace centered" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
      <section className="panel" style={{ maxWidth: 560, padding: '48px 30px', textAlign: 'center' }}>
        <p className="eyebrow">404</p>
        <h1>PAGE NOT FOUND</h1>
        <p style={{ color: '#9AA9BC', lineHeight: 1.7 }}>Looks like this spatial coordinate doesn’t exist.</p>
        <Link to="/" className="primary-button" style={{ display: 'inline-flex', marginTop: 12 }}>RETURN HOME</Link>
      </section>
    </main>
  )
}
