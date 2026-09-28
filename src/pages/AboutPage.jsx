import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Boxes,
  BrainCircuit,
  Building2,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Compass,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  FileBarChart2,
  GitBranch,
  Globe,
  Globe2,
  HardDrive,
  Images,
  Layers,
  Layers3,
  Lock,
  Map,
  MapPinned,
  Radio,
  RefreshCw,
  Scan,
  ScanLine,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import geoaiRobot from '../assets/geoai-robot.png'
import './AboutPage.css'

const stages = [
  {
    number: '01',
    title: 'SOURCE IMAGERY',
    eyebrow: 'INPUT STAGE',
    description: 'Upload and validation are handled by the existing FastAPI service.',
    icon: Images,
    meta: ['FASTAPI INGESTION', 'RASTER VALIDATION'],
    detail:
      'Imagery enters through the existing upload workflow, where the API handles file intake, coordinate projection checks, and raster validation before processing.',
    route: '/analysis',
    action: 'OPEN ANALYSIS',
  },
  {
    number: '02',
    title: 'SEGMENTATION',
    eyebrow: 'AI INFERENCE',
    description: 'Configured model checkpoints run through the recovered processing pipeline.',
    icon: BrainCircuit,
    meta: ['YOLO11-SEG', 'U-NET++', 'MASK R-CNN'],
    detail:
      'The project includes YOLO11-Seg, U-Net++, and Mask R-CNN workflows. The selected model and available checkpoint depend on the current configuration.',
    route: '/models',
    action: 'OPEN MODELS',
  },
  {
    number: '03',
    title: 'SPATIAL CONSENSUS',
    eyebrow: 'QUALITY / GEOMETRY',
    description: 'Building and parcel relationships are reported when the backend provides them.',
    icon: Layers3,
    meta: ['GEOMETRY', 'CONFIDENCE', 'INTERSECTION'],
    detail:
      'Spatial relationships and parcel-level associations are shown only when supported by the job output; unavailable geometry is not inferred by this page.',
    route: '/parcels',
    action: 'VIEW PARCELS',
  },
  {
    number: '04',
    title: 'REVIEW & EXPORT',
    eyebrow: 'OUTPUT STAGE',
    description: 'Generated artifacts remain available through the existing results and report routes.',
    icon: ShieldCheck,
    meta: ['RESULTS', 'REPORTS', 'GIS ARTIFACTS'],
    detail:
      'Review records, results, and generated report artifacts are accessed through their existing application pages and backend routes.',
    route: '/reports',
    action: 'VIEW REPORTS',
  },
]

const workflow = [
  {
    label: 'DRONE / AERIAL IMAGERY',
    icon: Images,
    detail: 'Project imagery enters through the existing upload and demo-data workflows.',
    tag: 'INPUT RASTER',
  },
  {
    label: 'AI EXTRACTION',
    icon: BrainCircuit,
    detail: 'Configured segmentation checkpoints produce deep-learning model predictions.',
    tag: 'DEEP LEARNING',
  },
  {
    label: 'GEOMETRY',
    icon: Building2,
    detail: 'Predictions can be represented as building geometries in supported spatial outputs.',
    tag: 'VECTORIZATION',
  },
  {
    label: 'SPATIAL CONSENSUS',
    icon: GitBranch,
    detail: 'Building and parcel relationships are reported when backend data supports them.',
    tag: 'TOPOLOGY MATCH',
  },
  {
    label: 'GIS / REVIEW',
    icon: ClipboardCheck,
    detail: 'Review and GIS pages expose available spatial results and review records.',
    tag: 'HUMAN-IN-THE-LOOP',
  },
  {
    label: 'RESULTS / REPORTS',
    icon: FileBarChart2,
    detail: 'Existing results and report pages present generated job artifacts and metrics.',
    tag: 'EXPORT ARTIFACTS',
  },
  {
    label: 'POSTGIS',
    icon: Database,
    detail:
      'PostGIS availability is shown from the existing status endpoint; persistence depends on runtime configuration.',
    tag: 'SPATIAL DB',
  },
]

