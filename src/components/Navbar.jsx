import { useEffect, useState } from 'react'
import { Boxes } from 'lucide-react'
import { mockAuth } from '../utils/mockAuth'

export default function Navbar({ navigate }) {
  const [scrolled, setScrolled] = useState(false)
  const session = mockAuth.getSession()

  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])

  return (
    <header className={`nav-wrap ${scrolled ? 'nav-wrap--scrolled' : ''}`}>
      <nav>
        <button className="brand" onClick={() => navigate('/')} aria-label="GeoCadastra home">
          <span>◈</span>GEOCADASTRA <em>AI</em>
        </button>
        <div className="nav-links">
          {['Home', 'Platform', 'Analysis', 'Cadastral Map', 'Models', 'About'].map((item) => (
            <a key={item} href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}>
              {item}
            </a>
          ))}
        </div>
        
        {session ? (
          <button className="btn btn--small" onClick={() => navigate('/dashboard')}>
            Go to Dashboard <span>📋</span>
          </button>
        ) : (
          <button className="btn btn--small" onClick={() => navigate('/login')}>
            Launch Platform <span>↗</span>
          </button>
        )}
      </nav>
    </header>
  )
}
