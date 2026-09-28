import { motion } from 'framer-motion'
import GravitationalVortex from './GravitationalVortex'
import UrbanNetwork from './UrbanNetwork'
import HeroStats from './HeroStats'

export default function Hero({ navigate }) {
  return (
    <section id="top" className="hero">
      <div className="hero-copy">
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="eyebrow"
        >
          AI-powered cadastral intelligence
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          Transform drone imagery<br />into <span>intelligent city maps.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lede"
        >
          Automatically detect buildings, extract precise footprints, and transform aerial imagery into structured cadastral insights.
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="hero-actions"
          style={{ flexWrap: 'wrap', gap: '10px' }}
        >
          <button className="btn" onClick={() => navigate('/login')}>
            Launch Platform <span>↗</span>
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('/dashboard')}>
            Explore Platform <span>📋</span>
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('/analysis?demo=true')}>
            Watch AI Demo <span>▷</span>
          </button>
        </motion.div>
      </div>

      <div className="hero-visual">
        <GravitationalVortex />
        <UrbanNetwork />
        <div className="orbit orbit--one" />
        <div className="orbit orbit--two" />
      </div>
      
      <HeroStats />
    </section>
  )
}
