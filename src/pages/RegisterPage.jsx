import { motion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  Boxes,
  CheckCircle2,
  Compass,
  Cpu,
  Eye,
  EyeOff,
  ShieldCheck
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register, loading: authLoading } = useAuth()

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    organization: '',
    password: '',
    confirmPassword: ''
  })
  const [touched, setTouched] = useState({
    fullName: false,
    email: false,
    organization: false,
    password: false,
    confirmPassword: false
  })
  const [fieldErrors, setFieldErrors] = useState({
    fullName: '',
    email: '',
    organization: '',
    password: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Calculate password strength
  const passwordStrength = useMemo(() => {
    const p = form.password
    if (!p) return { score: 0, label: '', cls: '' }
    let score = 0
    if (p.length >= 8) score += 1
    if (p.length >= 12) score += 1
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score += 1
    if (/[0-9]/.test(p) || /[^A-Za-z0-9]/.test(p)) score += 1

    if (score <= 1) return { score: 1, label: 'Weak', cls: 'weak' }
    if (score === 2 || score === 3) return { score: 2, label: 'Medium', cls: 'medium' }
    return { score: 4, label: 'Strong', cls: 'strong' }
  }, [form.password])

  // Validate single field
  const validateField = (name, value, currentForm = form) => {
    let err = ''
    if (name === 'fullName') {
      if (!value.trim()) {
        err = 'Full name is required.'
      } else if (value.trim().length < 2) {
        err = 'Please enter at least 2 characters.'
      }
    } else if (name === 'email') {
      if (!value.trim()) {
        err = 'Work email is required.'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        err = 'Please enter a valid work email address.'
      }
    } else if (name === 'organization') {
      if (!value.trim()) {
        err = 'Organization or agency name is required.'
      }
    } else if (name === 'password') {
      if (!value) {
        err = 'Password is required.'
      } else if (value.length < 8) {
        err = 'Password must contain at least 8 characters.'
      }
    } else if (name === 'confirmPassword') {
      if (!value) {
        err = 'Please confirm your password.'
      } else if (value !== currentForm.password) {
        err = 'Passwords do not match.'
      }
    }
    return err
  }

  const onChange = (e) => {
    const { name, value } = e.target
    const nextForm = { ...form, [name]: value }
    setForm(nextForm)
    if (error) setError('')

    if (touched[name]) {
      setFieldErrors((prev) => ({
        ...prev,
        [name]: validateField(name, value, nextForm),
        // recheck confirmPassword if password changed
        ...(name === 'password' && touched.confirmPassword ? { confirmPassword: validateField('confirmPassword', form.confirmPassword, nextForm) } : {})
      }))
    }
  }

  const onBlur = (e) => {
    const { name, value } = e.target
    setTouched((prev) => ({ ...prev, [name]: true }))
    setFieldErrors((prev) => ({
      ...prev,
      [name]: validateField(name, value, form)
    }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const nameErr = validateField('fullName', form.fullName)
    const emailErr = validateField('email', form.email)
    const orgErr = validateField('organization', form.organization)
    const passErr = validateField('password', form.password)
    const confirmErr = validateField('confirmPassword', form.confirmPassword)

    setTouched({
      fullName: true,
      email: true,
      organization: true,
      password: true,
      confirmPassword: true
    })

    setFieldErrors({
      fullName: nameErr,
      email: emailErr,
      organization: orgErr,
      password: passErr,
      confirmPassword: confirmErr
    })

    if (nameErr || emailErr || orgErr || passErr || confirmErr) {
      return
    }

    setSubmitting(true)
    try {
      const response = await register(
        form.fullName.trim(),
        form.email.trim(),
        form.password,
        form.organization.trim()
      )
      if (!response.ok) {
        const errorText = response.error || 'Workspace creation failed.'
        setError(errorText)

        // If error message indicates email collision or specific field issue, attach to field error as well
        if (errorText.toLowerCase().includes('email') || errorText.toLowerCase().includes('already exists')) {
          setFieldErrors((prev) => ({ ...prev, email: errorText }))
        } else if (errorText.toLowerCase().includes('password')) {
          setFieldErrors((prev) => ({ ...prev, password: errorText }))
        }

        setSubmitting(false)
        return
      }

      setSuccess('Workspace provisioned successfully. Redirecting to sign in...')
      setTimeout(() => {
        navigate(`/login?registered=true&email=${encodeURIComponent(form.email.trim())}`)
      }, 700)
    } catch {
      setError('Connection failure. Unable to contact registration service.')
      setSubmitting(false)
    }
  }

  const isLoading = submitting || authLoading

  return (
    <main className="geo-auth-container">
      {/* ========================================================
          LEFT HALF: Geospatial Intelligence Visual Experience
          ======================================================== */}
      <section className="geo-auth-left" aria-label="Geospatial Intelligence Telemetry">
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
              opacity: 0.45
            }}
          />

          <div className="geo-auth-grid-overlay" />
          <div className="geo-auth-radar-scan" />

          {/* Interactive Cadastral Polygons with Corner Nodes */}
          <svg
            viewBox="0 0 650 850"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            aria-hidden="true"
          >
            <line x1="280" y1="0" x2="280" y2="850" stroke="rgba(0, 240, 255, 0.16)" strokeDasharray="4 4" />
            <line x1="0" y1="420" x2="650" y2="420" stroke="rgba(0, 240, 255, 0.16)" strokeDasharray="4 4" />

            <polygon
              points="60,390 240,360 270,520 80,560"
              fill="rgba(0, 240, 255, 0.08)"
              stroke="#00f0ff"
              strokeWidth="1.5"
            />
            <circle cx="60" cy="390" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="240" cy="360" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="270" cy="520" r="4" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="80" cy="560" r="4" fill="#00f0ff" className="geo-node-pulse" />

            <polygon
              points="320,400 580,340 610,590 350,660"
              fill="rgba(0, 240, 255, 0.06)"
              stroke="#00f0ff"
              strokeWidth="2"
            />
            <circle cx="320" cy="400" r="5" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="580" cy="340" r="5" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="610" cy="590" r="5" fill="#00f0ff" className="geo-node-pulse" />
            <circle cx="350" cy="660" r="5" fill="#00f0ff" className="geo-node-pulse" />
          </svg>
        </div>

        {/* Top Brand & Statement */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div className="geo-brand-icon" style={{ width: '32px', height: '32px', borderRadius: '8px' }}>
              <Compass size={18} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.14em', color: '#ffffff' }}>
                GRO CADASTRA
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

          <h2 style={{ fontSize: 'clamp(1.9rem, 2.7vw, 2.7rem)', fontWeight: 900, lineHeight: 1.12, letterSpacing: '-0.035em', color: '#ffffff', maxWidth: 440, margin: '0 0 12px 0' }}>
            Provision your<br />
            <span style={{ color: '#00f0ff', textShadow: '0 0 24px rgba(0, 240, 255, 0.5)' }}>
              geospatial workspace.
            </span>
          </h2>

          <p style={{ color: 'rgba(203, 213, 225, 0.85)', fontSize: '12px', letterSpacing: '0.04em', margin: 0 }}>
            AI-powered mapping • Cadastral extraction • Urban analytics
          </p>
        </div>

        {/* Floating LIVE ANALYSIS Card */}
        <div style={{ position: 'relative', zIndex: 2, margin: '24px 0' }}>
          <div style={{ marginBottom: 12 }}>
            <span className="geo-coord-badge" style={{ fontSize: '9px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(6, 17, 33, 0.8)', borderColor: 'rgba(0, 240, 255, 0.25)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              LAT 18.5204° N • LON 73.8567° E | CRS EPSG:32643
            </span>
          </div>

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
          RIGHT HALF: Registration Workspace
          ======================================================== */}
      <section className="geo-auth-right" aria-label="Create Workspace Form">
        <motion.div
          className="geo-auth-card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: '2.3rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#ffffff', margin: '0 0 8px 0' }}>
              Create workspace
            </h1>
            <p style={{ color: '#8EA0AA', fontSize: '13px', margin: 0 }}>
              Set up your institutional cadastral intelligence account
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate>
            <div className={`geo-auth-field ${fieldErrors.fullName ? 'geo-input-error' : ''}`}>
              <label htmlFor="reg-fullname">Full Name</label>
              <div className="geo-auth-input-wrap">
                <input
                  id="reg-fullname"
                  type="text"
                  name="fullName"
                  value={form.fullName}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  aria-invalid={Boolean(fieldErrors.fullName)}
                  aria-describedby={fieldErrors.fullName ? 'reg-name-error' : undefined}
                  required
                />
              </div>
              {fieldErrors.fullName && (
                <div id="reg-name-error" className="geo-field-error-msg" role="alert">
                  <AlertCircle size={12} />
                  <span>{fieldErrors.fullName}</span>
                </div>
              )}
            </div>

            <div className={`geo-auth-field ${fieldErrors.email ? 'geo-input-error' : ''}`}>
              <label htmlFor="reg-email">Work Email</label>
              <div className="geo-auth-input-wrap">
                <input
                  id="reg-email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="name@company.com"
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
                  required
                />
              </div>
              {fieldErrors.email && (
                <div id="reg-email-error" className="geo-field-error-msg" role="alert">
                  <AlertCircle size={12} />
                  <span>{fieldErrors.email}</span>
                </div>
              )}
            </div>

            <div className={`geo-auth-field ${fieldErrors.organization ? 'geo-input-error' : ''}`}>
              <label htmlFor="reg-org">Organization / Cadastral Agency</label>
              <div className="geo-auth-input-wrap">
                <input
                  id="reg-org"
                  type="text"
                  name="organization"
                  value={form.organization}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="Urban Planning & Survey Office"
                  aria-invalid={Boolean(fieldErrors.organization)}
                  aria-describedby={fieldErrors.organization ? 'reg-org-error' : undefined}
                  required
                />
              </div>
              {fieldErrors.organization && (
                <div id="reg-org-error" className="geo-field-error-msg" role="alert">
                  <AlertCircle size={12} />
                  <span>{fieldErrors.organization}</span>
                </div>
              )}
            </div>

            <div className={`geo-auth-field ${fieldErrors.password ? 'geo-input-error' : ''}`}>
              <label htmlFor="reg-password">Password</label>
              <div className="geo-auth-input-wrap">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'reg-pass-error' : undefined}
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
              {/* Password strength bar */}
              {form.password && (
                <div className="geo-pwd-strength-wrap">
                  <div className="geo-pwd-strength-bars">
                    <div className={`geo-pwd-strength-bar ${passwordStrength.score >= 1 ? `active-${passwordStrength.cls}` : ''}`} />
                    <div className={`geo-pwd-strength-bar ${passwordStrength.score >= 2 ? `active-${passwordStrength.cls}` : ''}`} />
                    <div className={`geo-pwd-strength-bar ${passwordStrength.score >= 3 ? `active-${passwordStrength.cls}` : ''}`} />
                    <div className={`geo-pwd-strength-bar ${passwordStrength.score >= 4 ? `active-${passwordStrength.cls}` : ''}`} />
                  </div>
                  <div className={`geo-pwd-strength-label ${passwordStrength.cls}`}>
                    Strength: {passwordStrength.label}
                  </div>
                </div>
              )}
              {fieldErrors.password && (
                <div id="reg-pass-error" className="geo-field-error-msg" role="alert">
                  <AlertCircle size={12} />
                  <span>{fieldErrors.password}</span>
                </div>
              )}
            </div>

            <div className={`geo-auth-field ${fieldErrors.confirmPassword ? 'geo-input-error' : ''}`}>
              <label htmlFor="reg-confirmpass">Confirm Password</label>
              <div className="geo-auth-input-wrap">
                <input
                  id="reg-confirmpass"
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  aria-describedby={fieldErrors.confirmPassword ? 'reg-confirm-error' : undefined}
                  required
                />
                <button
                  type="button"
                  className="geo-auth-eye-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <div id="reg-confirm-error" className="geo-field-error-msg" role="alert">
                  <AlertCircle size={12} />
                  <span>{fieldErrors.confirmPassword}</span>
                </div>
              )}
            </div>

            {error && (
              <div
                className="auth-message auth-message--error"
                style={{
                  margin: '14px 0',
                  border: '1px solid rgba(229, 77, 90, 0.4)',
                  background: 'rgba(229, 77, 90, 0.1)',
                  color: '#fca5a5'
                }}
                role="alert"
              >
                <strong style={{ display: 'block', fontSize: '11px', letterSpacing: '0.08em', marginBottom: 2 }}>
                  REGISTRATION FAILED
                </strong>
                <span style={{ fontSize: '11px' }}>{error}</span>
              </div>
            )}

            {success && (
              <div
                className="auth-message"
                style={{
                  margin: '14px 0',
                  border: '1px solid rgba(30, 166, 114, 0.4)',
                  background: 'rgba(30, 166, 114, 0.12)',
                  color: '#d1fae5'
                }}
                role="status"
              >
                <span style={{ fontSize: '11px' }}>{success}</span>
              </div>
            )}

            <button
              type="submit"
              className="geo-btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '12px',
                fontWeight: 900,
                borderRadius: '6px',
                marginTop: '12px',
                background: isLoading ? 'rgba(0, 240, 255, 0.4)' : (success ? '#10b981' : 'linear-gradient(135deg, #00f0ff 0%, #0284c7 100%)'),
                color: success ? '#ffffff' : '#030712'
              }}
              disabled={isLoading || Boolean(success)}
            >
              {isLoading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="geo-spinner" />
                  CREATING WORKSPACE...
                </span>
              ) : success ? (
                <span>WORKSPACE PROVISIONED ✓</span>
              ) : (
                'CREATE WORKSPACE →'
              )}
            </button>
          </form>

          {/* Links */}
          <div style={{ marginTop: 22, textAlign: 'center', fontSize: '12px', color: '#8EA0AA' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#00f0ff', fontWeight: 800, textDecoration: 'none' }}>
              Sign in
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
    </main>
  )
}