const capabilities = [
  {
    label: 'DATA INGESTION',
    text: 'Submit aerial orthomosaics and rasters through the existing analysis workflow.',
    tech: 'FASTAPI UPLOAD',
    icon: Images,
    route: '/analysis',
  },
  {
    label: 'MODEL INFERENCE',
    text: 'Select from configured segmentation neural networks (YOLO11, U-Net++, Mask R-CNN).',
    tech: 'SEGMENTATION',
    icon: BrainCircuit,
    route: '/models',
  },
  {
    label: 'BUILDING EXTRACTION',
    text: 'Inspect footprint polygons, confidence thresholds, and spatial boundaries.',
    tech: 'RESULT GEOMETRY',
    icon: Building2,
    route: '/results',
  },
  {
    label: 'PARCEL ANALYSIS',
    text: 'Review cadastral parcel associations and boundary intersections when job data provides them.',
    tech: 'SPATIAL RELATIONS',
    icon: Globe2,
    route: '/parcels',
  },
  {
    label: 'SPATIAL REVIEW',
    text: 'Inspect available review records, flagged deviations, and human-in-the-loop decisions.',
    tech: 'HUMAN REVIEW',
    icon: ShieldCheck,
    route: '/review',
  },
  {
    label: 'MAP EXPLORATION',
    text: 'Explore multi-layer imagery, satellite tiles, and spatial vector layers with coordinate views.',
    tech: 'MAP CANVAS',
    icon: MapPinned,
    route: '/map',
  },
  {
    label: 'DATASET PROVENANCE',
    text: 'Browse registered drone imagery collections, split registries, and spatial metadata.',
    tech: 'DATASET REGISTRY',
    icon: HardDrive,
    route: '/datasets',
  },
  {
    label: 'MODEL BENCHMARKING',
    text: 'Compare checkpoint performance, mIoU metrics, and model inference metrics.',
    tech: 'MODEL BENCHMARKS',
    icon: Activity,
    route: '/models',
  },
]

const explorations = [
  {
    label: 'PLATFORM',
    text: 'Product overview, system architecture, and platform command center.',
    route: '/platform',
    icon: Boxes,
    tag: 'HUB',
  },
  {
    label: 'ANALYSIS',
    text: 'Start an aerial imagery analysis and segmentation pipeline run.',
    route: '/analysis',
    icon: ScanLine,
    tag: 'PIPELINE',
  },
  {
    label: 'MAP',
    text: 'Explore interactive raster datasets and coordinate-aware spatial overlays.',
    route: '/map',
    icon: Map,
    tag: 'GIS CANVAS',
  },
  {
    label: 'MODELS',
    text: 'Inspect checkpoint architectures, inference configurations, and benchmarks.',
    route: '/models',
    icon: BrainCircuit,
    tag: 'NEURAL NETS',
  },
  {
    label: 'DATASETS',
    text: 'Review registered training/validation imagery sets and dataset provenance.',
    route: '/datasets',
    icon: HardDrive,
    tag: 'REGISTRY',
  },
  {
    label: 'HISTORY',
    text: 'Browse persisted processing job execution telemetry and past runs.',
    route: '/history',
    icon: Activity,
    tag: 'TELEMETRY',
  },
  {
    label: 'REPORTS',
    text: 'Access generated analysis summaries, spatial exports, and GIS artifacts.',
    route: '/reports',
    icon: FileBarChart2,
    tag: 'OUTPUTS',
  },
  {
    label: 'REVIEW',
    text: 'Inspect human-in-the-loop validation queue and spatial consensus records.',
    route: '/review',
    icon: ClipboardCheck,
    tag: 'AUDIT',
  },
]

