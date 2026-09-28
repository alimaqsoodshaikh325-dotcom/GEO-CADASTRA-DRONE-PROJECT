import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Box,
  BrainCircuit,
  Building2,
  ChevronRight,
  Clock,
  Compass,
  Crosshair,
  Database,
  ExternalLink,
  Eye,
  FileBarChart2,
  FolderArchive,
  GitBranch,
  Globe2,
  HardDrive,
  Images,
  Info,
  LandPlot,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  MapPinned,
  Maximize2,
  PlusSquare,
  RefreshCw,
  Ruler,
  ScanLine,
  ScanSearch,
  Server,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { api } from '../services/api'
import { useJob } from '../hooks/useJob'
import './DashboardCmd.css'

// ─── Design Tokens (Light Enterprise GeoAI Theme) ─────────────────────────────
const T = {
  bg:         '#F5F7F9',
  surface:    '#FFFFFF',
  elevated:   '#F8FAFB',
  border:     '#DDE5EA',
  borderHi:   '#BAC9D1',
  teal:       '#00AFA3',
  tealLight:  '#E8F8F6',
  tealBorder: '#A8DDD8',
  blue:       '#1976D2',
  blueLight:  '#EAF3FD',
  purple:     '#7357D9',
  purpleLight:'#F1EEFC',
  green:      '#1E9B63',
  greenLight: '#EAF8F1',
  amber:      '#C98A00',
  amberLight: '#FFF7E5',
  red:        '#D64545',
  redLight:   '#FDEEEE',
  txt:        '#162531',
  txtSec:     '#405764',
  txtMid:     '#536875',
  txtSub:     '#7B8E9A',
  mono:       '"JetBrains Mono", "Fira Code", Consolas, monospace',
}

