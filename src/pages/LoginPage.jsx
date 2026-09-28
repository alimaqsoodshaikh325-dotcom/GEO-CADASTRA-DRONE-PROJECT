import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Compass,
  Cpu,
  Eye,
  EyeOff,
  Radio,
  ShieldAlert,
  ShieldCheck,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loading: authLoading } = useAuth()

  // Initialize form with query params if redirected from registration
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const emailParam = params.get('email')
    const registeredParam = params.get('registered')

    if (emailParam) {
      setForm((prev) => ({ ...prev, email: emailParam }))
    }
    if (registeredParam === 'true') {
      setSocialNotice('Workspace provisioned successfully. Please enter your password to sign in.')
    }
  }, [location.search])

  // Form states
  const [form, setForm] = useState({ email: '', password: '' })
  const [touched, setTouched] = useState({ email: false, password: false })
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  // Feedback states
  const [submitting, setSubmitting] = useState(false)
  const [socialLoading, setSocialLoading] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [socialNotice, setSocialNotice] = useState('')

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStatus, setForgotStatus] = useState({ loading: false, success: false, error: '' })

  // Validate single field
  const validateField = (name, value) => {
    let error = ''
    if (name === 'email') {
      if (!value.trim()) {
        error = 'Work email is required.'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        error = 'Please enter a valid work email address.'
      }
    } else if (name === 'password') {
      if (!value) {
        error = 'Password is required.'
      } else if (value.length < 8) {
        error = 'Password must be at least 8 characters.'
      }
    }
    return error
  }

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (authError) setAuthError('')
    if (socialNotice) setSocialNotice('')

    if (touched[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }))
    }
  }

  const onBlur = (e) => {
    const { name, value } = e.target
    setTouched((prev) => ({ ...prev, [name]: true }))
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')

    const emailErr = validateField('email', form.email)
    const passErr = validateField('password', form.password)

    setTouched({ email: true, password: true })
    setFieldErrors({ email: emailErr, password: passErr })

    if (emailErr || passErr) {
      return
    }

    setSubmitting(true)
    try {
      const response = await login(form.email.trim(), form.password, rememberMe)
      if (!response.ok) {
        setAuthError(response.error || 'Invalid work email or password.')
        setSubmitting(false)
        return
      }

      setAuthSuccess('Authentication verified. Launching geospatial workspace...')
      const searchParams = new URLSearchParams(location.search)
      const next = searchParams.get('next') || searchParams.get('redirect') || '/dashboard'
      setTimeout(() => {
        navigate(next)
      }, 400)
    } catch {
      setAuthError('Connection failure. Unable to reach authentication service.')
      setSubmitting(false)
    }
  }

  // Social SSO handler
  const handleSocialClick = (provider) => {
    setSocialLoading(provider)
    setSocialNotice('')
    setAuthError('')

    setTimeout(() => {
      setSocialLoading('')
      setSocialNotice(`${provider} Enterprise SSO is ready. In this operational workspace, you can sign in directly using your work email.`)
    }, 700)
  }

  // Forgot password submit
  const handleForgotSubmit = (e) => {
    e.preventDefault()
    if (!forgotEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) {
      setForgotStatus({ loading: false, success: false, error: 'Please enter a valid work email.' })
      return
    }

    setForgotStatus({ loading: true, success: false, error: '' })
    setTimeout(() => {
      setForgotStatus({ loading: false, success: true, error: '' })
    }, 800)
  }

  // Keyboard escape handler for modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && forgotModalOpen) {
        setForgotModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [forgotModalOpen])

  // Parallax interaction state for left visual experience
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 })

  const handleVisualMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setMouseOffset({ x, y })
  }

  const handleVisualMouseLeave = () => {
    setMouseOffset({ x: 0, y: 0 })
  }

  const isLoading = submitting || authLoading

  return (
    <main className="geo-auth-container">
      {/* ========================================================
          LEFT HALF: Geospatial Intelligence Visual Experience
          ======================================================== */}
      <section
        className="geo-auth-left"
        aria-label="Geospatial Intelligence Telemetry"
        onMouseMove={handleVisualMouseMove}
        onMouseLeave={handleVisualMouseLeave}
      >
        {/* Corner Reticle Brackets matching reference HUD */}
        <div className="geo-hud-bracket tl" />
        <div className="geo-hud-bracket tr" />
        <div className="geo-hud-bracket bl" />
        <div className="geo-hud-bracket br" />

        {/* Map Background Layer & SVG Cadastral Vectors */}
        <div className="geo-auth-map-layer">
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `radial-gradient(circle at 45% 55%, rgba(4, 18, 36, 0.35), rgba(3, 8, 18, 0.96)), url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1400&q=80')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.45,
              transform: `translate3d(${mouseOffset.x * -6}px, ${mouseOffset.y * -6}px, 0)`,
              transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
          />

          <div className="geo-auth-grid-overlay" />
          <div className="geo-auth-depth-glow" />
          <div className="geo-auth-scanner-swath" />
          <div className="geo-auth-radar-scan" />

          {/* Interactive Cadastral Polygons with Corner Nodes & Realistic Parcel Network */}
          <svg
            viewBox="0 0 720 920"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              transform: `translate3d(${mouseOffset.x * 10}px, ${mouseOffset.y * 10}px, 0)`,
              transition: 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            aria-hidden="true"
          >
            {/* Coordinate Grid Crosshairs & Survey Baselines */}
            <line x1="280" y1="0" x2="280" y2="920" stroke="rgba(0, 240, 255, 0.14)" strokeDasharray="4 4" />
            <line x1="500" y1="0" x2="500" y2="920" stroke="rgba(0, 240, 255, 0.1)" strokeDasharray="4 4" />
            <line x1="0" y1="420" x2="720" y2="420" stroke="rgba(0, 240, 255, 0.14)" strokeDasharray="4 4" />
            <line x1="0" y1="680" x2="720" y2="680" stroke="rgba(0, 240, 255, 0.1)" strokeDasharray="4 4" />

            {/* Grid Intersection Crosshairs (+) */}
            <g stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1">
              <path d="M 276 420 H 284 M 280 416 V 424" />
              <path d="M 496 420 H 504 M 500 416 V 424" />
              <path d="M 276 680 H 284 M 280 676 V 684" />
              <path d="M 496 680 H 504 M 500 676 V 684" />
              <path d="M 146 220 H 154 M 150 216 V 224" />
              <path d="M 616 220 H 624 M 620 216 V 224" />
            </g>

            {/* ================= SECTOR 01: NORTHWEST SUBDIVISIONS (WAVE 1) ================= */}
            {/* Lot 101 */}
            <polygon
              points="50,160 170,135 190,255 70,280"
              className="geo-detect-wave-1"
              strokeWidth="1.2"
            />
            <circle cx="50" cy="160" r="3" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="170" cy="135" r="3" fill="#00f0ff" />
            <circle cx="190" cy="255" r="3" fill="#00f0ff" />
            <circle cx="70" cy="280" r="3" fill="#00f0ff" />
            <text x="85" y="225" fill="#00f0ff" fontSize="9" fontFamily="monospace" fontWeight="700" className="geo-tag-wave-1">
              P-101 [0.22 ha]
            </text>

            {/* Lot 102 (Adjacent) */}
            <polygon
              points="170,135 285,110 305,230 190,255"
              className="geo-detect-wave-1"
              strokeWidth="1.2"
            />
            <circle cx="285" cy="110" r="3" fill="#00f0ff" />
            <circle cx="305" cy="230" r="3" fill="#00f0ff" />
            <text x="205" y="195" fill="rgba(0, 240, 255, 0.85)" fontSize="8.5" fontFamily="monospace" className="geo-tag-wave-1">
              P-102
            </text>

            {/* Lot 103 (Upper North dashed boundary) */}
            <polygon
              points="285,110 395,85 415,205 305,230"
              fill="rgba(0, 240, 255, 0.04)"
              stroke="rgba(0, 240, 255, 0.35)"
              strokeWidth="1"
              strokeDasharray="4 2"
            />

            {/* Lot 104 (Tier 2 Subdivision) */}
            <polygon
              points="70,280 190,255 210,360 85,385"
              className="geo-detect-wave-1"
              strokeWidth="1.2"
            />
            <text x="105" y="335" fill="rgba(0, 240, 255, 0.75)" fontSize="8.5" fontFamily="monospace" className="geo-tag-wave-1">
              LOT 104
            </text>

            {/* Lot 105 */}
            <polygon
              points="190,255 305,230 325,335 210,360"
              fill="rgba(0, 240, 255, 0.05)"
              stroke="rgba(0, 240, 255, 0.45)"
              strokeWidth="1.2"
            />

            {/* ================= SECTOR 02: MIDWEST PRIMARY CADASTRAL PARCELS (WAVE 2) ================= */}
            {/* Polygon 1: Tilted Left Top (Original Enhanced) */}
            <polygon
              points="60,390 240,360 270,520 80,560"
              className="geo-detect-wave-2"
              strokeWidth="1.8"
            />
            {/* Active stroke travel animation on boundary */}
            <line x1="60" y1="390" x2="240" y2="360" stroke="#00f0ff" strokeWidth="1.5" className="geo-dash-travel" />
            <circle cx="60" cy="390" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="240" cy="360" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="270" cy="520" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="80" cy="560" r="4" fill="#00f0ff" className="geo-node-pulse" />

            <text x="95" y="465" fill="#00f0ff" fontSize="10" fontFamily="monospace" fontWeight="800" className="geo-tag-wave-2">
              PID-201 [0.42 ha]
            </text>
            <text x="95" y="480" fill="rgba(0, 240, 255, 0.85)" fontSize="8.5" fontFamily="monospace" className="geo-tag-wave-2">
              CONF: 99.4% • ZONE R-2
            </text>
            <text x="140" y="372" fill="rgba(148, 163, 184, 0.8)" fontSize="8" fontFamily="monospace">
              44.8m
            </text>

            {/* Lot 202: South of Polygon 1 */}
            <polygon
              points="80,560 270,520 295,655 100,700"
              className="geo-detect-wave-2"
              strokeWidth="1.5"
            />
            <circle cx="295" cy="655" r="3.5" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="100" cy="700" r="3.5" fill="#00f0ff" className="geo-node-pulse" />
            <text x="120" y="620" fill="rgba(0, 240, 255, 0.85)" fontSize="9" fontFamily="monospace" className="geo-tag-wave-2">
              PID-202 [0.38 ha]
            </text>

            {/* Lot 203: Western Easement Strip */}
            <polygon
              points="20,430 60,390 80,560 35,605"
              fill="rgba(0, 240, 255, 0.03)"
              stroke="rgba(0, 240, 255, 0.35)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* Lot 204: South Irregular Polygon (Wave 4) */}
            <polygon
              points="100,700 295,655 315,785 190,840 115,810"
              className="geo-detect-wave-4"
              strokeWidth="1.2"
            />
            <circle cx="315" cy="785" r="3" fill="#00f0ff" />
            <circle cx="190" cy="840" r="3" fill="#00f0ff" />

            {/* ================= SECTOR 03: MIDEAST & NORTHEAST CADASTRAL PARCELS (WAVE 3) ================= */}
            {/* Polygon 3: Upper Right Background (Original Enhanced) */}
            <polygon
              points="480,240 640,210 665,330 500,360"
              className="geo-detect-wave-3"
              strokeWidth="1.2"
            />
            <circle cx="480" cy="240" r="3.5" fill="#00f0ff" />
            <circle cx="640" cy="210" r="3.5" fill="#00f0ff" />
            <circle cx="665" cy="330" r="3.5" fill="#00f0ff" />
            <text x="520" y="300" fill="rgba(0, 240, 255, 0.85)" fontSize="9" fontFamily="monospace" className="geo-tag-wave-3">
              LOT 301 [0.34 ha]
            </text>

            {/* Lot 302: Upper North East dashed tract */}
            <polygon
              points="455,140 615,110 640,210 480,240"
              fill="rgba(0, 240, 255, 0.04)"
              stroke="rgba(0, 240, 255, 0.4)"
              strokeWidth="1"
              strokeDasharray="4 2"
            />

            {/* Lot 303: West Buffer Lot */}
            <polygon
              points="345,265 480,240 500,360 365,385"
              fill="rgba(0, 240, 255, 0.05)"
              stroke="rgba(0, 240, 255, 0.45)"
              strokeWidth="1.2"
            />

            {/* Polygon 2: Center Right Tilted Cadastral Box (Original Enhanced) */}
            <polygon
              points="320,400 580,340 610,590 350,660"
              className="geo-detect-wave-3"
              strokeWidth="2"
            />
            {/* Animated boundary travel line */}
            <line x1="320" y1="400" x2="580" y2="340" stroke="#00f0ff" strokeWidth="1.5" className="geo-dash-travel" />
            <circle cx="320" cy="400" r="5" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="580" cy="340" r="5" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="610" cy="590" r="5" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="350" cy="660" r="5" fill="#00f0ff" className="geo-node-pulse" />

            <text x="365" y="480" fill="#00f0ff" fontSize="10.5" fontFamily="monospace" fontWeight="800" className="geo-tag-wave-3">
              PID-304 [0.89 ha]
            </text>
            <text x="365" y="496" fill="rgba(0, 240, 255, 0.85)" fontSize="8.5" fontFamily="monospace" className="geo-tag-wave-3">
              AI DETECTED • CONF: 98.8%
            </text>
            <text x="440" y="358" fill="rgba(148, 163, 184, 0.8)" fontSize="8" fontFamily="monospace">
              82.4m
            </text>
            <text x="595" y="470" fill="rgba(148, 163, 184, 0.8)" fontSize="8" fontFamily="monospace">
              68.2m
            </text>

            {/* Lot 305: Eastern Subdivided Plot */}
            <polygon
              points="580,340 710,310 740,550 610,590"
              fill="rgba(0, 240, 255, 0.05)"
              stroke="rgba(0, 240, 255, 0.45)"
              strokeWidth="1.2"
            />
            <circle cx="710" cy="310" r="3" fill="#00f0ff" />

            {/* Lot 306: Southeast Acreage (Wave 4) */}
            <polygon
              points="350,660 610,590 635,760 375,830"
              className="geo-detect-wave-4"
              strokeWidth="1.5"
            />
            <circle cx="635" cy="760" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="375" cy="830" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <text x="420" y="720" fill="rgba(0, 240, 255, 0.9)" fontSize="9" fontFamily="monospace" className="geo-tag-wave-3">
              PID-306 [0.65 ha]
            </text>

            {/* Lot 307: Far South Quadrant */}
            <polygon
              points="375,830 635,760 655,890 395,945"
              fill="rgba(0, 240, 255, 0.04)"
              stroke="rgba(0, 240, 255, 0.35)"
              strokeWidth="1"
              strokeDasharray="4 2"
            />

            {/* Center Target Marker with Survey Reticle Rings */}
            <g transform="translate(445, 530)">
              <circle cx="0" cy="0" r="3.5" fill="#00f0ff" className="geo-node-pulse" />
              <circle cx="0" cy="0" r="14" fill="none" stroke="rgba(0, 240, 255, 0.5)" strokeWidth="1" />
              <circle cx="0" cy="0" r="24" fill="none" stroke="rgba(0, 240, 255, 0.25)" strokeDasharray="4 3" />
              <line x1="-18" y1="0" x2="-8" y2="0" stroke="#00f0ff" strokeWidth="1" />
              <line x1="8" y1="0" x2="18" y2="0" stroke="#00f0ff" strokeWidth="1" />
              <line x1="0" y1="-18" x2="0" y2="-8" stroke="#00f0ff" strokeWidth="1" />
              <line x1="0" y1="8" x2="0" y2="18" stroke="#00f0ff" strokeWidth="1" />
            </g>

            {/* Geodetic Marginal Tick Coordinates */}
            <text x="16" y="415" fill="rgba(0, 240, 255, 0.5)" fontSize="7.5" fontFamily="monospace">
              18°31'14"N
            </text>
            <text x="286" y="18" fill="rgba(0, 240, 255, 0.5)" fontSize="7.5" fontFamily="monospace">
              73°51'24"E
            </text>
          </svg>
        </div>

        {/* Top Brand & Statement */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Logo & Brand Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div className="geo-brand-icon" style={{ width: '32px', height: '32px', borderRadius: '8px' }}>
              <Compass size={18} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.14em', color: '#ffffff' }}>
                GEO CADASTRA
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  color: '#00f0ff',
                  background: 'rgba(0, 240, 255, 0.12)',
                  border: '1px solid rgba(0, 240, 255, 0.35)',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  textTransform: 'uppercase'
                }}
              >
                GEOSPATIAL AI
              </span>
            </div>
          </div>
          <div style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.22em', color: '#8EA0AA', textTransform: 'uppercase', marginBottom: 20 }}>
            AI-POWERED GEOSPATIAL INTELLIGENCE
          </div>

          {/* Hero Heading */}
          <h2 style={{ fontSize: 'clamp(1.9rem, 2.7vw, 2.7rem)', fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.035em', color: '#ffffff', maxWidth: 440, margin: '0 0 12px 0' }}>
            Turn aerial imagery into<br />
            <span style={{ color: '#00f0ff', textShadow: '0 0 24px rgba(0, 240, 255, 0.5)' }}>
              actionable spatial intelligence.
            </span>
          </h2>

          <p style={{ color: 'rgba(203, 213, 225, 0.85)', fontSize: '12px', letterSpacing: '0.04em', margin: 0 }}>
            AI-powered mapping • Cadastral extraction • Urban analytics
          </p>
        </div>

        {/* Floating LIVE ANALYSIS Card */}
        <div style={{ position: 'relative', zIndex: 2, margin: '24px 0' }}>
          {/* Coordinates Pill */}
          <div style={{ marginBottom: 12 }}>
            <span className="geo-coord-badge" style={{ fontSize: '9px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(6, 17, 33, 0.8)', borderColor: 'rgba(0, 240, 255, 0.25)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              LAT 18.5204° N • LON 73.8567° E | CRS EPSG:32643
            </span>
          </div>

          {/* HUD Telemetry Card */}
          <motion.div
            className="geo-live-card"
            whileHover={{ y: -3 }}
            transition={{ duration: 0.2 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00f0ff', boxShadow: '0 0 8px #00f0ff' }} />
                <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.16em', color: '#ffffff' }}>
                  LIVE ANALYSIS
                </span>
              </div>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  color: '#00f0ff',
                  background: 'rgba(0, 240, 255, 0.1)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(0, 240, 255, 0.25)'
                }}
              >
                URBAN SECTOR 07
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: 16 }}>
              <div>
                <span style={{ display: 'block', fontSize: '9px', color: '#8EA0AA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  Buildings Detected
                </span>
                <strong style={{ fontSize: '20px', color: '#ffffff', fontWeight: 900 }}>
                  1,284
                </strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '9px', color: '#8EA0AA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  Parcels Identified
                </span>
                <strong style={{ fontSize: '20px', color: '#ffffff', fontWeight: 900 }}>
                  642
                </strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '9px', color: '#8EA0AA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  Spatial Confidence
                </span>
                <strong style={{ fontSize: '20px', color: '#00f0ff', fontWeight: 900, textShadow: '0 0 10px rgba(0, 240, 255, 0.35)' }}>
                  98.4%
                </strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '9px', color: '#8EA0AA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  AI Processing
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: '20px', color: '#00f0ff', fontWeight: 900 }}>
                    87%
                  </strong>
                  <div style={{ flex: 1, height: 6, background: 'rgba(148, 163, 184, 0.15)', borderRadius: 999, overflow: 'hidden' }}>
                    <motion.div
                      style={{ height: '100%', background: 'linear-gradient(90deg, #0284c7, #00f0ff)', boxShadow: '0 0 10px #00f0ff' }}
                      initial={{ width: '0%' }}
                      animate={{ width: '87%' }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.14)', paddingTop: 10, fontSize: '9px', fontFamily: 'monospace', color: 'rgba(148, 163, 184, 0.9)' }}>
              MODEL: U-NET++ RESNET18 • GSD: 2.4 CM/PX
            </div>
          </motion.div>
        </div>

        {/* Bottom 3 Status Cards */}
        <div className="geo-auth-status-strip">
          <div className="geo-auth-status-pill">
            <ShieldCheck size={16} style={{ color: '#00f0ff', flexShrink: 0 }} />
            <div>
              <div className="pill-metric cyan">99.2%</div>
              <div className="pill-lbl">Mapping Accuracy</div>
            </div>
          </div>

          <div className="geo-auth-status-pill">
            <Cpu size={16} style={{ color: '#00f0ff', flexShrink: 0 }} />
            <div>
              <div className="pill-metric">AI Vision</div>
              <div className="pill-lbl">Active Models</div>
            </div>
          </div>

          <div className="geo-auth-status-pill">
            <Activity size={16} style={{ color: '#00f0ff', flexShrink: 0 }} />
            <div>
              <div className="pill-metric">Real-Time</div>
              <div className="pill-lbl">Spatial Analysis</div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          RIGHT HALF: Authentication Workspace
          ======================================================== */}
      <section className="geo-auth-right" aria-label="Sign In Workspace">
        <motion.div
          className="geo-auth-card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: '2.3rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#ffffff', margin: '0 0 8px 0' }}>
              Welcome back
            </h1>
            <p style={{ color: '#8EA0AA', fontSize: '13px', margin: 0 }}>
              Sign in to access your geospatial workspace
            </p>
          </div>

          {/* Social Login Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
            <button
              type="button"
              className="geo-auth-social-btn"
              onClick={() => handleSocialClick('Google')}
              disabled={Boolean(socialLoading) || isLoading}
              aria-label="Continue with Google"
            >
              {socialLoading === 'Google' ? (
                <span className="geo-spinner" style={{ borderTopColor: '#00f0ff' }} />
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                  <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1s.7 5.4 1.9 7.8l3.7-2.9z" />
                  <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.9C3.7 20.6 7.5 23.5 12 23.5z" />
                </svg>
              )}
              <span>Google</span>
            </button>

            <button
              type="button"
              className="geo-auth-social-btn"
              onClick={() => handleSocialClick('Microsoft')}
              disabled={Boolean(socialLoading) || isLoading}
              aria-label="Continue with Microsoft"
            >
              {socialLoading === 'Microsoft' ? (
                <span className="geo-spinner" style={{ borderTopColor: '#00f0ff' }} />
              ) : (
                <svg width="15" height="15" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
              )}
              <span>Microsoft</span>
            </button>
          </div>

          {/* Divider */}
          <div className="geo-auth-divider">
            <span>OR CONTINUE WITH EMAIL</span>
          </div>

          {socialNotice && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 6,
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid rgba(0, 240, 255, 0.25)',
                color: '#d9f8ff',
                fontSize: '11px',
                lineHeight: 1.45,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8
              }}
            >
              <span>{socialNotice}</span>
              <button
                type="button"
                onClick={() => setSocialNotice('')}
                style={{ background: 'none', border: 'none', color: '#00f0ff', cursor: 'pointer', padding: 0 }}
                aria-label="Dismiss message"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Email / Password Form */}
          <form onSubmit={onSubmit} noValidate>
            <div className={`geo-auth-field ${fieldErrors.email ? 'geo-input-error' : ''}`}>
              <label htmlFor="login-email">Work Email</label>
              <div className="geo-auth-input-wrap">
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="name@company.com"
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                  required
                />
              </div>
              {fieldErrors.email && (
                <div id="login-email-error" className="geo-field-error-msg" role="alert">
                  <AlertCircle size={12} />
                  <span>{fieldErrors.email}</span>
                </div>
              )}
            </div>

            <div className={`geo-auth-field ${fieldErrors.password ? 'geo-input-error' : ''}`}>
              <label htmlFor="login-password">Password</label>
              <div className="geo-auth-input-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  required
                />
                <button
                  type="button"
                  className="geo-auth-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && (
                <div id="login-password-error" className="geo-field-error-msg" role="alert">
                  <AlertCircle size={12} />
                  <span>{fieldErrors.password}</span>
                </div>
              )}
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0 20px', fontSize: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(203, 213, 225, 0.9)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#00f0ff', width: '14px', height: '14px', cursor: 'pointer' }}
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="text-link"
                style={{ color: '#00f0ff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => {
                  setForgotEmail(form.email)
                  setForgotStatus({ loading: false, success: false, error: '' })
                  setForgotModalOpen(true)
                }}
              >
                Forgot password?
              </button>
            </div>

            {/* Error Message Panel */}
            {authError && (
              <div
                className="auth-message auth-message--error"
                style={{
                  marginBottom: 16,
                  border: '1px solid rgba(229, 77, 90, 0.4)',
                  background: 'rgba(229, 77, 90, 0.1)',
                  color: '#fca5a5'
                }}
                role="alert"
              >
                <strong style={{ display: 'block', fontSize: '11px', letterSpacing: '0.08em', marginBottom: 2 }}>
                  AUTHENTICATION FAILED
                </strong>
                <span style={{ fontSize: '11px' }}>{authError}</span>
              </div>
            )}

            {/* Success Message Panel */}
            {authSuccess && (
              <div
                className="auth-message"
                style={{
                  marginBottom: 16,
                  border: '1px solid rgba(0, 240, 255, 0.4)',
                  background: 'rgba(0, 240, 255, 0.1)',
                  color: '#d9f8ff'
                }}
                role="status"
              >
                <span style={{ fontSize: '11px' }}>{authSuccess}</span>
              </div>
            )}

            {/* Primary Sign In Button */}
            <button
              type="submit"
              className="geo-btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '12px',
                fontWeight: 900,
                borderRadius: '6px',
                background: isLoading ? 'rgba(0, 240, 255, 0.4)' : (authSuccess ? '#10b981' : 'linear-gradient(135deg, #00f0ff 0%, #0284c7 100%)'),
                color: authSuccess ? '#ffffff' : '#030712'
              }}
              disabled={isLoading || Boolean(authSuccess)}
            >
              {isLoading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="geo-spinner" />
                  SIGNING IN...
                </span>
              ) : authSuccess ? (
                <span>AUTHENTICATED ✓</span>
              ) : (
                'SIGN IN →'
              )}
            </button>
          </form>

          {/* Links */}
          <div style={{ marginTop: 22, textAlign: 'center', fontSize: '12px', color: '#8EA0AA' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#00f0ff', fontWeight: 800, textDecoration: 'none' }}>
              Create workspace
            </Link>
          </div>

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Link
              to="/"
              style={{ color: '#8EA0AA', fontSize: '11px', textDecoration: 'none', fontWeight: 700 }}
            >
              ← Return to platform overview
            </Link>
          </div>

          {/* Security Information Footer */}
          <div
            style={{
              marginTop: 36,
              paddingTop: 18,
              borderTop: '1px solid rgba(148, 163, 184, 0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: '10px',
              color: '#647580',
              textAlign: 'center',
              flexWrap: 'wrap'
            }}
          >
            <span>Secure authentication</span>
            <span>•</span>
            <span>Protected workspace access</span>
            <span>•</span>
            <span>Encrypted data transmission</span>
          </div>
        </motion.div>
      </section>

      {/* ========================================================
          FORGOT PASSWORD MODAL DRAWER
          ======================================================== */}
      <AnimatePresence>
        {forgotModalOpen && (
          <motion.div
            className="geo-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setForgotModalOpen(false)}
          >
            <motion.div
              className="geo-modal-dialog"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="forgot-modal-title"
            >
              <button
                type="button"
                onClick={() => setForgotModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'none',
                  border: 'none',
                  color: '#8EA0AA',
                  cursor: 'pointer'
                }}
                aria-label="Close recovery dialog"
              >
                <X size={18} />
              </button>

              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.14em', color: '#00f0ff', textTransform: 'uppercase' }}>
                  WORKSPACE RECOVERY
                </span>
                <h3 id="forgot-modal-title" style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff', margin: '4px 0 6px 0' }}>
                  Reset your password
                </h3>
                <p style={{ fontSize: '12px', color: '#8EA0AA', margin: 0, lineHeight: 1.5 }}>
                  Enter your registered work email to receive a secure token to reset your credentials.
                </p>
              </div>

              {forgotStatus.success ? (
                <div style={{ padding: '16px', borderRadius: 6, background: 'rgba(0, 240, 255, 0.08)', border: '1px solid rgba(0, 240, 255, 0.3)', color: '#d9f8ff', fontSize: '12px', lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#00f0ff', fontWeight: 800, marginBottom: 4 }}>
                    <CheckCircle2 size={16} />
                    <span>RECOVERY TOKEN DISPATCHED</span>
                  </div>
                  <span>If an institutional account exists for <strong>{forgotEmail}</strong>, password reset instructions have been sent.</span>
                  <button
                    type="button"
                    className="geo-btn-primary"
                    style={{ width: '100%', marginTop: 16, padding: '10px', fontSize: '11px' }}
                    onClick={() => setForgotModalOpen(false)}
                  >
                    RETURN TO SIGN IN
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit}>
                  <div className="geo-auth-field" style={{ marginBottom: 14 }}>
                    <label htmlFor="recovery-email">Work Email</label>
                    <div className="geo-auth-input-wrap">
                      <input
                        id="recovery-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="name@company.com"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  {forgotStatus.error && (
                    <div style={{ marginBottom: 12, color: '#fca5a5', fontSize: '11px', fontWeight: 700 }}>
                      {forgotStatus.error}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <button
                      type="button"
                      className="geo-btn-secondary"
                      style={{ flex: 1, padding: '11px', fontSize: '11px' }}
                      onClick={() => setForgotModalOpen(false)}
                    >
                      CANCEL
                    </button>
                    <button
                      type="submit"
                      className="geo-btn-primary"
                      style={{ flex: 2, padding: '11px', fontSize: '11px' }}
                      disabled={forgotStatus.loading}
                    >
                      {forgotStatus.loading ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span className="geo-spinner" />
                          DISPATCHING...
                        </span>
                      ) : (
                        'DISPATCH RECOVERY →'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