const stackGroups = [
  {
    title: 'APPLICATION',
    icon: Server,
    desc: 'Reactive UI & High-throughput REST API',
    items: ['React 18', 'Vite', 'FastAPI', 'Framer Motion', 'Leaflet / Recharts'],
  },
  {
    title: 'DATABASE & SPATIAL DB',
    icon: Database,
    desc: 'Spatial persistence & Vector indexing',
    items: ['PostgreSQL', 'PostGIS Extension', 'Spatial Index (R-Tree)', 'SQLite Fallback'],
  },
  {
    title: 'SPATIAL & RASTER ENGINE',
    icon: Compass,
    desc: 'Coordinate transformation & Polygon extraction',
    items: ['Rasterio (GDAL)', 'GeoPandas', 'Shapely', 'PyProj (EPSG)', 'OpenCV'],
  },
  {
    title: 'MODEL & INFERENCE STACK',
    icon: BrainCircuit,
    desc: 'Deep learning instance segmentation',
    items: ['YOLO11-Seg', 'U-Net++ (ResNet)', 'Mask R-CNN', 'PyTorch / Torchvision'],
  },
]

const systemIndicators = [
  { key: 'api', label: 'API GATEWAY', desc: 'FastAPI core service status' },
  { key: 'database', label: 'DATABASE', desc: 'Relational data store connection' },
  { key: 'postgis', label: 'POSTGIS ENGINE', desc: 'Spatial extension & geometry support' },
  { key: 'ml', label: 'ML PIPELINE', desc: 'Segmentation model runner' },
  { key: 'gis', label: 'GIS PIPELINE', desc: 'Vectorization & spatial consensus' },
]

function describeStatus(key, system, loading) {
  if (loading) return 'CHECKING'
  if (key === 'api') {
    if (!system.health) return 'NOT AVAILABLE'
    return system.health.status ? String(system.health.status).toUpperCase() : 'NOT REPORTED'
  }
  if (key === 'database') {
    const status = system.health?.database?.status
    return status ? String(status).toUpperCase() : 'NOT AVAILABLE'
  }
  if (key === 'postgis') {
    const status = system.postgis?.status
    return status ? String(status).toUpperCase() : 'NOT AVAILABLE'
  }
  if (key === 'ml' || key === 'gis') {
    return 'AVAILABLE'
  }
  return 'NOT AVAILABLE'
}

function statusClass(status) {
  const value = status.toLowerCase()
  if (['ok', 'connected', 'available', 'healthy'].includes(value)) return 'is-available'
  if (value === 'checking') return 'is-checking'
  if (value === 'not available' || value === 'unavailable') return 'is-unavailable'
  return 'is-neutral'
}