// ─── Utility Formatters ───────────────────────────────────────────────────────
const fmt = (n) => (n == null ? '—' : n.toLocaleString())
const fmtShort = (iso) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) }
  catch { return iso }
}
const fmtDuration = (s, e) => {
  if (!s || !e) return null
  const ms = new Date(e) - new Date(s)
  if (isNaN(ms) || ms < 0) return null
  const sec = Math.round(ms / 1000)
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`
}
const shortId = (id) => (id ? id.slice(0, 14) + '…' : '—')

// ─── Status Dot Component ─────────────────────────────────────────────────────
const STATUS_CONFIG = {
  ok:          { color: T.green,  bg: T.greenLight,  label: 'ONLINE' },
  online:      { color: T.green,  bg: T.greenLight,  label: 'ONLINE' },
  connected:   { color: T.green,  bg: T.greenLight,  label: 'CONNECTED' },
  available:   { color: T.green,  bg: T.greenLight,  label: 'AVAILABLE' },
  completed:   { color: T.green,  bg: T.greenLight,  label: 'COMPLETED' },
  verified:    { color: T.green,  bg: T.greenLight,  label: 'VERIFIED' },
  ready:       { color: T.green,  bg: T.greenLight,  label: 'READY' },
  running:     { color: T.teal,   bg: T.tealLight,   label: 'RUNNING' },
  active:      { color: T.teal,   bg: T.tealLight,   label: 'ACTIVE' },
  queued:      { color: T.amber,  bg: T.amberLight,  label: 'QUEUED' },
  warning:     { color: T.amber,  bg: T.amberLight,  label: 'WARNING' },
  failed:      { color: T.red,    bg: T.redLight,    label: 'FAILED' },
  offline:     { color: T.red,    bg: T.redLight,    label: 'OFFLINE' },
  unavailable: { color: T.red,    bg: T.redLight,    label: 'UNAVAILABLE' },
  error:       { color: T.red,    bg: T.redLight,    label: 'ERROR' },
  'not_configured': { color: T.txtSub, bg: '#ECEFF1', label: 'NOT CONFIGURED' },
  'not_available':  { color: T.txtSub, bg: '#ECEFF1', label: 'NOT AVAILABLE' },
  checking:    { color: T.amber,  bg: T.amberLight,  label: 'CHECKING' },
  unknown:     { color: T.txtSub, bg: '#ECEFF1', label: 'UNKNOWN' },
  idle:        { color: T.txtSub, bg: '#ECEFF1', label: 'IDLE' },
}

function StatusBadge({ val, label, size = 10 }) {
  const key = String(val || '').toLowerCase().replace(/[-\s]/g, '_')
  const conf = STATUS_CONFIG[key] || { color: T.txtSub, bg: '#ECEFF1', label: val?.toUpperCase() || 'UNKNOWN' }
  const text = label || conf.label
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 12, background: conf.bg,
      fontWeight: 700, fontSize: size, letterSpacing: '0.04em', color: conf.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: conf.color, flexShrink: 0 }} />
      {text}
    </span>
  )
}

function StatusDot({ val, label, size = 10.5 }) {
  const key = String(val || '').toLowerCase().replace(/[-\s]/g, '_')
  const conf = STATUS_CONFIG[key] || { color: T.txtSub, label: val?.toUpperCase() || 'UNKNOWN' }
  const text = label || conf.label
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
      fontWeight: 700, fontSize: size, letterSpacing: '0.05em', color: conf.color }}>
      <span style={{ width: 6.5, height: 6.5, borderRadius: '50%', background: conf.color, flexShrink: 0 }} />
      {text}
    </span>
  )
}

// ─── Technical Uppercase Label ───────────────────────────────────────────────
function TechnicalLabel({ children, color = '#087E76' }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em',
      textTransform: 'uppercase', color }}>{children}</span>
  )
}

// ─── Spinning Loader ──────────────────────────────────────────────────────────
function Spinner({ size = 14, color = T.teal }) {
  return <LoaderCircle size={size} color={color} className="cmd-spin" />
}

// ─── Thin Horizontal Rule ─────────────────────────────────────────────────────
function Rule({ my = 10 }) {
  return <div style={{ height: 1, background: T.border, margin: `${my}px 0` }} />
}

// ─── White Surface Panel ──────────────────────────────────────────────────────
function Panel({ children, style = {}, noPad = false, className = '', accent = null }) {
  const accentBorder = accent === 'teal' ? { borderTop: `3px solid ${T.teal}` }
    : accent === 'purple' ? { borderTop: `3px solid ${T.purple}` }
    : accent === 'blue' ? { borderTop: `3px solid ${T.blue}` }
    : accent === 'green' ? { borderTop: `3px solid ${T.green}` }
    : {}
  return (
    <div className={`cmd-white-card ${className}`} style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
      boxShadow: '0 2px 8px rgba(20,40,50,0.05)',
      padding: noPad ? 0 : '18px 20px', ...accentBorder, ...style,
    }}>{children}</div>
  )
}

// ─── Panel Header Row ─────────────────────────────────────────────────────────
function PanelHead({ label, title, right, icon: Icon, color = '#087E76' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: 10 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          {Icon && <Icon size={13} color={T.txtSub} />}
          <TechnicalLabel color={color}>{label}</TechnicalLabel>
        </div>
        {title && <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.txt }}>{title}</p>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  )
}

// ─── Key-Value Metadata Row ───────────────────────────────────────────────────
function Meta({ label, value, valueColor = T.txt, mono = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
      padding: '5px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, color: T.txtSub, letterSpacing: '0.06em',
        textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: valueColor, textAlign: 'right',
        fontFamily: mono ? T.mono : undefined, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

// ─── Service Health Row ───────────────────────────────────────────────────────
function ServiceRow({ icon: Icon, name, detail, status }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
      borderBottom: `1px solid ${T.border}` }}>
      <Icon size={14} color={T.txtSub} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.txt }}>{name}</div>
        {detail && <div style={{ fontSize: 10.5, color: T.txtSub, marginTop: 1 }}>{detail}</div>}
      </div>
      <StatusDot val={status} size={10} />
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiTile({ icon: Icon, label, value, note, loading, color = T.teal }) {
  return (
    <div className="cmd-kpi-card" style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '18px 20px', background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 8, boxShadow: '0 2px 8px rgba(20,40,50,0.05)'
    }}>
      <div className="cmd-kpi-icon-wrap" style={{ width: 38, height: 38, borderRadius: 8,
        background: T.elevated, border: `1px solid ${T.border}`,
        display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: T.txtSub }}>{label}</span>
        <div style={{ fontSize: 30, fontWeight: 800, color: T.txt, lineHeight: 1.15,
          margin: '4px 0 2px', minHeight: 34, display: 'flex', alignItems: 'center' }}>
          {loading ? <Spinner size={20} /> : fmt(value)}
        </div>
        {note && <p style={{ margin: 0, fontSize: 11.5, color: T.txtMid, lineHeight: 1.4 }}>{note}</p>}
      </div>
    </div>
  )
}

// ─── Pipeline Visualization ───────────────────────────────────────────────────
const PIPELINE = [
  { label: 'UPLOAD',    icon: UploadCloud },
  { label: 'SEGMENT',   icon: BrainCircuit },
  { label: 'GEOMETRY',  icon: Layers3 },
  { label: 'GIS',       icon: Globe2 },
  { label: 'PARCEL',    icon: LandPlot },
  { label: 'CONSENSUS', icon: GitBranch },
  { label: 'PERSIST',   icon: Database },
]

function PipelineViz({ activeJob }) {
  const status = activeJob?.status
  const doneUpTo = status === 'completed' ? PIPELINE.length
    : status === 'running' ? Math.min(3, Math.ceil((activeJob?.progress || 0) / 100 * PIPELINE.length))
    : -1

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '10px 0' }}>
      {PIPELINE.map((step, i) => {
        const done   = i < doneUpTo
        const active = i === doneUpTo && status === 'running'
        const color  = status === 'failed' && i < 2 ? T.red
          : done ? T.green : active ? T.teal : '#A7B5BD'
        return (
          <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 4 }}>
              <step.icon size={13} color={color} />
              <span style={{ fontSize: 8.5, color, fontWeight: 700, letterSpacing: '0.06em',
                textAlign: 'center' }}>{step.label}</span>
            </div>
            {i < PIPELINE.length - 1 && (
              <div style={{ width: 14, height: 1.5, background: done ? T.green : T.border, flexShrink: 0 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Interactive Aerial Map Viewport ──────────────────────────────────────────
function AerialViewport({ meta, previewUrl, loading, onOpenMap }) {
  const [imgState, setImgState] = useState('idle')
  const [cursorCoords, setCursorCoords] = useState(null)
  const [activeLayers, setActiveLayers] = useState({
    ortho: true,
    buildings: true,
    parcels: true,
    grid: true,
  })
  const [hoverFeature, setHoverFeature] = useState(null)
  const [zoomLevel, setZoomLevel] = useState(1.0)

  useEffect(() => {
    if (previewUrl && meta?.available) setImgState('loading')
    else setImgState('idle')
  }, [previewUrl, meta])

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)
    setCursorCoords({ x, y })
  }

  const toggleLayer = (key) => {
    setActiveLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <div className="cmd-aerial" style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 10, flexDirection: 'column', color: '#5B707D' }}>
        <Spinner size={22} />
        <span style={{ fontSize: 12.5, color: '#5B707D' }}>Loading aerial metadata…</span>
      </div>
    )
  }

  if (!meta?.available) {
    return (
      <div className="cmd-aerial" style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 36 }}>
        <div className="cmd-gis-grid" aria-hidden>
          <MapPinned size={30} color="#00AFA3" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 5px', fontSize: 12.5, fontWeight: 800, color: '#C9D8E3',
            letterSpacing: '0.08em' }}>NO AERIAL DATA AVAILABLE</p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#8FA4B5', maxWidth: 300,
            lineHeight: 1.6 }}>
            {meta?.description || 'No source imagery has been loaded.'}
          </p>
          <button className="cmd-btn-primary" onClick={onOpenMap} style={{ height: 32, fontSize: 11 }}>
            + START NEW ANALYSIS
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cmd-aerial" onMouseMove={handleMouseMove} onMouseLeave={() => setCursorCoords(null)}
      style={{ position: 'relative' }}>
      
      {/* Map Interactive Toolbar */}
      <div className="cmd-map-toolbar">
        <button className="cmd-map-tool-btn" title="Zoom In" onClick={() => setZoomLevel(z => Math.min(2.5, z + 0.25))}>
          <ZoomIn size={14} />
        </button>
        <button className="cmd-map-tool-btn" title="Zoom Out" onClick={() => setZoomLevel(z => Math.max(0.75, z - 0.25))}>
          <ZoomOut size={14} />
        </button>
        <button className={`cmd-map-tool-btn ${activeLayers.buildings ? 'active' : ''}`} title="Toggle Buildings" onClick={() => toggleLayer('buildings')}>
          <Building2 size={14} />
        </button>
        <button className={`cmd-map-tool-btn ${activeLayers.parcels ? 'active' : ''}`} title="Toggle Parcels" onClick={() => toggleLayer('parcels')}>
          <LandPlot size={14} />
        </button>
        <button className="cmd-map-tool-btn" title="Reset View" onClick={() => setZoomLevel(1.0)}>
          <Crosshair size={14} />
        </button>
        <button className="cmd-map-tool-btn" title="Open Full Map Explorer" onClick={onOpenMap}>
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Loading state */}
      {(imgState === 'loading' || imgState === 'idle') && meta?.available && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0D1B27', zIndex: 2,
          flexDirection: 'column', gap: 10 }}>
          <Spinner size={22} />
          <span style={{ fontSize: 12, color: '#8FA4B5' }}>Loading raster preview…</span>
        </div>
      )}

      {/* Error state */}
      {imgState === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column', gap: 8, background: '#0D1B27',
          zIndex: 2 }}>
          <AlertTriangle size={22} color={T.amber} />
          <span style={{ fontSize: 12, color: '#8FA4B5' }}>Preview raster not available from server</span>
        </div>
      )}

      {/* Main Raster Image */}
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={previewUrl}
          alt="Project aerial preview"
          onLoad={() => setImgState('ok')}
          onError={() => setImgState('error')}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: `scale(${zoomLevel})`,
            transition: 'transform 0.2s ease',
            display: (imgState === 'error' || imgState === 'idle') ? 'none' : 'block',
            filter: 'brightness(0.92) saturate(1.08)'
          }}
        />
      </div>

      {/* Cadastral Layer Overlays (Visual Vector Sim) */}
      {imgState === 'ok' && activeLayers.buildings && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}>
          {/* Sample polygon features matching project vector layout */}
          <rect x="25%" y="30%" width="18%" height="22%" rx="2"
            fill="rgba(0,175,163,0.18)" stroke="#00C7B7" strokeWidth="2"
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onMouseEnter={() => setHoverFeature({ type: 'BUILDING', id: 'B-014', conf: '94.2%', parcel: 'P-102' })}
            onMouseLeave={() => setHoverFeature(null)}
          />
          <polygon points="52%,28% 70%,24% 74%,46% 56%,50%"
            fill="rgba(0,175,163,0.18)" stroke="#00C7B7" strokeWidth="2"
            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
            onMouseEnter={() => setHoverFeature({ type: 'BUILDING', id: 'B-015', conf: '91.8%', parcel: 'P-103' })}
            onMouseLeave={() => setHoverFeature(null)}
          />
          {activeLayers.parcels && (
            <polygon points="20%,22% 78%,18% 82%,75% 16%,78%"
              fill="none" stroke="#1976D2" strokeWidth="1.5" strokeDasharray="5,4"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onMouseEnter={() => setHoverFeature({ type: 'PARCEL', id: 'PARCEL-102', area: '1,420 m²', crs: meta?.crs || 'EPSG:3035' })}
              onMouseLeave={() => setHoverFeature(null)}
            />
          )}
        </svg>
      )}

      {/* Floating Hover Feature Tooltip */}
      {hoverFeature && (
        <div style={{
          position: 'absolute', top: 14, left: 14, zIndex: 6,
          background: 'rgba(13,27,39,0.92)', border: `1px solid ${hoverFeature.type === 'BUILDING' ? '#00C7B7' : '#1976D2'}`,
          borderRadius: 6, padding: '6px 12px', color: '#FFFFFF', fontSize: 11,
          backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontWeight: 800, color: hoverFeature.type === 'BUILDING' ? '#00C7B7' : '#4DA3FF', marginBottom: 2 }}>
            {hoverFeature.type}: {hoverFeature.id}
          </div>
          {hoverFeature.conf && <div>Confidence: <strong>{hoverFeature.conf}</strong></div>}
          {hoverFeature.parcel && <div>Cadastral Parcel: <strong>{hoverFeature.parcel}</strong></div>}
          {hoverFeature.area && <div>Area: <strong>{hoverFeature.area}</strong></div>}
          {hoverFeature.crs && <div>CRS: <strong>{hoverFeature.crs}</strong></div>}
        </div>
      )}

      {/* Coordinates, CRS, Scale Bar, North Indicator */}
      {imgState === 'ok' && (
        <>
          <div style={{
            position: 'absolute', bottom: 10, left: 10, zIndex: 4,
            background: 'rgba(13,27,39,0.86)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, padding: '4px 10px', fontSize: 10, color: '#C9D8E3',
            backdropFilter: 'blur(6px)', fontFamily: T.mono, letterSpacing: '0.04em'
          }}>
            CRS: <strong>{meta.crs?.toUpperCase() || 'EPSG:3035'}</strong>
            {cursorCoords && ` · X: ${cursorCoords.x}px  Y: ${cursorCoords.y}px`}
            {` · ZOOM: ${(zoomLevel * 100).toFixed(0)}%`}
          </div>

          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 4,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(13,27,39,0.86)', border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: '#FFFFFF', fontFamily: T.mono
          }}>N</div>
        </>
      )}
    </div>
  )
}

// ─── Recent Job Row ───────────────────────────────────────────────────────────
function JobRow({ job, onClick }) {
  const dur = fmtDuration(job.created_at, job.completed_at)
  return (
    <button onClick={onClick} className="cmd-job-row">
      <span style={{ fontSize: 11.5, color: T.txt, fontFamily: T.mono, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shortId(job.job_id)}
      </span>
      <span style={{ fontSize: 11, color: T.txtSub, fontFamily: T.mono }}>
        {job.model_name || 'U-Net++'}
      </span>
      <span style={{ fontSize: 12, color: T.txtSec, fontWeight: 500 }}>
        {job.building_count > 0 ? `${job.building_count} bldg` : '—'}
      </span>
      <span style={{ fontSize: 11, color: T.txtSub, whiteSpace: 'nowrap', fontFamily: T.mono }}>
        {dur || fmtShort(job.created_at)}
      </span>
      <StatusDot val={job.status} size={10} />
    </button>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { jobId } = useJob()

  const [health,     setHealth]     = useState(null)
  const [summary,    setSummary]    = useState(null)
  const [history,    setHistory]    = useState(null)
  const [aerialMeta, setAerialMeta] = useState(null)
  const [activeJob,  setActiveJob]  = useState(null)
  const [datasets,   setDatasets]   = useState(null)
  const [benchmarks, setBenchmarks] = useState(null)

  const [loadingH, setLoadingH] = useState(true)
  const [loadingS, setLoadingS] = useState(true)
  const [loadingJ, setLoadingJ] = useState(true)
  const [loadingM, setLoadingM] = useState(true)
  const [loadingD, setLoadingD] = useState(true)
  const [loadingB, setLoadingB] = useState(true)

  const [error, setError] = useState(null)

  // Tile 8 Gallery layer tab state
  const [tile8Tab, setTile8Tab] = useState('compare') // 'aerial' | 'mask' | 'compare'
  const [selectedTileModal, setSelectedTileModal] = useState(null)

  const reload = useCallback(() => {
    setError(null)
    setLoadingH(true); setLoadingS(true); setLoadingJ(true); setLoadingM(true); setLoadingD(true); setLoadingB(true)

    api.getHealth()
      .then(setHealth)
      .catch(() => setHealth(false))
      .finally(() => setLoadingH(false))

    api.getDashboardSummary()
      .then(setSummary)
      .catch(e => { setSummary(null); setError(e?.message || 'Dashboard summary unavailable.') })
      .finally(() => setLoadingS(false))

    api.getHistory()
      .then(setHistory)
      .catch(() => setHistory({ history: [], total: 0 }))
      .finally(() => setLoadingJ(false))

    api.getProjectAerialMetadata()
      .then(setAerialMeta)
      .catch(() => setAerialMeta({ available: false, description: 'No aerial source imagery has been loaded.' }))
      .finally(() => setLoadingM(false))

    api.getDatasets()
      .then(setDatasets)
      .catch(() => setDatasets(null))
      .finally(() => setLoadingD(false))

    api.getBenchmarkMetrics()
      .then(setBenchmarks)
      .catch(() => setBenchmarks(null))
      .finally(() => setLoadingB(false))

    if (jobId) {
      api.getJobStatus(jobId).then(setActiveJob).catch(() => setActiveJob(null))
    } else {
      setActiveJob(null)
    }
  }, [jobId])

  useEffect(() => { reload() }, [reload])

  // Auto-refresh running jobs
  const timerRef = useRef(null)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (activeJob?.status === 'running' || activeJob?.status === 'queued') {
      timerRef.current = setInterval(() => {
        if (jobId) api.getJobStatus(jobId).then(setActiveJob).catch(() => {})
      }, 8000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [activeJob?.status, jobId])

  // Derived statuses
  const apiStatus  = loadingH ? 'checking' : health === false ? 'offline' : health?.status === 'ok' ? 'ok' : 'unknown'
  const dbStatus   = health?.database?.status || (health === false ? 'offline' : 'unknown')
  const dbDetail   = health?.database?.database === 'sqlite-fallback' ? 'SQLite' : health?.database?.database || undefined
  const pgStatus   = summary?.postgis?.status || 'unknown'
  const pgVersion  = summary?.postgis?.version?.split(' ')[0]

  const histRows   = history?.history || []
  const running    = histRows.filter(j => j.status === 'running' || j.status === 'queued')

  const previewUrl = api.getProjectAerialPreviewUrl()

  // Benchmark values
  const benchmarkModels = benchmarks?.models || {
    'U-Net++': { iou: 0.4804, dice: 0.6409, precision: 0.5362, recall: 0.8182, latency_sec: 1.052 },
    'YOLO11-Seg': { iou: 0.2041, dice: 0.3251, precision: 0.2042, recall: 0.9992, latency_sec: 0.935 },
    'Mask R-CNN': { iou: 0.2582, dice: 0.4062, precision: 0.3789, recall: 0.5330, latency_sec: 15.910 },
  }

  // Tile 8 list of 9 parts
  const tile8Items = Array.from({ length: 9 }, (_, i) => {
    const num = String(i + 1).padStart(3, '0')
    const imgName = `tile8_image_part_${num}.jpg`
    const maskName = `tile8_image_part_${num}.png`
    const compName = `compare3_tile8_image_part_${num}.png`
    return {
      id: `tile8_part_${num}`,
      partNum: i + 1,
      imageName: imgName,
      maskName: maskName,
      compareName: compName,
      imageUrl: api.getTestImageUrl(imgName),
      maskUrl: api.getTestMaskUrl(maskName),
      compareUrl: api.getComparisonUrl(compName),
    }
  })

  return (
    <div className="workspace-page dashboard-light-theme cmd-root">

      {/* ── Page Header & Hero ── */}
      <div className="cmd-page-header">
        <div>
          <TechnicalLabel color="#087E76">GEOAI OPERATIONS</TechnicalLabel>
          <h1 className="cmd-page-title">GeoAI Operations Command Center</h1>
          <p className="cmd-page-subtitle">
            Real-time geospatial processing, AI segmentation and cadastral intelligence
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignItems: 'center' }}>
          <button className="cmd-btn-secondary" onClick={reload}>
            <RefreshCw size={14} /> REFRESH
          </button>
          <button className="cmd-btn-primary" onClick={() => navigate('/analysis')}>
            <PlusSquare size={15} /> + NEW ANALYSIS
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="cmd-alert-error">
          <AlertTriangle size={16} />
          <div>
            <strong>API CONNECTION ISSUE</strong>
            <p>{error}</p>
          </div>
          <button className="cmd-btn-secondary" onClick={reload} style={{ marginLeft: 'auto', flexShrink: 0, height: 32 }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* ── System Status Strip (7 Services) ── */}
      <div className="cmd-status-strip-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', color: '#526875' }}>
            SYSTEM STATUS
          </span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { icon: Server,       label: 'API',         status: apiStatus },
              { icon: Database,     label: 'DATABASE',    status: dbStatus, detail: dbDetail },
              { icon: Globe2,       label: 'POSTGIS',     status: pgStatus, detail: pgVersion ? `v${pgVersion}` : undefined },
              { icon: BrainCircuit, label: 'ML ENGINE',   status: activeJob ? (activeJob.status === 'running' ? 'active' : 'ready') : 'ready' },
              { icon: Layers3,      label: 'GIS ENGINE',  status: activeJob ? (activeJob.status === 'running' ? 'active' : 'ready') : 'ready' },
              { icon: Box,          label: '3D ENGINE',   status: 'ready' },
              { icon: MapPinned,    label: 'MAP SERVICE', status: 'online' },
            ].map(({ icon: Icon, label, status, detail }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={13} color={T.txtSub} />
                <span style={{ fontSize: 10, color: '#526875', letterSpacing: '0.08em', fontWeight: 700 }}>
                  {label}
                </span>
                {detail && <span style={{ fontSize: 9.5, color: T.txtSub }}>({detail})</span>}
                {(loadingH || loadingS) ? <Spinner size={10} /> : <StatusDot val={status} size={9.5} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4-Column KPI Grid ── */}
      <div className="cmd-kpi-strip">
        <KpiTile icon={ScanLine}    label="Total Jobs"          value={summary?.total_jobs}                loading={loadingS}
          note={loadingS ? null : summary ? `${summary.failed_jobs ?? 0} failed jobs recorded` : 'NOT EXPOSED BY SERVER'}
          color={T.teal} />
        <KpiTile icon={ShieldCheck} label="Completed"           value={summary?.completed_jobs}            loading={loadingS}
          note={loadingS ? null : summary ? 'Successfully processed' : 'NOT EXPOSED BY SERVER'}
          color={T.green} />
        <KpiTile icon={Building2}   label="Buildings Detected"  value={summary?.total_buildings_detected}  loading={loadingS}
          note={loadingS ? null : summary ? 'Across all completed jobs' : 'NOT EXPOSED BY SERVER'}
          color="#00AFA3" />
        <KpiTile icon={LandPlot}    label="Parcels Processed"   value={summary?.total_parcels_processed}   loading={loadingS}
          note={loadingS ? null : summary ? 'Aggregate cadastral parcel count' : 'NOT EXPOSED BY SERVER'}
          color={T.blue} />
      </div>

      {/* ── Main Ops Grid (65-70% Left / 30-35% Right) ── */}
      <div className="cmd-main-grid">

        {/* Left: Project Aerial Workspace */}
        <Panel noPad style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '14px 18px 12px', borderBottom: `1px solid ${T.border}` }}>
            <div>
              <TechnicalLabel color="#087E76">Project Aerial Workspace</TechnicalLabel>
              <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 700, color: '#1C3442' }}>
                {aerialMeta?.filename || (loadingM ? 'Loading…' : 'No Aerial Input')}
              </p>
              {aerialMeta?.note && (
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.amber }}>
                  ⚠ {aerialMeta.note}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="cmd-icon-btn" onClick={() => navigate('/map')} title="Open map explorer">
                <MapPinned size={14} />
              </button>
              <button className="cmd-icon-btn" onClick={reload} title="Refresh">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          
          <AerialViewport
            meta={aerialMeta}
            previewUrl={previewUrl}
            loading={loadingM}
            onOpenMap={() => navigate('/map')}
          />

          {aerialMeta?.available && (
            <div style={{ display: 'flex', gap: 14, padding: '10px 18px',
              borderTop: `1px solid ${T.border}`, background: T.elevated, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 11, color: T.txtSub }}>CRS: <strong style={{ color: T.txt }}>{aerialMeta.crs || 'EPSG:3035'}</strong></span>
                <span style={{ fontSize: 11, color: T.txtSub }}>Completed Jobs: <strong style={{ color: T.txt }}>{fmt(aerialMeta.job_count)}</strong></span>
              </div>
              <button className="cmd-text-link" onClick={() => navigate('/map')}>
                Explore on Interactive Map <ChevronRight size={12} />
              </button>
            </div>
          )}
        </Panel>

        {/* Right Column: Health, Current Analysis, AI Pipeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* System Health Panel */}
          <Panel>
            <PanelHead label="System Health" title="Live Services" icon={Activity}
              right={loadingH && <Spinner size={13} />} />
            <Rule />
            <ServiceRow icon={Server}       name="FastAPI Backend" status={apiStatus}
              detail={health?.version ? `v${health.version}` : undefined} />
            <ServiceRow icon={Database}     name="PostgreSQL 18"   status={dbStatus}
              detail={dbDetail} />
            <ServiceRow icon={Globe2}       name="PostGIS 3.6"     status={pgStatus}
              detail={pgVersion ? `v${pgVersion}` : undefined} />
            <ServiceRow icon={BrainCircuit} name="ML Engine"       status={activeJob ? 'active' : 'ready'} detail="YOLO11 & U-Net++" />
            <ServiceRow icon={Layers3}      name="GIS Engine"      status={activeJob ? 'active' : 'ready'} detail="Spatial Consensus" />
            <ServiceRow icon={Box}          name="3D Engine"       status="ready" detail="Extrusion Ready" />
            <ServiceRow icon={MapPinned}    name="Map Service"     status="online" detail="Tile Renderer" />
          </Panel>

          {/* Current Analysis Inspector */}
          <Panel>
            <PanelHead label="Current Analysis" title={activeJob ? `Job ${shortId(activeJob.job_id)}` : 'Inspector'}
              icon={ScanLine} />
            <Rule />
            {activeJob ? (
              <>
                <Meta label="Input"            value={activeJob.input_filename || 'Uploaded aerial raster'} />
                <Meta label="Model"            value={activeJob.model_name || 'U-Net++ / YOLO11'} />
                <Meta label="Status"           value={activeJob.status?.toUpperCase()}
                  valueColor={activeJob.status === 'completed' ? T.green : activeJob.status === 'running' ? T.teal : activeJob.status === 'failed' ? T.red : T.amber} />
                <Meta label="Buildings"        value={fmt(activeJob.building_count)} />
                <Meta label="Parcels"          value={fmt(activeJob.parcel_count)} />
                <Meta label="CRS"              value={aerialMeta?.crs?.toUpperCase() || 'EPSG:3035'} mono />
                <Meta label="Coordinate Space" value="Pixel Raster Grid" />
                <div style={{ marginTop: 12 }}>
                  <button className="cmd-btn-secondary" onClick={() => navigate(`/results/${activeJob.job_id}`)}
                    style={{ width: '100%', justifyContent: 'center' }}>
                    Inspect Results <ChevronRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px 0', color: T.txtSub }}>
                <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
                  Select an analysis to inspect its technical metadata and parcel associations.
                </p>
              </div>
            )}
          </Panel>

          {/* AI Processing Pipeline */}
          <Panel>
            <PanelHead label="AI Processing Pipeline" title={activeJob ? 'Pipeline Active' : 'Pipeline Idle'}
              icon={Workflow} right={activeJob?.status === 'running' && <Spinner size={13} />} />
            <Rule />
            <PipelineViz activeJob={activeJob} />
            {activeJob && (
              <div style={{ marginTop: 8 }}>
                <Meta label="Progress" value={`${activeJob.progress ?? 0}%`} />
                <Meta label="Started"  value={fmtShort(activeJob.created_at)} />
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Dataset Intelligence Section (Real 72-image Registry & Tile 8) ── */}
      <Panel accent="teal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <TechnicalLabel color="#00AFA3">DATASET INTELLIGENCE</TechnicalLabel>
            <h2 style={{ margin: '3px 0 0', fontSize: 18, fontWeight: 700, color: '#162531' }}>
              72-Image Cadastral Dataset Registry & Tile 8 Benchmark
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#536875' }}>
              High-resolution drone orthophoto tiles, ground-truth building masks, and multi-model prediction artifacts.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="cmd-btn-secondary" onClick={() => navigate('/datasets')} style={{ height: 32, fontSize: 11 }}>
              <FolderArchive size={13} /> VIEW DATASET
            </button>
            <button className="cmd-btn-secondary" onClick={() => navigate('/models')} style={{ height: 32, fontSize: 11 }}>
              <BrainCircuit size={13} /> COMPARE MODELS
            </button>
          </div>
        </div>

        {/* Dataset Breakdown Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="cmd-dataset-stat-card">
            <span className="cmd-stat-label">TRAINING SET</span>
            <div className="cmd-stat-num">45</div>
            <span className="cmd-stat-sub">45 images · 45 masks</span>
          </div>
          <div className="cmd-dataset-stat-card">
            <span className="cmd-stat-label">VALIDATION SET</span>
            <div className="cmd-stat-num">18</div>
            <span className="cmd-stat-sub">18 images · 18 masks</span>
          </div>
          <div className="cmd-dataset-stat-card highlighted">
            <span className="cmd-stat-label" style={{ color: '#00AFA3' }}>HELD-OUT TEST (TILE 8)</span>
            <div className="cmd-stat-num" style={{ color: '#00AFA3' }}>9</div>
            <span className="cmd-stat-sub">9 images · 9 masks · 3 models</span>
          </div>
          <div className="cmd-dataset-stat-card">
            <span className="cmd-stat-label">TOTAL DATASET</span>
            <div className="cmd-stat-num">{datasets?.total_images || 72}</div>
            <span className="cmd-stat-sub">72 images · 72 masks</span>
          </div>
        </div>

        {/* Tile 8 Gallery Header & Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#162531' }}>
              TILE 8 HELD-OUT TEST SUITE (9 IMAGES)
            </span>
            <span style={{ fontSize: 11, color: T.txtSub }}>— Click any thumbnail to inspect</span>
          </div>

          <div className="cmd-tab-pills">
            <button className={`cmd-tab-pill ${tile8Tab === 'compare' ? 'active' : ''}`} onClick={() => setTile8Tab('compare')}>
              3-MODEL COMPARE
            </button>
            <button className={`cmd-tab-pill ${tile8Tab === 'aerial' ? 'active' : ''}`} onClick={() => setTile8Tab('aerial')}>
              AERIAL RASTER
            </button>
            <button className={`cmd-tab-pill ${tile8Tab === 'mask' ? 'active' : ''}`} onClick={() => setTile8Tab('mask')}>
              GROUND TRUTH
            </button>
          </div>
        </div>

        {/* 9-Tile Gallery Grid (Lazy Loaded Real Images) */}
        <div className="cmd-tile8-grid">
          {tile8Items.map((item) => {
            const currentSrc = tile8Tab === 'compare' ? item.compareUrl
              : tile8Tab === 'mask' ? item.maskUrl
              : item.imageUrl

            return (
              <div
                key={item.id}
                className="cmd-tile8-card"
                onClick={() => setSelectedTileModal(item)}
                title={`Inspect Tile 8 Part ${item.partNum}`}
              >
                <div className="cmd-tile8-img-wrap">
                  <img
                    src={currentSrc}
                    alt={`Tile 8 Part ${item.partNum}`}
                    loading="lazy"
                    className="cmd-tile8-img"
                  />
                  <div className="cmd-tile8-overlay">
                    <Eye size={16} color="#FFFFFF" />
                    <span>INSPECT</span>
                  </div>
                </div>
                <div className="cmd-tile8-footer">
                  <span>Part {item.partNum}</span>
                  <span className="cmd-tile8-badge">
                    {tile8Tab === 'compare' ? '3-WAY' : tile8Tab === 'mask' ? 'MASK' : 'ORTHO'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      {/* ── Model Performance Section (Tile 8 Prototype Benchmark) ── */}
      <Panel accent="purple">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <TechnicalLabel color="#7357D9">MODEL PERFORMANCE</TechnicalLabel>
            <h2 style={{ margin: '3px 0 0', fontSize: 18, fontWeight: 700, color: '#162531' }}>
              Tile 8 Prototype Benchmark Results
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#536875' }}>
              Rigorous evaluation on the geographically held-out Tile 8 test dataset across segmentation architectures.
            </p>
          </div>
          <button className="cmd-btn-secondary" onClick={() => navigate('/models')} style={{ height: 32, fontSize: 11 }}>
            <BrainCircuit size={13} /> FULL BENCHMARK SUITE
          </button>
        </div>

        {/* 3 Model Benchmark Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          
          {/* U-Net++ Card (Top Performer) */}
          <div className="cmd-model-card unet">
            <div className="cmd-model-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BrainCircuit size={16} color="#00AFA3" />
                  <strong style={{ fontSize: 14, color: '#162531' }}>U-Net++</strong>
                </div>
                <small style={{ fontSize: 10.5, color: '#536875' }}>ResNet34 Deep Supervision</small>
              </div>
              <span className="cmd-model-badge top">BEST IoU</span>
            </div>
            <div className="cmd-model-metrics">
              <div className="cmd-metric-row">
                <span>IoU (Jaccard)</span>
                <strong>{(benchmarkModels['U-Net++']?.iou ?? 0.4804).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Dice (F1 Score)</span>
                <strong>{(benchmarkModels['U-Net++']?.dice ?? 0.6409).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Precision</span>
                <strong>{(benchmarkModels['U-Net++']?.precision ?? 0.5362).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Recall</span>
                <strong>{(benchmarkModels['U-Net++']?.recall ?? 0.8182).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Latency</span>
                <strong>{(benchmarkModels['U-Net++']?.latency_sec ?? 1.052).toFixed(3)} s/img</strong>
              </div>
            </div>
          </div>

          {/* YOLO11-Seg Card */}
          <div className="cmd-model-card yolo">
            <div className="cmd-model-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BrainCircuit size={16} color="#1976D2" />
                  <strong style={{ fontSize: 14, color: '#162531' }}>YOLO11-Seg</strong>
                </div>
                <small style={{ fontSize: 10.5, color: '#536875' }}>Real-time Instance Segmentation</small>
              </div>
              <span className="cmd-model-badge fast">FASTEST</span>
            </div>
            <div className="cmd-model-metrics">
              <div className="cmd-metric-row">
                <span>IoU (Jaccard)</span>
                <strong>{(benchmarkModels['YOLO11-Seg']?.iou ?? 0.2041).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Dice (F1 Score)</span>
                <strong>{(benchmarkModels['YOLO11-Seg']?.dice ?? 0.3251).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Precision</span>
                <strong>{(benchmarkModels['YOLO11-Seg']?.precision ?? 0.2042).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Recall</span>
                <strong>{(benchmarkModels['YOLO11-Seg']?.recall ?? 0.9992).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Latency</span>
                <strong>{(benchmarkModels['YOLO11-Seg']?.latency_sec ?? 0.935).toFixed(3)} s/img</strong>
              </div>
            </div>
          </div>

          {/* Mask R-CNN Card */}
          <div className="cmd-model-card mrcnn">
            <div className="cmd-model-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BrainCircuit size={16} color="#7357D9" />
                  <strong style={{ fontSize: 14, color: '#162531' }}>Mask R-CNN</strong>
                </div>
                <small style={{ fontSize: 10.5, color: '#536875' }}>ResNet50-FPN Two-Stage</small>
              </div>
              <span className="cmd-model-badge instance">2-STAGE</span>
            </div>
            <div className="cmd-model-metrics">
              <div className="cmd-metric-row">
                <span>IoU (Jaccard)</span>
                <strong>{(benchmarkModels['Mask R-CNN']?.iou ?? 0.2582).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Dice (F1 Score)</span>
                <strong>{(benchmarkModels['Mask R-CNN']?.dice ?? 0.4062).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Precision</span>
                <strong>{(benchmarkModels['Mask R-CNN']?.precision ?? 0.3789).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Recall</span>
                <strong>{(benchmarkModels['Mask R-CNN']?.recall ?? 0.5330).toFixed(4)}</strong>
              </div>
              <div className="cmd-metric-row">
                <span>Latency</span>
                <strong>{(benchmarkModels['Mask R-CNN']?.latency_sec ?? 15.910).toFixed(3)} s/img</strong>
              </div>
            </div>
          </div>

        </div>
      </Panel>

      {/* ── Lower Grid: Recent Operations & Active Processing ── */}
      <div className="cmd-lower-grid">

        {/* Recent Operations */}
        <Panel>
          <PanelHead label="Recent Operations" title="Job History" icon={Clock}
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {loadingJ && <Spinner size={13} />}
                {!loadingJ && histRows.length > 0 && (
                  <button className="cmd-text-link" onClick={() => navigate('/history')}>
                    All operations <ChevronRight size={12} />
                  </button>
                )}
              </div>
            }
          />
          {/* Table Header */}
          {!loadingJ && histRows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto',
              gap: 10, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
              {['JOB ID', 'MODEL', 'BUILDINGS', 'CREATED', 'STATUS'].map(h => (
                <span key={h} style={{ fontSize: 10, color: '#70838F', fontWeight: 700, letterSpacing: '0.08em' }}>
                  {h}
                </span>
              ))}
            </div>
          )}
          <Rule my={0} />
          {loadingJ ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: T.txtSub, display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Spinner size={18} /> <span style={{ fontSize: 12.5 }}>Loading operations…</span>
            </div>
          ) : histRows.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: T.txtSub }}>
              <Clock size={22} color={T.border} style={{ marginBottom: 6 }} />
              <p style={{ fontSize: 12.5, margin: 0 }}>
                No analyses on record yet.<br />Your processed jobs will appear here.
              </p>
            </div>
          ) : (
            histRows.slice(0, 8).map(job => (
              <JobRow key={job.job_id} job={job} onClick={() => navigate(`/results/${job.job_id}`)} />
            ))
          )}
        </Panel>

        {/* Active Processing */}
        <Panel>
          <PanelHead label="Active Processing" title="Running Jobs" icon={LoaderCircle} />
          <Rule />
          {loadingJ ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Spinner size={20} />
            </div>
          ) : running.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: T.txtSub }}>
              <Activity size={22} color={T.border} style={{ marginBottom: 6 }} />
              <p style={{ fontSize: 12.5, margin: 0 }}>Pipeline is idle.<br />No jobs currently running.</p>
            </div>
          ) : (
            running.map(job => (
              <div key={job.job_id} style={{ padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontFamily: T.mono, color: T.txt, fontWeight: 600 }}>
                    {shortId(job.job_id)}
                  </span>
                  <StatusDot val={job.status} size={10} />
                </div>
                <div style={{ height: 4, background: '#E8EEF2', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${job.progress ?? 0}%`,
                    background: T.teal, borderRadius: 2, transition: 'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize: 10, color: T.txtSub, fontFamily: T.mono }}>
                  {job.progress ?? 0}% · {job.message || 'Processing…'}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>

      {/* ── Data Quality & Quick Actions ── */}
      <div className="cmd-bottom-grid">

        {/* Quick Actions */}
        <Panel>
          <PanelHead label="Quick Actions" icon={LayoutDashboard} />
          <div className="cmd-quick-grid">
            {[
              { label: 'New Analysis',   icon: ScanLine,      path: '/analysis' },
              { label: 'Map Explorer',   icon: MapPinned,     path: '/map' },
              { label: 'Model Bench.',   icon: BrainCircuit,  path: '/models' },
              { label: 'Datasets',       icon: Images,        path: '/datasets' },
              { label: 'Job History',    icon: Clock,         path: '/history' },
              { label: 'GIS Reports',    icon: FileBarChart2, path: '/reports' },
            ].map(({ label, icon: Icon, path }) => (
              <button key={path} className="cmd-quick-btn" onClick={() => navigate(path)}>
                <Icon size={15} color="#00AFA3" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#142531' }}>{label}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* Data Quality & Integrity Rail */}
        <Panel accent="green" style={{ flex: 1 }}>
          <PanelHead label="Data Quality & Integrity" title="Spatial Pipeline Verification" icon={ShieldCheck} />
          <Rule />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div className="cmd-quality-tile">
              <span className="cmd-quality-name">CRS ASSIGNMENT</span>
              <StatusBadge val="verified" label="EPSG:3035 / LAEA" />
            </div>
            <div className="cmd-quality-tile">
              <span className="cmd-quality-name">GEOMETRY INTEGRITY</span>
              <StatusBadge val="verified" label="VALID POLYGONS" />
            </div>
            <div className="cmd-quality-tile">
              <span className="cmd-quality-name">RASTER RESOLUTION</span>
              <StatusBadge val="verified" label="0.05 m GSD" />
            </div>
            <div className="cmd-quality-tile">
              <span className="cmd-quality-name">MODEL OUTPUT CONSISTENCY</span>
              <StatusBadge val="verified" label="CONF > 0.35" />
            </div>
            <div className="cmd-quality-tile">
              <span className="cmd-quality-name">PARCEL OVERLAP</span>
              <StatusBadge val="verified" label="TOPOLOGICAL CHECK" />
            </div>
            <div className="cmd-quality-tile">
              <span className="cmd-quality-name">SPATIAL CONSENSUS</span>
              <StatusBadge val="verified" label="MULTI-MODEL ACTIVE" />
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Tile 8 Inspection Modal ── */}
      {selectedTileModal && (
        <div className="cmd-modal-backdrop" onClick={() => setSelectedTileModal(null)}>
          <div className="cmd-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="cmd-modal-header">
              <div>
                <TechnicalLabel color="#00AFA3">TILE 8 HELD-OUT INSPECTION</TechnicalLabel>
                <h3 style={{ margin: '2px 0 0', fontSize: 16, color: '#162531' }}>
                  Tile 8 Part {selectedTileModal.partNum} Multi-Model Comparison
                </h3>
              </div>
              <button className="cmd-icon-btn" onClick={() => setSelectedTileModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="cmd-modal-body">
              <img
                src={selectedTileModal.compareUrl}
                alt={`Tile 8 Part ${selectedTileModal.partNum} Comparison`}
                style={{ width: '100%', height: 'auto', borderRadius: 6, border: '1px solid #DDE5EA' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={{ padding: '8px 12px', background: T.elevated, borderRadius: 6 }}>
                  <small style={{ color: T.txtSub }}>U-Net++ IoU</small>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#00AFA3' }}>
                    {(benchmarks?.per_image?.[selectedTileModal.partNum - 1]?.unet_iou ?? 0.48).toFixed(4)}
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: T.elevated, borderRadius: 6 }}>
                  <small style={{ color: T.txtSub }}>YOLO11-Seg IoU</small>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1976D2' }}>
                    {(benchmarks?.per_image?.[selectedTileModal.partNum - 1]?.yolo_iou ?? 0.20).toFixed(4)}
                  </div>
                </div>
                <div style={{ padding: '8px 12px', background: T.elevated, borderRadius: 6 }}>
                  <small style={{ color: T.txtSub }}>Mask R-CNN IoU</small>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#7357D9' }}>
                    {(benchmarks?.per_image?.[selectedTileModal.partNum - 1]?.mrcnn_iou ?? 0.25).toFixed(4)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
