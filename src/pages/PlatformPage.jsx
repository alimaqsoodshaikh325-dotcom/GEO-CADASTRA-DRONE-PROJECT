import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  Activity,
  ArrowRight,
  Boxes,
  BrainCircuit,
  Building2,
  Check,
  CircleDot,
  Compass,
  Cpu,
  Database,
  Eye,
  FileBarChart2,
  GitBranch,
  Globe,
  HardDrive,
  Images,
  Layers,
  Layers3,
  Map,
  MapPin,
  MapPinned,
  Radio,
  Scan,
  ScanLine,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  Workflow,
  Zap,
} from 'lucide-react'
import platformAerial from '../assets/platform-aerial.jpg'
import geoaiRobot from '../assets/geoai-robot.png'
import './PlatformPage.css'

const pipeline = [
  {
    step: '01',
    title: 'UPLOAD',
    subtitle: 'AERIAL INTAKE',
    description: 'Drone orthomosaics & high-resolution GeoTIFF intake with automated raster validation.',
    icon: Upload,
    tag: 'FASTAPI UPLOAD',
    route: '/analysis',
  },
  {
    step: '02',
    title: 'PROCESS',
    subtitle: 'COORDINATE ALIGNMENT',
    description: 'Tiling, radiometric balancing, and projection verification to EPSG:3857 / WGS84 standards.',
    icon: ScanLine,
    tag: 'RASTERIO GDAL',
    route: '/analysis',
  },
  {
    step: '03',
    title: 'DETECT',
    subtitle: 'AI SEGMENTATION',
    description: 'Deep neural network inference executing YOLO11-Seg, U-Net++, and Mask R-CNN checkpoints.',
    icon: BrainCircuit,
    tag: 'PYTORCH INFERENCE',
    route: '/models',
  },
  {
    step: '04',
    title: 'ANALYZE',
    subtitle: 'SPATIAL INTELLIGENCE',
    description: 'Cadastral parcel intersection, topological cleanup, and spatial consensus verification.',
    icon: Layers3,
    tag: 'SPATIAL CONSENSUS',
    route: '/parcels',
  },
  {
    step: '05',
    title: 'VISUALIZE',
    subtitle: 'GIS OUTPUTS',
    description: 'Coordinate-safe Leaflet mapping, human review sign-off, and GeoJSON report exports.',
    icon: MapPinned,
    tag: 'POSTGIS & REPORTS',
    route: '/results',
  },
]

const coreBlocks = [
  {
    id: 'extraction',
    title: 'AI BUILDING EXTRACTION',
    eyebrow: 'NEURAL SEGMENTATION',
    description:
      'Automatically detect, delineate, and segment built-environment structures from drone imagery with model-driven polygon footprint extraction.',
    icon: Building2,
    route: '/models',
    action: 'EXPLORE MODELS',
    specs: [
      { label: 'MODELS', value: 'YOLO11-Seg · U-Net++ · Mask R-CNN' },
      { label: 'OUTPUT', value: 'Vectorized GeoJSON Polygons' },
      { label: 'BENCHMARK', value: 'Tile 8 Held-out Test Provenance' },
    ],
  },
  {
    id: 'gis',
    title: 'GIS PROCESSING & VALIDATION',
    eyebrow: 'SPATIAL TRANSFORMATION',
    description:
      'Convert raw aerial raster feeds into structured, georeferenced GIS vector datasets with geometric polygon simplification and coordinate accuracy.',
    icon: Compass,
    route: '/results',
    action: 'INSPECT RESULTS',
    specs: [
      { label: 'ENGINE', value: 'GeoPandas · Shapely · PyProj' },
      { label: 'PROJECTION', value: 'EPSG:3857 / WGS84 Coordinate Grid' },
      { label: 'PERSISTENCE', value: 'PostGIS / PostgreSQL Spatial Index' },
    ],
  },
  {
    id: 'parcels',
    title: 'PARCEL INTELLIGENCE & CONSENSUS',
    eyebrow: 'CADASTRAL TOPOLOGY',
    description:
      'Intersect extracted building footprints with cadastral parcel boundaries to compute coverage density, spatial consensus, and survey deviations.',
    icon: Globe,
    route: '/parcels',
    action: 'VIEW PARCELS',
    specs: [
      { label: 'TOPOLOGY', value: 'Parcel Boundary Intersect & Area Coverage' },
      { label: 'REVIEW', value: 'Human-in-the-loop Validation Queue' },
      { label: 'REPORTS', value: 'Comprehensive GeoJSON & Audit Summaries' },
    ],
  },
]