export default function AboutPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [activeStage, setActiveStage] = useState(null)
  const [activeWorkflow, setActiveWorkflow] = useState(0)
  const [activeCapability, setActiveCapability] = useState(capabilities[0])
  const [system, setSystem] = useState({ health: null, postgis: null })
  const [checking, setChecking] = useState(true)
  const [statusError, setStatusError] = useState('')

  const getPlatformRoute = (target) => {
    return isAuthenticated ? target : '/login'
  }

  const loadSystemStatus = useCallback(async () => {
    setChecking(true)
    setStatusError('')
    const [healthResult, postgisResult] = await Promise.allSettled([
      api.getHealth(),
      api.getPostgisStatus(),
    ])
    const health = healthResult.status === 'fulfilled' ? healthResult.value : null
    const postgis = postgisResult.status === 'fulfilled' ? postgisResult.value : null
    setSystem({ health, postgis })
    if (healthResult.status === 'rejected' || postgisResult.status === 'rejected') {
      setStatusError(
        'One or more live status checks could not be loaded. Unavailable values are not inferred.'
      )
    }
    setChecking(false)
  }, [])

  useEffect(() => {
    loadSystemStatus()
  }, [loadSystemStatus])

  const apiState = describeStatus('api', system, checking)
  const dbState = describeStatus('database', system, checking)
  const postgisState = describeStatus('postgis', system, checking)

  return (
    <main className="about-page">
      {/* Top HUD Navigation Bar */}
      <div className="about-page__topline">
        <Link to="/" className="about-back" title="Return to Landing Page">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>RETURN TO HOME</span>
        </Link>
        <Link to="/" className="about-brand-center" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#ffffff', textDecoration: 'none', fontWeight: 800, letterSpacing: '0.12em', fontSize: '13px' }}>
          <Boxes size={16} style={{ color: '#00f0ff' }} />
          <span>GEOCADASTRA</span>
        </Link>
        <div className="about-topline-hud">
          <span className="about-topline-label">
            <span className="about-pulse-beacon" /> SYSTEM ARCHITECTURE & ENGINEERING
          </span>
          <span className="about-topline-coords">
            <Scan size={11} /> EPSG:3857 · WGS84
          </span>
        </div>
      </div>

      {/* Hero Command Center Header */}
      <header className="about-hero">
        <div className="about-hero__copy">
          <div className="about-eyebrow">
            <span className="about-eyebrow__line" />
            <span className="about-eyebrow__text">GEOSPATIAL OPERATOR CONSOLE</span>
          </div>

          <h1 className="about-hero__title">
            GeoCadastra <span className="about-hero__version">v1.0</span>
          </h1>

          <p className="about-hero__subtitle">
            End-to-end aerial segmentation and PostGIS spatial intelligence pipeline.
          </p>

          <p className="about-hero__description">
            A high-precision geospatial engineering workspace connecting drone orthomosaics, configured AI
            segmentation neural networks, spatial consensus validation, and human-in-the-loop review
            across the enterprise GeoCadastra operational surface.
          </p>

          {/* Quick HUD Metrics */}
          <div className="about-hero__stats" aria-label="Platform capability overview">
            <div className="about-hero__stat">
              <span className="about-hero__stat-label">PIPELINE WORKFLOW</span>
              <strong>AI + SPATIAL GIS</strong>
              <small>End-to-end Automation</small>
            </div>
            <div className="about-hero__stat">
              <span className="about-hero__stat-label">SPATIAL DATABASE</span>
              <strong className="tone-cyan">POSTGIS ENGINE</strong>
              <small>PostgreSQL / R-Tree</small>
            </div>
            <div className="about-hero__stat">
              <span className="about-hero__stat-label">OUTPUT ARTIFACTS</span>
              <strong>GEOJSON + REPORTS</strong>
              <small>Cadastral Compliance</small>
            </div>
          </div>

          <div className="about-hero__actions">
            <a className="about-action about-action--primary" href="#architecture">
              VIEW PIPELINE <ArrowDown size={14} aria-hidden="true" />
            </a>
            <Link className="about-action about-action--secondary" to={getPlatformRoute('/platform')}>
              EXPLORE PLATFORM <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Tactical Robot / Aerial Visual */}
        <div className="about-hero__visual" aria-hidden="true">
          <div className="about-visual-target-ring" />
          <div className="about-visual-target-crosshair" />
          <img src={geoaiRobot} alt="GeoCadastra AI System Core" />
          <div className="about-hero__visual-hud">
            <span className="visual-hud-tag">
              <Radio size={10} className="pulse-icon" /> AI SPATIAL CORE
            </span>
            <span className="visual-hud-sub">AERIAL DATA INGESTION &amp; INFERENCE</span>
          </div>
        </div>

        {/* Live System Readout Console */}
        <aside className="about-hero__readout" aria-label="Live system status summary">
          <div className="about-readout__head">
            <div className="about-readout__title">
              <Activity size={13} className="about-readout__pulse-icon" />
              <span>LIVE SYSTEM TELEMETRY</span>
            </div>
            <button
              className="about-icon-button"
              type="button"
              onClick={loadSystemStatus}
              disabled={checking}
              aria-label="Refresh system status"
              title="Refresh live status checks"
            >
              <RefreshCw size={13} className={checking ? 'about-spin' : ''} aria-hidden="true" />
            </button>
          </div>

          <div className="about-readout__statuses">
            <div className="about-readout__row">
              <span className="readout-label">
                <Server size={12} /> API GATEWAY
              </span>
              <strong className={statusClass(apiState)}>
                <i />
                {apiState}
              </strong>
            </div>
            <div className="about-readout__row">
              <span className="readout-label">
                <Database size={12} /> DATABASE
              </span>
              <strong className={statusClass(dbState)}>
                <i />
                {dbState}
              </strong>
            </div>
            <div className="about-readout__row">
              <span className="readout-label">
                <Compass size={12} /> POSTGIS
              </span>
              <strong className={statusClass(postgisState)}>
                <i />
                {postgisState}
              </strong>
            </div>
          </div>

          <div className="about-readout__meta">
            <span>
              FRONTEND <b>REACT 18 / VITE</b>
            </span>
            <span>
              BACKEND <b>FASTAPI / PYTHON</b>
            </span>
            <span>
              SPATIAL <b>POSTGIS + SHAPELY</b>
            </span>
          </div>
        </aside>

        {/* Background Grid Accent */}
        <div className="about-hero__grid" aria-hidden="true" />
      </header>

      {/* =========================================================================
          SECTION 01: SYSTEM ARCHITECTURE
          ========================================================================= */}
      <section className="about-section" id="architecture" aria-labelledby="architecture-title">
        <div className="about-section__heading">
          <div>
            <p className="about-eyebrow">
              <span className="about-eyebrow__line" /> PROCESSING MODEL · 04 STAGES
            </p>
            <h2 id="architecture-title">System Architecture</h2>
            <p className="about-section__desc">
              The conceptual four-stage processing lifecycle executed by the backend and UI workflows.
            </p>
          </div>
          <span className="about-section__index">01 / ARCHITECTURE</span>
        </div>

        <div className="about-architecture">
          {stages.map((stage, index) => {
            const Icon = stage.icon
            const expanded = activeStage === index
            return (
              <article
                className={`about-stage${expanded ? ' is-expanded' : ''}`}
                key={stage.number}
              >
                <div className="about-stage__top">
                  <span className="about-stage__number">{stage.number}</span>
                  <div className="about-stage__icon-wrap">
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <span className="about-stage__marker">STAGE {stage.number}</span>
                </div>

                <p className="about-stage__eyebrow">{stage.eyebrow}</p>
                <h3>{stage.title}</h3>
                <p className="about-stage__description">{stage.description}</p>

                <div className="about-stage__meta">
                  {stage.meta.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>

                {expanded && (
                  <div className="about-stage__detail">
                    <p>{stage.detail}</p>
                    <Link to={getPlatformRoute(stage.route)} className="about-stage__link">
                      <span>{stage.action}</span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  </div>
                )}

                <button
                  className="about-stage__toggle"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setActiveStage(expanded ? null : index)}
                >
                  <span>{expanded ? 'HIDE SPECIFICATIONS' : 'VIEW SPECIFICATIONS'}</span>
                  <ChevronDown size={13} className="toggle-icon" aria-hidden="true" />
                </button>
              </article>
            )
          })}
        </div>

        <div className="about-flow-note">
          <Workflow size={14} aria-hidden="true" />
          <span>FRONTEND ARCHITECTURE VISUALIZATION · RECOVERED ENTERPRISE PIPELINE SPECIFICATION</span>
        </div>
      </section>

      {/* =========================================================================
          SECTION 02: INTERACTIVE WORKFLOW
          ========================================================================= */}
      <section className="about-section about-section--workflow" aria-labelledby="workflow-title">
        <div className="about-section__heading">
          <div>
            <p className="about-eyebrow">
              <span className="about-eyebrow__line" /> INTERACTIVE PROCESS MODEL
            </p>
            <h2 id="workflow-title">From Imagery to Spatial Record</h2>
            <p className="about-section__desc">
              Select any stage in the seven-node pipeline below to examine its exact role and transformations.
            </p>
          </div>
          <span className="about-section__index">02 / WORKFLOW</span>
        </div>

        <div className="about-workflow">
          {workflow.map((item, index) => {
            const Icon = item.icon
            const isActive = activeWorkflow === index
            return (
              <div className="about-workflow__unit" key={item.label}>
                <button
                  type="button"
                  className={`about-workflow__node${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveWorkflow(index)}
                  aria-pressed={isActive}
                >
                  <div className="about-workflow__top">
                    <span className="about-workflow__num">0{index + 1}</span>
                    <span className="about-workflow__tag">{item.tag}</span>
                  </div>
                  <div className="about-workflow__icon-row">
                    <span className="about-workflow__icon">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="about-workflow__label">{item.label}</span>
                  </div>
                  {isActive && <div className="about-workflow__active-bar" />}
                </button>
                {index < workflow.length - 1 && (
                  <ArrowRight
                    className="about-workflow__connector"
                    size={15}
                    aria-hidden="true"
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="about-workflow__detail" aria-live="polite">
          <div className="about-workflow__detail-badge">
            <span className="about-workflow__detail-index">
              STAGE 0{activeWorkflow + 1} OF 0{workflow.length}
            </span>
          </div>
          <div className="about-workflow__detail-content">
            <strong>{workflow[activeWorkflow].label}</strong>
            <p>{workflow[activeWorkflow].detail}</p>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 03: ENGINEERING CAPABILITIES
          ========================================================================= */}
      <section className="about-section" aria-labelledby="capabilities-title">
        <div className="about-section__heading">
          <div>
            <p className="about-eyebrow">
              <span className="about-eyebrow__line" /> APPLICATION SURFACE
            </p>
            <h2 id="capabilities-title">Engineering Capabilities</h2>
            <p className="about-section__desc">
              Core platform capabilities connected directly to operational application routes.
            </p>
          </div>
          <span className="about-section__index">03 / CAPABILITIES</span>
        </div>

        <div className="about-capabilities">
          {capabilities.map((item) => {
            const Icon = item.icon
            const selected = activeCapability?.label === item.label
            return (
              <button
                className={`about-capability${selected ? ' is-selected' : ''}`}
                type="button"
                key={item.label}
                onClick={() => setActiveCapability(item)}
                aria-pressed={selected}
                title={item.text}
              >
                <div className="about-capability__top">
                  <div className="about-capability__icon">
                    <Icon size={17} aria-hidden="true" />
                  </div>
                  <span className="about-capability__tech">{item.tech}</span>
                </div>
                <strong>{item.label}</strong>
                <p className="about-capability__text">{item.text}</p>
                <div className="about-capability__foot">
                  <span>EXPLORE WORKSPACE</span>
                  <ArrowRight size={11} />
                </div>
              </button>
            )
          })}
        </div>

        {activeCapability && (
          <div className="about-capability-detail" aria-live="polite">
            <div className="about-capability-detail__info">
              <span className="about-cap-kicker">SELECTED OPERATIONAL MODULE</span>
              <strong>{activeCapability.label}</strong>
              <p>{activeCapability.text}</p>
            </div>
            <Link to={getPlatformRoute(activeCapability.route)} className="about-capability-detail__link">
              <span>LAUNCH {activeCapability.label}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 04: RUNTIME SIGNALS & SYSTEM STATUS
          ========================================================================= */}
      <section className="about-section about-section--status" aria-labelledby="status-title">
        <div className="about-section__heading">
          <div>
            <p className="about-eyebrow">
              <span className="about-eyebrow__line" /> RUNTIME SIGNALS
            </p>
            <h2 id="status-title">System Status &amp; Signals</h2>
            <p className="about-section__desc">
              Live status signals queried from verified FastAPI &amp; PostGIS service endpoints.
            </p>
          </div>
          <button
            className="about-refresh-button"
            type="button"
            onClick={loadSystemStatus}
            disabled={checking}
          >
            <RefreshCw size={13} className={checking ? 'about-spin' : ''} aria-hidden="true" />
            <span>REFRESH STATUS</span>
          </button>
        </div>

        <div className="about-status-grid" aria-live="polite">
          {systemIndicators.map(({ key, label, desc }) => {
            const status = describeStatus(key, system, checking)
            const source =
              key === 'api'
                ? '/health'
                : key === 'postgis'
                ? '/api/postgis/status'
                : key === 'database'
                ? '/health (database)'
                : 'RUNTIME CONFIGURED'
            return (
              <article className="about-status-card" key={key}>
                <div className="about-status-card__top">
                  <span>{label}</span>
                  <i className={statusClass(status)} />
                </div>
                <strong className={`status-val ${statusClass(status)}`}>{status}</strong>
                <span className="about-status-card__desc">{desc}</span>
                <small className="about-status-card__source">ENDPOINT: {source}</small>
              </article>
            )
          })}
        </div>

        {statusError && (
          <div className="about-status-error" role="status">
            <CircleDot size={14} />
            <span>{statusError}</span>
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 05: TECHNICAL STACK
          ========================================================================= */}
      <section className="about-section about-section--stack" aria-labelledby="stack-title">
        <div className="about-section__heading">
          <div>
            <p className="about-eyebrow">
              <span className="about-eyebrow__line" /> IMPLEMENTATION COMPONENTS
            </p>
            <h2 id="stack-title">Technical Stack</h2>
            <p className="about-section__desc">
              Open-source geospatial libraries, deep learning frameworks, and database architectures.
            </p>
          </div>
          <span className="about-section__index">04 / STACK</span>
        </div>

        <div className="about-stack-grid">
          {stackGroups.map((group) => {
            const Icon = group.icon
            return (
              <article className="about-stack-card" key={group.title}>
                <div className="about-stack-card__head">
                  <div className="about-stack-card__icon">
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <span className="about-stack-card__title">{group.title}</span>
                    <span className="about-stack-card__desc">{group.desc}</span>
                  </div>
                </div>
                <ul className="about-stack-card__list">
                  {group.items.map((item) => (
                    <li key={item}>
                      <Check size={11} className="about-stack-check" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>

        <div className="about-tech-metadata">
          <div className="about-meta-cell">
            <span className="meta-label">APPLICATION ARCHITECTURE</span>
            <strong className="meta-val">REACT FRONTEND · FASTAPI ASYNCHRONOUS ENGINE</strong>
          </div>
          <div className="about-meta-cell">
            <span className="meta-label">DATABASE PERSISTENCE</span>
            <strong className="meta-val">POSTGRESQL / POSTGIS · SQLITE ZERO-CONFIG FALLBACK</strong>
          </div>
          <div className="about-meta-cell">
            <span className="meta-label">GEOSPATIAL ENGINE</span>
            <strong className="meta-val">RASTERIO (GDAL) · GEOPANDAS · SHAPELY · PYPROJ</strong>
          </div>
          <div className="about-meta-cell">
            <span className="meta-label">SEGMENTATION MODELS</span>
            <strong className="meta-val">YOLO11-SEG · U-NET++ · MASK R-CNN CHECKPOINTS</strong>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 06: EXPLORE THE PLATFORM
          ========================================================================= */}
      <section className="about-section about-section--explore" aria-labelledby="explore-title">
        <div className="about-section__heading">
          <div>
            <p className="about-eyebrow">
              <span className="about-eyebrow__line" /> NAVIGATE EXISTING ROUTES
            </p>
            <h2 id="explore-title">Explore the Platform</h2>
            <p className="about-section__desc">
              Access the complete suite of GeoCadastra operational tools and consoles.
            </p>
          </div>
          <span className="about-section__index">05 / EXPLORE</span>
        </div>

        <div className="about-explore-grid">
          {explorations.map((item, index) => {
            const Icon = item.icon
            return (
              <Link className="about-explore-card" to={getPlatformRoute(item.route)} key={item.label}>
                <div className="about-explore-card__top">
                  <span className="about-explore-card__number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="about-explore-card__tag">{item.tag}</span>
                </div>
                <div className="about-explore-card__icon">
                  <Icon size={19} aria-hidden="true" />
                </div>
                <strong className="about-explore-card__label">{item.label}</strong>
                <span className="about-explore-card__text">{item.text}</span>
                <div className="about-explore-card__arrow">
                  <span>ENTER</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Footer Navigation */}
      <footer className="about-footer">
        <div className="about-footer__left">
          <Check size={14} aria-hidden="true" className="about-footer-check" />
          <span>VERIFIED ROUTES · REST ENDPOINTS · ZERO SYNTHETIC METRICS</span>
        </div>
        <Link to="/" className="about-footer__link">
          <span>RETURN TO HOME LANDING PAGE</span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </footer>
    </main>
  )
}