const pipelineBadges = [
  { label: 'AERIAL IMAGE', icon: Images, type: 'input' },
  { label: 'FASTAPI INGESTION', icon: Server, type: 'pipeline' },
  { label: 'AI MODEL INFERENCE', icon: BrainCircuit, type: 'ml' },
  { label: 'OBJECT DETECTION', icon: Building2, type: 'ml' },
  { label: 'SPATIAL CONSENSUS', icon: GitBranch, type: 'gis' },
  { label: 'POSTGIS ENGINE', icon: Database, type: 'storage' },
  { label: 'MAP & SURVEY REPORTS', icon: FileBarChart2, type: 'output' },
]

export default function PlatformPage() {
  const { isAuthenticated } = useAuth()
  const [activeTab, setActiveTab] = useState(0)

  const getPlatformRoute = (target) => {
    return isAuthenticated ? target : '/login'
  }

  return (
    <div className="platform-page">
      {/* Background Layer with subtle real drone image overlay */}
      <div className="platform-bg-backdrop" aria-hidden="true">
        <img src={platformAerial} alt="" className="platform-bg-image" />
        <div className="platform-bg-grid" />
        <div className="platform-bg-vignette" />
      </div>

      {/* Top Breadcrumb / HUD Metadata Bar */}
      <div className="platform-topline-hud">
        <div className="platform-topline-left">
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#ffffff', textDecoration: 'none', fontWeight: 800, letterSpacing: '0.08em', marginRight: 12 }}>
            <Boxes size={14} style={{ color: '#00f0ff' }} />
            <span>GEOCADASTRA</span>
          </Link>
          <span className="platform-pulse-beacon" />
          <span className="platform-topline-tag">GEOCADASTRA OPERATOR CONSOLE</span>
          <span className="platform-topline-divider">/</span>
          <span className="platform-topline-sub">PLATFORM ARCHITECTURE</span>
        </div>
        <div className="platform-topline-right">
          <Link to="/" style={{ color: '#00f0ff', textDecoration: 'none', fontSize: '11px', fontWeight: 700, marginRight: 14 }}>
            ← RETURN TO HOME
          </Link>
          <span className="platform-hud-metric">
            <Radio size={12} className="platform-pulse-icon" /> AI SPATIAL ENGINE ACTIVE
          </span>
          <span className="platform-hud-metric">
            <Scan size={12} /> EPSG:3857 · WGS84
          </span>
        </div>
      </div>

      {/* =========================================================================
          HERO COMMAND CENTER SECTION
          ========================================================================= */}
      <header className="platform-hero-card">
        <div className="platform-hero-content">
          <div className="platform-eyebrow">
            <span className="platform-eyebrow-line" />
            <span>PLATFORM COMMAND CENTER</span>
          </div>

          <h1 className="platform-hero-title">
            THE GEOCADASTRA <span className="platform-title-cyan">PLATFORM</span>
          </h1>

          <p className="platform-hero-lede">
            From aerial drone imagery to actionable spatial intelligence.
          </p>

          <p className="platform-hero-description">
            A high-throughput enterprise geospatial engineering platform connecting drone orthomosaics,
            deep-learning segmentation neural networks, automated cadastral parcel validation, and
            spatial consensus pipelines across the complete GeoCadastra product surface.
          </p>

          {/* Quick HUD Metrics Bar */}
          <div className="platform-hero-metrics-grid">
            <div className="platform-metric-cell">
              <span className="platform-metric-label">PIPELINE WORKFLOW</span>
              <strong className="platform-metric-val">05 AUTOMATED STAGES</strong>
              <small>Upload to Cadastral Export</small>
            </div>
            <div className="platform-metric-cell">
              <span className="platform-metric-label">MODEL ARCHITECTURES</span>
              <strong className="platform-metric-val tone-cyan">YOLO11 · U-NET++ · MASK R-CNN</strong>
              <small>High-Precision Segmentation</small>
            </div>
            <div className="platform-metric-cell">
              <span className="platform-metric-label">SPATIAL DATABASE</span>
              <strong className="platform-metric-val">POSTGIS / POSTGRESQL</strong>
              <small>Indexed Vector Persistence</small>
            </div>
          </div>

          {/* Hero Actions */}
          <div className="platform-hero-actions">
            <Link to={getPlatformRoute('/analysis')} className="platform-btn platform-btn--primary">
              <Zap size={14} /> START ANALYSIS
            </Link>
            <Link to={getPlatformRoute('/map')} className="platform-btn platform-btn--secondary">
              <MapPinned size={14} /> OPEN MAP EXPLORER
            </Link>
            <Link to="/about" className="platform-btn platform-btn--ghost">
              <Terminal size={14} /> SYSTEM ARCHITECTURE
            </Link>
          </div>
        </div>

        {/* Tactical Robot / Core Visual Box */}
        <div className="platform-hero-visual" aria-hidden="true">
          <div className="platform-radar-ring" />
          <div className="platform-radar-crosshair" />
          <img src={geoaiRobot} alt="GeoCadastra Core AI" className="platform-robot-img" />
          <div className="platform-visual-hud-tag">
            <span>AI SPATIAL CORE</span>
            <small>VERIFIED INFERENCE</small>
          </div>
        </div>
      </header>

      {/* =========================================================================
          SECTION 01: FROM PIXELS TO PARCELS (PIPELINE WORKFLOW)
          ========================================================================= */}
      <section className="platform-section" id="pipeline">
        <div className="platform-section-header">
          <div>
            <p className="platform-eyebrow">
              <span className="platform-eyebrow-line" /> FROM PIXELS TO PARCELS
            </p>
            <h2 className="platform-section-title">AI-Powered Spatial Workflow</h2>
            <p className="platform-section-subtitle">
              End-to-end dataflow transforming raw drone orthomosaics into verified cadastral intelligence.
            </p>
          </div>
          <span className="platform-section-index">01 / PIPELINE</span>
        </div>

        {/* 5-Stage Connected Pipeline Grid */}
        <div className="platform-pipeline-grid">
          {pipeline.map((item, index) => {
            const Icon = item.icon
            return (
              <div className="platform-stage-wrapper" key={item.step}>
                <article className="platform-stage-card">
                  <div className="platform-stage-top">
                    <span className="platform-stage-number">{item.step}</span>
                    <div className="platform-stage-icon-box">
                      <Icon size={18} aria-hidden="true" />
                    </div>
                  </div>

                  <span className="platform-stage-sub">{item.subtitle}</span>
                  <h3 className="platform-stage-title">{item.title}</h3>
                  <p className="platform-stage-desc">{item.description}</p>

                  <div className="platform-stage-foot">
                    <span className="platform-stage-tag">{item.tag}</span>
                    <Link to={item.route} className="platform-stage-link" title={`Go to ${item.title}`}>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </article>

                {/* Animated Data-flow Connector Arrow */}
                {index < pipeline.length - 1 && (
                  <div className="platform-pipeline-connector" aria-hidden="true">
                    <div className="platform-connector-line" />
                    <div className="platform-connector-packet" />
                    <ArrowRight size={14} className="platform-connector-arrow" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* =========================================================================
          SECTION 02: ONE PLATFORM / COMPLETE SPATIAL INTELLIGENCE
          ========================================================================= */}
      <section className="platform-section" id="capabilities">
        <div className="platform-section-header">
          <div>
            <p className="platform-eyebrow">
              <span className="platform-eyebrow-line" /> ONE PLATFORM · THREE CORE ENGINES
            </p>
            <h2 className="platform-section-title">Complete Spatial Intelligence Architecture</h2>
            <p className="platform-section-subtitle">
              Unified machine learning, spatial calculation, and cadastral reconciliation capabilities.
            </p>
          </div>
          <span className="platform-section-index">02 / CORE ENGINES</span>
        </div>

        <div className="platform-core-grid">
          {coreBlocks.map((block) => {
            const Icon = block.icon
            return (
              <article className="platform-core-card" key={block.id}>
                <div className="platform-core-card-head">
                  <div className="platform-core-icon-box">
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <span className="platform-core-kicker">{block.eyebrow}</span>
                    <h3 className="platform-core-title">{block.title}</h3>
                  </div>
                </div>

                <p className="platform-core-desc">{block.description}</p>

                <div className="platform-core-specs-list">
                  {block.specs.map((spec) => (
                    <div className="platform-core-spec-row" key={spec.label}>
                      <span className="platform-spec-label">{spec.label}</span>
                      <strong className="platform-spec-val">{spec.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="platform-core-card-foot">
                  <Link to={block.route} className="platform-btn platform-btn--secondary platform-btn--sm">
                    <span>{block.action}</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* =========================================================================
          SECTION 03: VISUAL DATA PIPELINE
          ========================================================================= */}
      <section className="platform-section" id="visual-pipeline">
        <div className="platform-section-header">
          <div>
            <p className="platform-eyebrow">
              <span className="platform-eyebrow-line" /> VISUAL PIPELINE FLOW
            </p>
            <h2 className="platform-section-title">From Imagery to Intelligence</h2>
            <p className="platform-section-subtitle">
              Systematic data pipeline connecting input aerial sensors to final spatial survey deliverables.
            </p>
          </div>
          <span className="platform-section-index">03 / DATAFLOW</span>
        </div>

        <div className="platform-dataflow-panel">
          <div className="platform-dataflow-stream">
            {pipelineBadges.map((badge, idx) => {
              const Icon = badge.icon
              return (
                <div className="platform-dataflow-node" key={badge.label}>
                  <div className={`platform-node-pill type-${badge.type}`}>
                    <Icon size={14} className="platform-node-icon" />
                    <span>{badge.label}</span>
                  </div>
                  {idx < pipelineBadges.length - 1 && (
                    <div className="platform-node-connector" aria-hidden="true">
                      <span className="connector-dot" />
                      <ArrowRight size={12} className="connector-arrow" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="platform-dataflow-footer">
            <div className="dataflow-meta-item">
              <Check size={13} className="tone-cyan" />
              <span>STRICT ZERO-FABRICATION VERIFIED BACKEND INTEGRATION</span>
            </div>
            <div className="dataflow-meta-item">
              <Server size={13} />
              <span>ASYNCHRONOUS PIPELINE INFERENCE WITH RECOVERY RESILIENCE</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 04: TURN IMAGERY INTO ACTION (HERO CTA BANNER)
          ========================================================================= */}
      <section className="platform-cta-card">
        <div className="platform-cta-backdrop" aria-hidden="true">
          <img src={platformAerial} alt="" className="platform-cta-img" />
          <div className="platform-cta-overlay" />
          <div className="platform-cta-scanlines" />
        </div>

        <div className="platform-cta-body">
          <div className="platform-eyebrow">
            <span className="platform-eyebrow-line" />
            <span>READY TO INGEST &amp; PROCESS</span>
          </div>
          <h2 className="platform-cta-heading">Turn Imagery into Action.</h2>
          <p className="platform-cta-copy">
            Deploy automated building footprint extraction, cross-reference cadastral parcel boundaries,
            and inspect high-accuracy spatial consensus records in one unified workspace.
          </p>

          <div className="platform-cta-actions">
            <Link to="/analysis" className="platform-btn platform-btn--primary">
              <Zap size={15} /> START NEW ANALYSIS
            </Link>
            <Link to="/map" className="platform-btn platform-btn--secondary">
              <Map size={15} /> OPEN MAP EXPLORER
            </Link>
            <Link to="/datasets" className="platform-btn platform-btn--ghost">
              <HardDrive size={15} /> VIEW DATASETS
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
