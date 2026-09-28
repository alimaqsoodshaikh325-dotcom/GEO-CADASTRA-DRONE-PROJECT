import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  GitBranch,
  Globe2,
  Layers,
  Layers3,
  Lock,
  Map as MapIcon,
  Maximize2,
  Menu,
  Radio,
  RotateCw,
  Rss,
  Scale,
  Scan,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  SplitSquareHorizontal,
  Workflow,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import platformAerialImg from '../assets/platform-aerial.jpg'
import heroDatasetImg from '../assets/hero-dataset-tile8.jpg'
import heroSurveyDroneImg from '../assets/hero-survey-drone.png'

export default function Home() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const analysisRoute = isAuthenticated ? '/analysis' : '/login'
  const [health, setHealth] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mapMode, setMapMode] = useState('2d') // '2d' | '3d'
  const [activeLayers, setActiveLayers] = useState({
    satellite: true,
    parcels: true,
    buildings: true,
    roads: true,
    gnss: true,
    conflicts: true
  })
  const [mapSearch, setMapSearch] = useState('')
  const [selectedFeature, setSelectedFeature] = useState({
    id: 'GD-DEMO-1042',
    name: 'Parcel P-1027 (Sector 07)',
    structures: '4 AI Extracted',
    landUse: 'Light Industrial / Logistics',
    bcr: '41.0%',
    confidence: '98.2%'
  })
  const [isolated, setIsolated] = useState(false)
  const [sliderPos, setSliderPos] = useState(50)
  const [isDraggingSlider, setIsDraggingSlider] = useState(false)
  const [activePipelineStep, setActivePipelineStep] = useState(1) // Stage 02 is index 1
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 })
  const [hoveredParcel, setHoveredParcel] = useState(null)
  const [hoveredBuilding, setHoveredBuilding] = useState(null)
  const [hoveredConflict, setHoveredConflict] = useState(false)
  const [searchNoResult, setSearchNoResult] = useState(false)
  const [focusedParcel, setFocusedParcel] = useState(null) // transient — for pulse animation

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.05 }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: [0.25, 0.8, 0.25, 1] }
    }
  }

  useEffect(() => {
    let active = true
    api.getHealth()
      .then((data) => {
        if (active) setHealth(data?.status === 'healthy' || Boolean(data))
      })
      .catch(() => {
        if (active) setHealth(true) // graceful fallback to ready in demo
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleHeroMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6
    setHeroTilt({ x, y })
  }

  const handleHeroMouseLeave = () => {
    setHeroTilt({ x: 0, y: 0 })
  }

  useEffect(() => {
    const q = mapSearch.trim().toLowerCase()
    if (!q) {
      setSearchNoResult(false)
      return
    }
    let matched = null
    if (q.includes('1027') || q.includes('ind')) {
      matched = {
        id: 'P-1027',
        name: 'Parcel P-1027 (Industrial)',
        structures: '4 AI Extracted',
        landUse: 'Light Industrial / Logistics',
        bcr: '41.0%',
        confidence: '98.2%'
      }
    } else if (q.includes('1028') || q.includes('com')) {
      matched = {
        id: 'P-1028',
        name: 'Parcel P-1028 (Commercial)',
        structures: '2 AI Extracted',
        landUse: 'Commercial Mixed-Use',
        bcr: '30.7%',
        confidence: '94.8%'
      }
    } else if (q.includes('1029') || q.includes('res')) {
      matched = {
        id: 'P-1029',
        name: 'Parcel P-1029 (Residential)',
        structures: '1 AI Extracted',
        landUse: 'Residential Urban Low-Rise',
        bcr: '15.1%',
        confidence: '95.1%'
      }
    }
    if (matched) {
      setSearchNoResult(false)
      setSelectedFeature(matched)
      setFocusedParcel(matched.id)
      setTimeout(() => setFocusedParcel(null), 900)
    } else {
      setSearchNoResult(true)
    }
  }, [mapSearch])

  const toggleLayer = (key) => {
    setActiveLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSliderMove = (e) => {
    if (!isDraggingSlider && e.type !== 'click') return
    const container = e.currentTarget.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const offset = clientX - container.left
    const percent = Math.min(Math.max((offset / container.width) * 100, 5), 95)
    setSliderPos(percent)
  }

  // 6 Stage platform cards data
  const stages = [
    {
      num: 'CARD 01',
      title: 'UAV / SATELLITE DATA',
      tag: 'INPUT STAGE',
      desc: 'Ingests sub-5cm UAV orthomosaics, satellite multispectral imagery, and photogrammetric rasters with strict coordinate safety.',
      footer: 'Rasterio • GDAL • Dynamic Affine'
    },
    {
      num: 'CARD 02',
      title: 'DATA FUSION',
      tag: 'FUSION STAGE',
      desc: 'Merges DSM/DTM elevation layers, point clouds, and historical GIS vectors into a unified geodetic tensor.',
      footer: 'PDAL • PyProj • Local UTM 32XX'
    },
    {
      num: 'CARD 03',
      title: 'AI EXTRACTION',
      tag: 'INFERENCE STAGE',
      desc: 'Runs sliding-window neural inference across deep skip-connection architectures to identify rooflines and boundaries.',
      footer: 'U-Net++ • YOLO11-Seg • Mask R-CNN'
    },
    {
      num: 'CARD 04',
      title: 'SPATIAL ANALYSIS',
      tag: 'ANALYSIS STAGE',
      desc: 'Performs polygon geometry validation, setback buffer calculation, and building coverage ratio (BCR) computing.',
      footer: 'Shapely • GeoPandas • Spatial Index'
    },
    {
      num: 'CARD 05',
      title: 'CONFIDENCE SCORING',
      tag: 'CONSENSUS STAGE',
      desc: 'Evaluates multi-model agreement, geometric regularity, boundary sharpness, and spatial consensus matrices.',
      footer: 'Consensus Engine • Encroachment Matrix'
    },
    {
      num: 'CARD 06',
      title: 'FIELD VERIFICATION',
      tag: 'OUTPUT STAGE',
      desc: 'Exports surveyor-ready audit queues, conflict alerts, and authoritative PostGIS layers for institutional cadastre.',
      footer: 'PostGIS • OGC WFS • GeoJSON Export'
    }
  ]

  // 8 CV Modules
  const modules = [
    {
      idx: '01',
      title: 'PARCEL BOUNDARY EXTRACTION',
      input: 'UAV Orthomosaic + Cadastre Line',
      process: 'Edge-guided CNN contour refinement',
      output: 'Sub-metre cadastral boundaries'
    },
    {
      idx: '02',
      title: 'BUILDING DETECTION',
      input: 'High-res RGB photogrammetry',
      process: 'U-Net++ dense skip segmentation',
      output: 'Roofline footprints & area (m²)'
    },
    {
      idx: '03',
      title: 'ROAD & PATHWAY EXTRACTION',
      input: 'Aerial surface raster',
      process: 'Directional centerline tracing',
      output: 'Topologically connected road network'
    },
    {
      idx: '04',
      title: 'LAND-USE CLASSIFICATION',
      input: 'Multispectral & RGB tiles',
      process: 'Spectral index & texture analysis',
      output: 'Zone classifications (Res/Com/Ind)'
    },
    {
      idx: '05',
      title: 'ENCROACHMENT DETECTION',
      input: 'Building vector + Parcel polygon',
      process: 'Spatial overlay & setback calculus',
      output: 'Boundary crossing & violation flags'
    },
    {
      idx: '06',
      title: 'CHANGE DETECTION',
      input: 'Multi-temporal UAV flights',
      process: 'Siamese feature differential',
      output: 'Unauthorized structural additions'
    },
    {
      idx: '07',
      title: 'TOPOLOGY GUARDIAN',
      input: 'Vector layer feature collection',
      process: 'Shapely buffer(0) & overlap audits',
      output: 'Zero sliver / gap / self-intersection'
    },
    {
      idx: '08',
      title: 'EXPLAINABLE AI',
      input: 'Neural activation heatmaps',
      process: 'Gradient-weighted class activation',
      output: 'Feature attribution & audit trail'
    }
  ]

  // 5 Pipeline nodes with rich interactive telemetry
  const pipelineNodes = [
    {
      num: '01',
      title: 'UAV IMAGERY',
      sub: 'Raw Aerial Observation',
      tag: 'GSD < 2.4 CM/PX',
      stageName: 'STAGE 01',
      heading: 'UAV IMAGERY — Raw Aerial Observation',
      desc: 'Sub-5cm raw aerial drone photography and photogrammetric orthomosaics ingested with strict spatial coordinate validation.',
      metricLabel: 'RESOLUTION GSD',
      metricVal: '< 2.4 CM/PX'
    },
    {
      num: '02',
      title: 'AI PERCEPTION',
      sub: 'Structures Detected',
      tag: '96.4% CONFIDENCE',
      stageName: 'STAGE 02',
      heading: 'AI PERCEPTION — Structures Detected',
      desc: 'Deep U-Net++ and YOLO11-Seg sliding-window inference segmenting complex roofline geometries.',
      metricLabel: 'VALIDATION METRIC',
      metricVal: '96.4% CONFIDENCE'
    },
    {
      num: '03',
      title: 'VECTOR GEOMETRY',
      sub: 'Pixels → Polygons',
      tag: 'ZERO ANGLE DISTORTION',
      stageName: 'STAGE 03',
      heading: 'VECTOR GEOMETRY — Pixels → Polygons',
      desc: 'Automated contour vectorization converting neural pixel masks into clean, closed vector polygon topologies.',
      metricLabel: 'GEOMETRIC PRECISION',
      metricVal: 'ZERO DISTORTION'
    },
    {
      num: '04',
      title: 'SPATIAL VALIDATION',
      sub: 'Parcel Relationships',
      tag: 'EPSG:32643 METRIC UTM',
      stageName: 'STAGE 04',
      heading: 'SPATIAL VALIDATION — Parcel Relationships',
      desc: 'OGC Simple Features topological healing with Douglas-Peucker & Shapely buffer(0) algorithms.',
      metricLabel: 'COORDINATE SYSTEM',
      metricVal: 'EPSG:32643 METRIC UTM'
    },
    {
      num: '05',
      title: 'CADASTRAL INTELLIGENCE',
      sub: 'Actionable Insights',
      tag: 'POSTGIS PERSISTED',
      stageName: 'STAGE 05',
      heading: 'CADASTRAL INTELLIGENCE — Actionable Insights',
      desc: 'Direct synchronization with PostGIS spatial database, generating surveyor-ready audit logs and conflict reports.',
      metricLabel: 'STORAGE ENGINE',
      metricVal: 'POSTGIS PERSISTED'
    }
  ]

  return (
    <div className="landing-page geo-landing-root" style={{ background: '#030712', color: '#f8fafc', overflowX: 'hidden', position: 'relative' }}>
      
      {/* ========================================================
          GLOBAL REALISTIC GEOSPATIAL DATASET ATMOSPHERE
          ======================================================== */}
      <div className="geo-bg-dataset-wrap" aria-hidden="true">
        {/* Layer 1: Real Drone / UAV Orthomosaic Imagery */}
        <div
          className="geo-bg-aerial-layer"
          style={{ backgroundImage: `url(${platformAerialImg})` }}
        />

        {/* Layer 2: Vector Geospatial GIS Dataset Simulation (Cadastral Polygons & Grid) */}
        <svg className="geo-bg-vector-layer" viewBox="0 0 1600 1200" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="bgMajorGrid" width="120" height="120" patternUnits="userSpaceOnUse">
              <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(0, 240, 255, 0.04)" strokeWidth="1" />
              <path d="M 0 60 L 120 60 M 60 0 L 60 120" fill="none" stroke="rgba(148, 163, 184, 0.015)" strokeWidth="0.5" strokeDasharray="2 4" />
              <circle cx="0" cy="0" r="1.5" fill="rgba(0, 240, 255, 0.15)" />
              <circle cx="120" cy="0" r="1.5" fill="rgba(0, 240, 255, 0.15)" />
              <circle cx="0" cy="120" r="1.5" fill="rgba(0, 240, 255, 0.15)" />
              <circle cx="120" cy="120" r="1.5" fill="rgba(0, 240, 255, 0.15)" />
            </pattern>
            <pattern id="bgMinorGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(148, 163, 184, 0.012)" strokeWidth="0.5" />
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill="url(#bgMajorGrid)" />
          <rect width="100%" height="100%" fill="url(#bgMinorGrid)" />

          {/* Cadastral Parcel Polygons with Laser-Etched Styling */}
          <polygon points="100,120 480,160 440,520 80,480" fill="rgba(0, 240, 255, 0.018)" stroke="rgba(0, 240, 255, 0.12)" strokeWidth="1" strokeDasharray="6 4" />
          <polygon points="480,160 920,180 880,560 440,520" fill="rgba(0, 240, 255, 0.012)" stroke="rgba(0, 240, 255, 0.09)" strokeWidth="1" strokeDasharray="6 4" />
          <polygon points="920,180 1480,220 1420,620 880,560" fill="rgba(14, 165, 233, 0.018)" stroke="rgba(14, 165, 233, 0.1)" strokeWidth="1" strokeDasharray="6 4" />
          <polygon points="80,480 440,520 410,920 60,860" fill="rgba(16, 185, 129, 0.015)" stroke="rgba(16, 185, 129, 0.1)" strokeWidth="1" />
          <polygon points="440,520 880,560 840,980 410,920" fill="rgba(0, 240, 255, 0.018)" stroke="rgba(0, 240, 255, 0.1)" strokeWidth="1" strokeDasharray="6 4" />
          <polygon points="880,560 1420,620 1370,1060 840,980" fill="rgba(56, 189, 248, 0.015)" stroke="rgba(56, 189, 248, 0.09)" strokeWidth="1" />

          {/* Building Footprint Polygons with Corner Vertex Nodes */}
          <polygon points="180,220 320,230 310,340 170,330" fill="rgba(0, 240, 255, 0.045)" stroke="rgba(0, 240, 255, 0.16)" strokeWidth="1" />
          <polygon points="540,240 700,250 680,390 520,380" fill="rgba(0, 240, 255, 0.045)" stroke="rgba(0, 240, 255, 0.16)" strokeWidth="1" />
          <polygon points="1020,280 1240,300 1210,460 990,440" fill="rgba(0, 240, 255, 0.04)" stroke="rgba(0, 240, 255, 0.14)" strokeWidth="1" />
          <polygon points="160,580 320,590 300,720 140,710" fill="rgba(16, 185, 129, 0.045)" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="1" />
          <polygon points="520,620 720,640 690,800 490,780" fill="rgba(0, 240, 255, 0.045)" stroke="rgba(0, 240, 255, 0.15)" strokeWidth="1" />

          {/* Survey Ground Control Points */}
          <circle cx="100" cy="120" r="3" fill="#00f0ff" opacity="0.35" />
          <circle cx="480" cy="160" r="3" fill="#00f0ff" opacity="0.35" />
          <circle cx="920" cy="180" r="3" fill="#00f0ff" opacity="0.35" />
          <circle cx="440" cy="520" r="3" fill="#00f0ff" opacity="0.35" />
          <circle cx="880" cy="560" r="3" fill="#00f0ff" opacity="0.35" />
          <circle cx="410" cy="920" r="3" fill="#10b981" opacity="0.35" />

          {/* Road Arterials & Survey Centerlines */}
          <path d="M 0,500 Q 500,470 1000,540 T 1600,510" fill="none" stroke="rgba(148, 163, 184, 0.07)" strokeWidth="16" />
          <path d="M 0,500 Q 500,470 1000,540 T 1600,510" fill="none" stroke="rgba(0, 240, 255, 0.14)" strokeWidth="1" strokeDasharray="8 8" />
          <path d="M 680,0 L 660,1200" fill="none" stroke="rgba(148, 163, 184, 0.06)" strokeWidth="12" />
          <path d="M 680,0 L 660,1200" fill="none" stroke="rgba(0, 240, 255, 0.1)" strokeWidth="1" strokeDasharray="6 6" />

          {/* Background Concentric Radar Circle Sweep */}
          <g transform="translate(1200, 300)" opacity="0.25">
            <circle cx="0" cy="0" r="180" fill="none" stroke="rgba(0, 240, 255, 0.2)" strokeWidth="1" strokeDasharray="4 6" />
            <circle cx="0" cy="0" r="120" fill="none" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1" />
            <circle cx="0" cy="0" r="60" fill="none" stroke="rgba(0, 240, 255, 0.3)" strokeWidth="1" strokeDasharray="2 4" />
            <circle cx="0" cy="0" r="3" fill="#00f0ff" />
            <line x1="-200" y1="0" x2="200" y2="0" stroke="rgba(0, 240, 255, 0.15)" strokeWidth="1" />
            <line x1="0" y1="-200" x2="0" y2="200" stroke="rgba(0, 240, 255, 0.15)" strokeWidth="1" />
          </g>

          {/* Coordinate Reference Markers */}
          <text x="30" y="50" fill="rgba(0, 240, 255, 0.22)" fontSize="9" fontFamily="monospace">18°31'13.4"N 73°51'24.1"E</text>
          <text x="1450" y="50" fill="rgba(0, 240, 255, 0.22)" fontSize="9" fontFamily="monospace">CRS: EPSG:32643</text>
          <text x="30" y="1170" fill="rgba(148, 163, 184, 0.2)" fontSize="9" fontFamily="monospace">UAV GSD 2.4CM/PX</text>
          <text x="1450" y="1170" fill="rgba(148, 163, 184, 0.2)" fontSize="9" fontFamily="monospace">ZONE 43N UTM</text>
        </svg>

        {/* Layer 3: Animated Background Scanning Laser */}
        <div className="geo-bg-laser-line" />

        {/* Layer 4: Atmospheric Vignettes & Readability Masks */}
        <div className="geo-bg-gradient-overlay" />
        <div className="geo-bg-radial-glow" />
      </div>

      {/* ========================================================
          1 & 2. FIXED TOP NAVIGATION
          ======================================================== */}
      <header className={`geo-nav-fixed ${scrolled ? 'scrolled' : ''}`}>
        <div className="geo-nav-inner">
          <Link to="/" className="geo-brand" aria-label="GeoCadastra home">
            <div className="geo-brand-icon">
              <Boxes size={18} />
            </div>
            <div className="geo-brand-text">
              <span className="geo-brand-name">GEOCADASTRA</span>
            </div>
          </Link>

          <nav className="geo-nav-links" aria-label="Main navigation">
            <a href="#platform" className="geo-nav-link">PLATFORM</a>
            <NavLink to={analysisRoute} className={({ isActive }) => (isActive ? 'geo-nav-link active' : 'geo-nav-link')}>
              ANALYSIS
            </NavLink>
            <a href="#map-explorer" className="geo-nav-link">MAP</a>
            <a href="#models" className="geo-nav-link">MODELS</a>
            <NavLink to="/about" className={({ isActive }) => (isActive ? 'geo-nav-link active' : 'geo-nav-link')}>
              ABOUT
            </NavLink>
            <NavLink to="/login" className={({ isActive }) => (isActive ? 'geo-nav-link active' : 'geo-nav-link')}>
              LOGIN
            </NavLink>
            <NavLink to="/register" className={({ isActive }) => (isActive ? 'geo-nav-link active' : 'geo-nav-link')}>
              REGISTER
            </NavLink>
          </nav>

          <div className="geo-nav-actions">
            <div className="geo-status-pill" title="PostgreSQL 16 + PostGIS Spatial Engine">
              <span className="geo-dot-pulse" />
              <span>POSTGIS READY</span>
            </div>

            <button
              type="button"
              className="geo-btn-primary"
              onClick={() => navigate(analysisRoute)}
            >
              START ANALYSIS
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="geo-nav-mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="geo-nav-mobile-dropdown">
            <a href="#platform" className="geo-nav-mobile-link" onClick={() => setMobileMenuOpen(false)}>PLATFORM</a>
            <NavLink to={analysisRoute} className="geo-nav-mobile-link" onClick={() => setMobileMenuOpen(false)}>ANALYSIS</NavLink>
            <a href="#map-explorer" className="geo-nav-mobile-link" onClick={() => setMobileMenuOpen(false)}>MAP</a>
            <a href="#models" className="geo-nav-mobile-link" onClick={() => setMobileMenuOpen(false)}>MODELS</a>
            <NavLink to="/about" className="geo-nav-mobile-link" onClick={() => setMobileMenuOpen(false)}>ABOUT</NavLink>
            <NavLink to="/login" className="geo-nav-mobile-link" onClick={() => setMobileMenuOpen(false)}>LOGIN</NavLink>
            <NavLink to="/register" className="geo-nav-mobile-link" onClick={() => setMobileMenuOpen(false)}>REGISTER</NavLink>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="geo-status-pill" style={{ width: 'fit-content' }}>
                <span className="geo-dot-pulse" />
                <span>POSTGIS READY</span>
              </div>
              <button
                type="button"
                className="geo-btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setMobileMenuOpen(false); navigate(analysisRoute); }}
              >
                START ANALYSIS
              </button>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* ========================================================
            3. LANDING HERO SECTION
            ======================================================== */}
        <section className="geo-hero-section" id="hero">
          {/* Layered Real Dataset Geospatial Hero Atmosphere */}
          <div className="geo-hero-dataset-backdrop" aria-hidden="true">
            {/* Layer 1: Real UAV / Aerial Dataset Image */}
            <div
              className="geo-hero-dataset-image"
              style={{
                backgroundImage: `url(${heroDatasetImg})`,
                transform: `scale(1.06) translate(${heroTilt.x * -0.6}px, ${heroTilt.y * -0.6}px)`,
              }}
            />

            {/* Layer 2: Translucent Dark Navy Color Grading Overlay */}
            <div className="geo-hero-dataset-navy-grade" />

            {/* Layer 3: Cinematic Multi-Stop Radial Vignette & Edge Fades */}
            <div className="geo-hero-dataset-vignette" />

            {/* Layer 4: Subtle Geospatial Grid & Measurement Crosshairs */}
            <svg className="geo-hero-dataset-grid-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="heroGeoMajorGrid" width="100" height="100" patternUnits="userSpaceOnUse">
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(0, 240, 255, 0.07)" strokeWidth="1" />
                  <path d="M 0 50 L 100 50 M 50 0 L 50 100" fill="none" stroke="rgba(148, 163, 184, 0.025)" strokeWidth="0.5" strokeDasharray="3 3" />
                  <circle cx="0" cy="0" r="2" fill="rgba(0, 240, 255, 0.3)" />
                  <circle cx="100" cy="0" r="2" fill="rgba(0, 240, 255, 0.3)" />
                  <circle cx="0" cy="100" r="2" fill="rgba(0, 240, 255, 0.3)" />
                  <circle cx="100" cy="100" r="2" fill="rgba(0, 240, 255, 0.3)" />
                </pattern>
                <pattern id="heroGeoMinorGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0, 240, 255, 0.025)" strokeWidth="0.5" />
                </pattern>
              </defs>

              <rect width="100%" height="100%" fill="url(#heroGeoMajorGrid)" />
              <rect width="100%" height="100%" fill="url(#heroGeoMinorGrid)" />

              {/* Faint Cadastral Boundaries in Hero Background */}
              <polygon points="60,100 420,130 390,480 40,440" fill="rgba(0, 240, 255, 0.03)" stroke="rgba(0, 240, 255, 0.18)" strokeWidth="1.2" strokeDasharray="6 3" />
              <polygon points="420,130 840,150 810,520 390,480" fill="rgba(0, 240, 255, 0.02)" stroke="rgba(0, 240, 255, 0.14)" strokeWidth="1.2" strokeDasharray="6 3" />
              <polygon points="840,150 1480,180 1440,580 810,520" fill="rgba(14, 165, 233, 0.03)" stroke="rgba(14, 165, 233, 0.16)" strokeWidth="1.2" strokeDasharray="6 3" />
              <polygon points="40,440 390,480 360,840 20,800" fill="rgba(16, 185, 129, 0.025)" stroke="rgba(16, 185, 129, 0.16)" strokeWidth="1.2" />
              <polygon points="390,480 810,520 780,880 360,840" fill="rgba(0, 240, 255, 0.03)" stroke="rgba(0, 240, 255, 0.16)" strokeWidth="1.2" strokeDasharray="6 3" />

              {/* Building Outlines */}
              <polygon points="120,180 260,190 250,300 110,290" fill="rgba(0, 240, 255, 0.07)" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1.2" />
              <polygon points="480,200 640,210 620,350 460,340" fill="rgba(0, 240, 255, 0.07)" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1.2" />
              <polygon points="980,220 1180,240 1150,400 950,380" fill="rgba(0, 240, 255, 0.06)" stroke="rgba(0, 240, 255, 0.2)" strokeWidth="1.2" />
              <polygon points="100,540 260,550 240,680 80,670" fill="rgba(16, 185, 129, 0.07)" stroke="rgba(16, 185, 129, 0.22)" strokeWidth="1.2" />

              {/* Node Points / Corner Crosshairs */}
              <circle cx="60" cy="100" r="3.5" fill="#00f0ff" opacity="0.5" />
              <circle cx="420" cy="130" r="3.5" fill="#00f0ff" opacity="0.5" />
              <circle cx="840" cy="150" r="3.5" fill="#00f0ff" opacity="0.5" />
              <circle cx="390" cy="480" r="3.5" fill="#00f0ff" opacity="0.5" />
              <circle cx="810" cy="520" r="3.5" fill="#00f0ff" opacity="0.5" />
              <circle cx="360" cy="840" r="3.5" fill="#10b981" opacity="0.5" />

              {/* Technical Marginal Telemetry */}
              <text x="40" y="40" fill="rgba(0, 240, 255, 0.38)" fontSize="10" fontFamily="monospace" fontWeight="700">DATASET: TILE_08_ORTHO_RGB [1048576 PX]</text>
              <text x="1320" y="40" fill="rgba(0, 240, 255, 0.38)" fontSize="10" fontFamily="monospace" fontWeight="700">CRS: EPSG:32643 (UTM 43N)</text>
              <text x="40" y="870" fill="rgba(148, 163, 184, 0.35)" fontSize="10" fontFamily="monospace">LAT 18.5204° N • LON 73.8567° E</text>
              <text x="1320" y="870" fill="rgba(148, 163, 184, 0.35)" fontSize="10" fontFamily="monospace">GSD: 2.4 CM/PX • SUB-M RES</text>
            </svg>

            {/* Layer 5: Animated Geodetic Scanning Laser Bar */}
            <div className="geo-hero-laser-scan" />

            {/* Layer 6: Atmospheric Cyan/Violet Glow */}
            <div className="geo-hero-atmospheric-glow" />
          </div>

          <div className="geo-hero-content" style={{ position: 'relative', zIndex: 2 }}>
            <div className="geo-hero-top-hud">
              <div className="geo-engine-badge">
                <span className="geo-dot-pulse" />
                <span>AI SPATIAL ENGINE • SCANNING TERRAIN...</span>
              </div>
              <div className="geo-coord-badge">
                LAT 18.5204° N • LON 73.8567° E | CRS EPSG:32643 (UTM 43N)
              </div>
            </div>

            <p className="geo-hero-eyebrow">
              GEOCADASTRA • AI-POWERED CADASTRAL INTELLIGENCE
            </p>

            <motion.h1
              className="geo-hero-headline"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              TURN AERIAL<br />
              IMAGERY INTO<br />
              <span className="highlight">SPATIAL</span><br />
              INTELLIGENCE.
            </motion.h1>

            <p className="geo-hero-description">
              AI-powered cadastral mapping, building intelligence, spatial analysis and geospatial verification from high-resolution UAV and GIS data.
            </p>

            <div className="geo-hero-buttons">
              <button
                type="button"
                className="geo-btn-primary geo-btn-hero-primary"
                onClick={() => navigate(analysisRoute)}
              >
                <span>START ANALYSIS</span>
                <span className="geo-btn-arrow">↗</span>
              </button>
              <a
                href="#platform"
                className="geo-btn-secondary geo-btn-hero-secondary"
              >
                EXPLORE PLATFORM
              </a>
            </div>

            <div className="geo-hero-pills">
              <span className="geo-tech-pill">BUILDING EXTRACTION</span>
              <span className="geo-tech-pill">GIS PROCESSING</span>
              <span className="geo-tech-pill">TOPOLOGY GUARDIAN</span>
              <span className="geo-tech-pill">POSTGIS</span>
            </div>
          </div>

          {/* Right Hero Visual Composition with Real Geospatial Overlay & Parallax */}
          <div className="geo-hero-visual-col" style={{ position: 'relative', zIndex: 2 }}>
            
            {/* FLOATING AUTONOMOUS SURVEY DRONE */}
            <div className="geo-hero-drone-wrapper">
              <div
                className="geo-hero-drone-body"
                style={{
                  transform: `translate3d(${heroTilt.x * -1.2}px, ${heroTilt.y * -1.2}px, 0) rotate(${heroTilt.x * 0.8}deg)`,
                }}
              >
                {/* Glow & Soft Ground Shadow */}
                <div className="geo-drone-ambient-glow" />
                <div className="geo-drone-shadow" />

                {/* Drone Image */}
                <img
                  src={heroSurveyDroneImg}
                  alt="GeoCadastra Autonomous Cadastral Survey Drone"
                  className="geo-drone-img"
                />

                {/* Drone Active Status Tag */}
                <div className="geo-drone-status-tag">
                  <span className="geo-dot-pulse" />
                  <span>UAV SURVEY • ALT 45M</span>
                </div>
              </div>

              {/* Conical Surveying Scanning Beam pointing toward the Aerial Dataset Viewport */}
              <div className="geo-drone-scan-beam" aria-hidden="true">
                <svg className="geo-drone-beam-svg" viewBox="0 0 400 240" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="droneBeamGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                      <stop offset="0%" stopColor="rgba(0, 240, 255, 0.45)" />
                      <stop offset="35%" stopColor="rgba(0, 240, 255, 0.16)" />
                      <stop offset="70%" stopColor="rgba(0, 240, 255, 0.05)" />
                      <stop offset="100%" stopColor="rgba(0, 240, 255, 0)" />
                    </linearGradient>
                    <radialGradient id="beamOriginGlow" cx="50%" cy="0%" r="50%">
                      <stop offset="0%" stopColor="rgba(0, 240, 255, 0.85)" />
                      <stop offset="100%" stopColor="rgba(0, 240, 255, 0)" />
                    </radialGradient>
                  </defs>
                  
                  {/* Conical Light Projection */}
                  <polygon points="180,0 220,0 390,240 10,240" fill="url(#droneBeamGrad)" />

                  {/* Survey Projection Ray Centerline & Edges */}
                  <line x1="200" y1="0" x2="200" y2="240" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="180" y1="0" x2="10" y2="240" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1" strokeDasharray="6 3" />
                  <line x1="220" y1="0" x2="390" y2="240" stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1" strokeDasharray="6 3" />

                  {/* Optical Focal Ring */}
                  <circle cx="200" cy="8" r="7" fill="url(#beamOriginGlow)" />
                  <circle cx="200" cy="8" r="3" fill="#00f0ff" />
                </svg>
              </div>
            </div>

            <div
              className="geo-hero-visual-frame"
              onMouseMove={handleHeroMouseMove}
              onMouseLeave={handleHeroMouseLeave}
              style={{
                transform: `perspective(1000px) rotateX(${heroTilt.y}deg) rotateY(${heroTilt.x}deg)`,
                transition: 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'
              }}
            >
              {/* Corner HUD Brackets */}
              <div className="geo-hud-bracket tl" />
              <div className="geo-hud-bracket tr" />
              <div className="geo-hud-bracket bl" />
              <div className="geo-hud-bracket br" />

              <div className="geo-visual-scanline" />

              {/* Background Satellite / UAV Orthomosaic Layer */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(3, 15, 30, 0.35), rgba(3, 7, 18, 0.92)), url(${platformAerialImg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  opacity: 0.72
                }}
              />

              {/* Vector Polygons Overlay */}
              <svg
                viewBox="0 0 800 600"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                aria-label="Hero cadastral vector illustration"
              >
                <defs>
                  <pattern id="heroGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 240, 255, 0.12)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#heroGrid)" />

                {/* Cadastral Parcel Boundaries */}
                <polygon points="120,80 420,110 390,380 90,340" fill="rgba(0, 240, 255, 0.08)" stroke="#00f0ff" strokeWidth="2" strokeDasharray="4 2" />
                <polygon points="420,110 720,130 690,420 390,380" fill="rgba(0, 240, 255, 0.05)" stroke="#00f0ff" strokeWidth="2" strokeDasharray="4 2" />
                <polygon points="90,340 390,380 370,540 80,510" fill="rgba(16, 185, 129, 0.08)" stroke="#10b981" strokeWidth="2" />

                {/* Building Footprints */}
                <polygon points="160,140 280,150 270,240 150,230" fill="rgba(0, 240, 255, 0.35)" stroke="#00f0ff" strokeWidth="2" />
                <polygon points="310,160 380,170 370,260 300,250" fill="rgba(0, 240, 255, 0.4)" stroke="#00f0ff" strokeWidth="2" />
                <polygon points="480,180 620,190 600,320 460,300" fill="rgba(0, 240, 255, 0.45)" stroke="#00f0ff" strokeWidth="2" />
                <polygon points="140,390 280,400 270,490 130,480" fill="rgba(56, 189, 248, 0.4)" stroke="#38bdf8" strokeWidth="2" />

                {/* Conflict indicator polygon */}
                <polygon points="460,300 520,305 510,360 450,350" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="2" />

                {/* Drone HUD Reticle */}
                <circle cx="400" cy="280" r="48" fill="none" stroke="rgba(0, 240, 255, 0.5)" strokeWidth="1.5" strokeDasharray="6 4" />
                <circle cx="400" cy="280" r="6" fill="#00f0ff" />
                <line x1="330" y1="280" x2="470" y2="280" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1" />
                <line x1="400" y1="210" x2="400" y2="350" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1" />
              </svg>

              {/* Top Right Floating Card */}
              <div className="geo-hero-overlay-card top-right">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#00f0ff', fontWeight: 800, marginBottom: 4 }}>
                  <Radio size={12} className="spin" />
                  <span>UAV ORTHOMOSAIC • DEMO</span>
                </div>
                <div style={{ display: 'grid', gap: 2, fontFamily: 'monospace', fontSize: '9px', color: '#cbd5e1' }}>
                  <div>GSD &lt; 5 CM • 96.4% CONF</div>
                  <div style={{ color: '#00f0ff' }}>CRS: EPSG:32643 (UTM 43N)</div>
                </div>
              </div>

              {/* Bottom Left Floating Card */}
              <div className="geo-hero-overlay-card bottom-left">
                <div style={{ fontWeight: 800, letterSpacing: '0.08em', color: '#ffffff', marginBottom: 2 }}>
                  AREA 14.8 HA • PARCELS 42
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: '9px', color: '#94a3b8' }}>
                  <span>248 BLDS</span>
                  <span style={{ color: '#00f0ff' }}>BCR 34.2%</span>
                  <span style={{ color: '#10b981' }}>TOPOLOGY: HEALED SHAPELY</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            4. HERO TECHNICAL FOOTER STRIP
            ======================================================== */}
        <section className="geo-hero-strip-section" style={{ maxWidth: 1360, margin: '0 auto 40px', padding: '0 24px', position: 'relative', zIndex: 2 }}>
          <div className="geo-hero-strip">
            <div className="geo-corner-bracket tl" />
            <div className="geo-corner-bracket tr" />
            <div className="geo-corner-bracket bl" />
            <div className="geo-corner-bracket br" />
            <div className="geo-strip-col">
              <div className="geo-strip-col-head">
                <span className="geo-strip-dot" />
                <small>INPUT RASTER</small>
              </div>
              <strong>UAV ORTHOMOSAIC (GSD &lt; 5 CM)</strong>
            </div>
            <div className="geo-strip-col">
              <div className="geo-strip-col-head">
                <span className="geo-strip-dot" />
                <small>AI EXTRACTION</small>
              </div>
              <strong>U-NET++ / YOLO11-SEG / MASK R-CNN</strong>
            </div>
            <div className="geo-strip-col">
              <div className="geo-strip-col-head">
                <span className="geo-strip-dot" />
                <small>GIS ENGINE</small>
              </div>
              <strong>RASTERIO / PYPROJ / SHAPELY</strong>
            </div>
            <div className="geo-strip-col">
              <div className="geo-strip-col-head">
                <span className="geo-strip-dot" />
                <small>PERSISTENCE</small>
              </div>
              <strong>POSTGRESQL 16 / POSTGIS / SPATIAL ...</strong>
            </div>
          </div>
        </section>

        {/* ========================================================
            5. PLATFORM SECTION
            ======================================================== */}
        <section id="platform" className="geo-section geo-section-platform">
          {/* Section Divider Line with Technical Coordinate Ticks */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">MODULE: GEO_PLATFORM_V2</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-section-header">
            <div className="geo-section-badge">
              <span className="geo-datum-tick">+</span>
              <span className="geo-datum-label">STAGE 01 — 06 WORKFLOW</span>
            </div>
            <p className="eyebrow">THE GEOCADASTRA PLATFORM</p>
            <h2 className="geo-section-title">FROM AERIAL DATA TO ACTIONABLE<br />CADASTRAL INTELLIGENCE</h2>
            <p className="geo-section-desc">
              A 6-stage end-to-end geospatial engineering pipeline engineered to transform raw drone orthomosaics into verified cadastral polygons with geodetic certainty.
            </p>
          </div>

          {/* Horizontal Metrics Strip */}
          <motion.div
            className="geo-metrics-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.div className="geo-metric-box" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-metric-micro-tag">OPTICAL RESOLUTION</div>
              <div className="geo-metric-val">2.4cm</div>
              <div className="geo-metric-lbl">GROUND SAMPLING DISTANCE</div>
            </motion.div>
            <motion.div className="geo-metric-box" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-metric-micro-tag">SEGMENTATION IOU</div>
              <div className="geo-metric-val">89.7%</div>
              <div className="geo-metric-lbl">AVG. IOU SCORE (PARCEL)</div>
            </motion.div>
            <motion.div className="geo-metric-box" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-metric-micro-tag">EXECUTION SPEED</div>
              <div className="geo-metric-val">&lt;0.5s</div>
              <div className="geo-metric-lbl">INFERENCE LATENCY</div>
            </motion.div>
            <motion.div className="geo-metric-box" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-metric-micro-tag">OGC COMPLIANCE</div>
              <div className="geo-metric-val">100%</div>
              <div className="geo-metric-lbl">OGC TOPOLOGY VALID</div>
            </motion.div>
            <motion.div className="geo-metric-box" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-metric-micro-tag">SURVEY PRECISION</div>
              <div className="geo-metric-val">Sub-m</div>
              <div className="geo-metric-lbl">BOUNDARY ACCURACY</div>
            </motion.div>
          </motion.div>

          {/* Six Technical Processing Cards */}
          <motion.div
            className="geo-stages-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            {stages.map((stage) => (
              <motion.article key={stage.num} className="geo-stage-card" variants={itemVariants}>
                <div className="geo-corner-bracket tl" />
                <div className="geo-corner-bracket tr" />
                <div className="geo-corner-bracket bl" />
                <div className="geo-corner-bracket br" />
                <div>
                  <div className="geo-stage-card-head">
                    <span className="geo-stage-num">{stage.num}</span>
                    <span className="geo-stage-tag">{stage.tag}</span>
                  </div>
                  <h3 className="geo-stage-title">{stage.title}</h3>
                  <p className="geo-stage-desc">{stage.desc}</p>
                </div>
                <div className="geo-stage-footer">
                  <span className="geo-stage-footer-icon">⚙</span>
                  <span>{stage.footer}</span>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </section>

        {/* ========================================================
            6. THREE-TIER GEODETIC + AI ARCHITECTURE
            ======================================================== */}
        <section className="geo-section geo-section-alt-depth" style={{ background: 'rgba(5, 12, 24, 0.75)', borderTop: '1px solid rgba(0, 240, 255, 0.12)', borderBottom: '1px solid rgba(0, 240, 255, 0.12)' }}>
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">ARCHITECTURE: 3-TIER RECONCILIATION</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-section-header">
            <div className="geo-section-badge">
              <span className="geo-datum-tick">+</span>
              <span className="geo-datum-label">SYSTEM ARCHITECTURE</span>
            </div>
            <p className="eyebrow">INTELLIGENT SPATIAL ANALYSIS</p>
            <h2 className="geo-section-title">THREE-TIER GEODETIC & AI EXTRACTION<br />ARCHITECTURE</h2>
            <p className="geo-section-desc">
              Explore how raw multi-sensor inputs are systematically processed by deep neural engines to generate authoritative spatial records and encroachment diagnostics.
            </p>
          </div>

          <motion.div
            className="geo-threetier-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            {/* Column 1: Input */}
            <motion.div className="geo-tier-card" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-tier-stage-label">STAGE 01</div>
              <h3 className="geo-tier-title">INPUT</h3>
              <p className="geo-tier-sub">Multi-sensor aerial & geodetic ingestion</p>

              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>UAV ORTHOMOSAIC</strong>
                  <p>High-resolution sub-5cm RGB photogrammetry</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>DSM / DTM</strong>
                  <p>Digital surface & terrain elevation models</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>GIS LAYERS</strong>
                  <p>Historical cadastral vector parcel boundaries</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>GNSS DATA</strong>
                  <p>Centimeter-grade RTK ground control points</p>
                </div>
              </div>
            </motion.div>

            {/* Column 2: AI Engine (Prominent Cyan) */}
            <motion.div className="geo-tier-card highlight" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-tier-stage-label" style={{ color: '#00f0ff' }}>STAGE 02 • CORE ENGINE</div>
              <h3 className="geo-tier-title" style={{ color: '#ffffff' }}>AI ENGINE</h3>
              <p className="geo-tier-sub" style={{ color: '#93c5fd' }}>Neural inference & vector topology healing</p>

              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator active" />
                <div>
                  <strong style={{ color: '#00f0ff' }}>PARCEL EXTRACTION</strong>
                  <p>Deep neural boundary & parcel edge extraction</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator active" />
                <div>
                  <strong style={{ color: '#00f0ff' }}>BUILDING DETECTION</strong>
                  <p>U-Net++ roofline footprint segmentation</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator active" />
                <div>
                  <strong style={{ color: '#00f0ff' }}>LAND-USE ANALYSIS</strong>
                  <p>Spectral classification & zoning verification</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator active" />
                <div>
                  <strong style={{ color: '#00f0ff' }}>TOPOLOGY CHECK</strong>
                  <p>Douglas-Peucker simplification & Shapely healing</p>
                </div>
              </div>
            </motion.div>

            {/* Column 3: Output */}
            <motion.div className="geo-tier-card" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-tier-stage-label">STAGE 03</div>
              <h3 className="geo-tier-title">OUTPUT</h3>
              <p className="geo-tier-sub">Authoritative cadastral intelligence</p>

              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>PARCEL INTELLIGENCE</strong>
                  <p>Exact metric area (m²), perimeter & BCR %</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>CONFLICT DETECTION</strong>
                  <p>Multi-parcel crossing & setback alerts</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>CONFIDENCE RATINGS</strong>
                  <p>Mathematical roundness & agreement scoring</p>
                </div>
              </div>
              <div className="geo-tier-item">
                <div className="geo-tier-item-indicator" />
                <div>
                  <strong>VERIFICATION FLAGS</strong>
                  <p>Surveyor-ready audit queue in PostGIS</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ========================================================
            7 & 8. INTERACTIVE MAP / CADASTRAL EXPLORER & 3D EXTRUSION
            ======================================================== */}
        <section id="map-explorer" className="geo-section geo-section-map">
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">MAP ENGINE: EPSG:32643 UTM</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-section-header">
            <div className="geo-section-badge">
              <span className="geo-datum-tick">+</span>
              <span className="geo-datum-label">REAL-TIME CADASTRAL GIS</span>
            </div>
            <p className="eyebrow">EXPLORE PARCEL BOUNDARIES & TOPOLOGY IN REAL-TIME</p>
            <h2 className="geo-section-title">INTERACTIVE CADASTRAL MAP EXPLORER</h2>
            <p className="geo-section-desc">
              Sub-metre cadastral boundaries, AI-extracted building footprints, and geodetic conflict analysis rendered over high-resolution UAV orthomosaics.
            </p>
            <div className="geo-header-tech-tag">
              [DEMONSTRATION DATASET • CRS EPSG:32643 METRES]
            </div>
          </div>

          <div className="geo-map-container">
            <div className="geo-corner-bracket tl" />
            <div className="geo-corner-bracket tr" />
            <div className="geo-corner-bracket bl" />
            <div className="geo-corner-bracket br" />

            {/* Map Toolbar Controls */}
            <div className="geo-map-toolbar">
              <div className={`geo-map-search ${searchNoResult ? 'no-result' : ''}`}>
                <Search size={14} style={{ color: searchNoResult ? '#ef4444' : '#00f0ff' }} />
                <input
                  type="text"
                  placeholder="SEARCH PARCEL / LOCATION (e.g. P-1027, P-1028, P-1029)"
                  value={mapSearch}
                  onChange={(e) => setMapSearch(e.target.value)}
                />
                {searchNoResult && (
                  <span className="geo-search-no-result">NO MATCH</span>
                )}
              </div>

              {/* 2D / 3D Mode Switcher */}
              <div className="geo-map-toggles">
                <button
                  type="button"
                  className={`geo-viewmode-btn ${mapMode === '2d' ? 'active' : ''}`}
                  onClick={() => setMapMode('2d')}
                >
                  2D PLANAR
                </button>
                <button
                  type="button"
                  className={`geo-viewmode-btn ${mapMode === '3d' ? 'active' : ''}`}
                  onClick={() => setMapMode('3d')}
                >
                  3D EXTRUSION
                </button>
              </div>

              {/* Layer / Filter Pills */}
              <div className="geo-map-toggles">
                {['satellite', 'parcels', 'buildings', 'roads', 'gnss', 'conflicts'].map((layerKey) => (
                  <button
                    key={layerKey}
                    type="button"
                    className={`geo-layer-pill ${activeLayers[layerKey] ? 'active' : ''}`}
                    onClick={() => toggleLayer(layerKey)}
                  >
                    {layerKey.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Interactive Map Viewport */}
            <div className="geo-map-viewport">
              <div className={`geo-map-canvas-3d ${mapMode === '3d' ? 'is-3d' : ''}`}>
                <svg
                  viewBox="0 0 1000 650"
                  style={{ width: '100%', height: '100%', background: '#071322' }}
                  aria-label="Cadastral map interactive canvas"
                >
                  {/* Base imagery tile pattern */}
                  {activeLayers.satellite && (
                    <defs>
                      <pattern id="satPattern" width="1000" height="650" patternUnits="userSpaceOnUse">
                        <image
                          href={platformAerialImg}
                          x="0"
                          y="0"
                          width="1000"
                          height="650"
                          preserveAspectRatio="xMidYMid slice"
                          opacity="0.5"
                        />
                      </pattern>
                    </defs>
                  )}
                  {activeLayers.satellite && <rect width="1000" height="650" fill="url(#satPattern)" />}

                  {/* Grid Lines */}
                  <line x1="0" y1="200" x2="1000" y2="200" stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                  <line x1="0" y1="400" x2="1000" y2="400" stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                  <line x1="300" y1="0" x2="300" y2="650" stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                  <line x1="650" y1="0" x2="650" y2="650" stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />

                  {/* Roads / Pathways */}
                  {activeLayers.roads && (
                    <g opacity={isolated ? 0.2 : 1}>
                      <path d="M 0,320 Q 350,290 650,330 T 1000,310" fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="18" />
                      <path d="M 0,320 Q 350,290 650,330 T 1000,310" fill="none" stroke="#f8fafc" strokeWidth="2" strokeDasharray="8 6" />
                      <path d="M 450,0 L 460,650" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="12" />
                    </g>
                  )}

                  {/* Cadastral Parcels Layer */}
                  {activeLayers.parcels && (
                    <g>
                      {/* Parcel 1 (P-1027) */}
                      <polygon
                        points="80,80 430,90 410,300 70,290"
                        fill={selectedFeature.id === 'P-1027' || hoveredParcel === 'P-1027' ? 'rgba(0, 240, 255, 0.28)' : 'rgba(0, 240, 255, 0.08)'}
                        stroke="#00f0ff"
                        strokeWidth={selectedFeature.id === 'P-1027' || hoveredParcel === 'P-1027' ? '3' : '1.5'}
                        style={{ cursor: 'pointer', transition: 'all 0.25s ease' }}
                        onMouseEnter={() => setHoveredParcel('P-1027')}
                        onMouseLeave={() => setHoveredParcel(null)}
                        onClick={() => setSelectedFeature({
                          id: 'P-1027',
                          name: 'Parcel P-1027 (Industrial)',
                          structures: '4 AI Extracted',
                          landUse: 'Light Industrial / Logistics',
                          bcr: '41.0%',
                          confidence: '98.2%'
                        })}
                      />
                      {(selectedFeature.id === 'P-1027' || hoveredParcel === 'P-1027') && (
                        <g>
                          <circle cx="80" cy="80" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="430" cy="90" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="410" cy="300" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="70" cy="290" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                        </g>
                      )}
                      <text x="100" y="115" fill="#00f0ff" fontSize="11" fontWeight="800" letterSpacing="0.08em">PARCEL P-1027 • 1,500m²</text>

                      {/* Parcel 2 (P-1028) */}
                      <polygon
                        points="480,90 880,110 860,310 470,290"
                        fill={selectedFeature.id === 'P-1028' || hoveredParcel === 'P-1028' ? 'rgba(0, 240, 255, 0.28)' : 'rgba(0, 240, 255, 0.06)'}
                        stroke="#00f0ff"
                        strokeWidth={selectedFeature.id === 'P-1028' || hoveredParcel === 'P-1028' ? '3' : '1.5'}
                        opacity={isolated && selectedFeature.id !== 'P-1028' ? 0.2 : 1}
                        style={{ cursor: 'pointer', transition: 'all 0.25s ease' }}
                        onMouseEnter={() => setHoveredParcel('P-1028')}
                        onMouseLeave={() => setHoveredParcel(null)}
                        onClick={() => setSelectedFeature({
                          id: 'P-1028',
                          name: 'Parcel P-1028 (Commercial)',
                          structures: '2 AI Extracted',
                          landUse: 'Commercial Mixed-Use',
                          bcr: '30.7%',
                          confidence: '94.8%'
                        })}
                      />
                      {(selectedFeature.id === 'P-1028' || hoveredParcel === 'P-1028') && (
                        <g>
                          <circle cx="480" cy="90" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="880" cy="110" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="860" cy="310" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="470" cy="290" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                        </g>
                      )}
                      <text x="500" y="120" fill="#00f0ff" fontSize="11" fontWeight="800" opacity={isolated && selectedFeature.id !== 'P-1028' ? 0.2 : 1}>PARCEL P-1028 • 1,200m²</text>

                      {/* Parcel 3 (P-1029) */}
                      <polygon
                        points="80,350 430,360 410,590 60,570"
                        fill={selectedFeature.id === 'P-1029' || hoveredParcel === 'P-1029' ? 'rgba(16, 185, 129, 0.28)' : 'rgba(16, 185, 129, 0.08)'}
                        stroke="#10b981"
                        strokeWidth={selectedFeature.id === 'P-1029' || hoveredParcel === 'P-1029' ? '3' : '1.5'}
                        opacity={isolated && selectedFeature.id !== 'P-1029' ? 0.2 : 1}
                        style={{ cursor: 'pointer', transition: 'all 0.25s ease' }}
                        onMouseEnter={() => setHoveredParcel('P-1029')}
                        onMouseLeave={() => setHoveredParcel(null)}
                        onClick={() => setSelectedFeature({
                          id: 'P-1029',
                          name: 'Parcel P-1029 (Residential)',
                          structures: '1 AI Extracted',
                          landUse: 'Residential Urban Low-Rise',
                          bcr: '15.1%',
                          confidence: '95.1%'
                        })}
                      />
                      {(selectedFeature.id === 'P-1029' || hoveredParcel === 'P-1029') && (
                        <g>
                          <circle cx="80" cy="350" r="4" fill="#10b981" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="430" cy="360" r="4" fill="#10b981" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="410" cy="590" r="4" fill="#10b981" stroke="#030712" strokeWidth="1.5" />
                          <circle cx="60" cy="570" r="4" fill="#10b981" stroke="#030712" strokeWidth="1.5" />
                        </g>
                      )}
                      <text x="100" y="380" fill="#10b981" fontSize="11" fontWeight="800">PARCEL P-1029 • 800m²</text>
                    </g>
                  )}

                  {/* AI Building Footprints */}
                  {activeLayers.buildings && (() => {
                    // Parcel → Building ownership map for isolation
                    const bldParcel = { 'BLD-101': 'P-1027', 'BLD-102': 'P-1027', 'BLD-103': 'P-1028', 'BLD-104': 'P-1029' }
                    const bldIsolated = (bldId) => isolated && bldParcel[bldId] !== selectedFeature.id
                    const bldCyan = (bldId) => bldParcel[bldId] !== 'P-1029' // BLD-101/102/103 are cyan
                    const bldColor = (bldId) => bldCyan(bldId) ? '#00f0ff' : '#10b981'
                    const bldFill = (bldId, alpha) => bldCyan(bldId) ? `rgba(0, 240, 255, ${alpha})` : `rgba(16, 185, 129, ${alpha})`

                    const buildingData = [
                      { id: 'BLD-101', points: '120,150 240,160 230,250 110,240', cx: 175, cy: 200, label: 'BLD-101 (245m²)' },
                      { id: 'BLD-102', points: '270,170 360,180 350,265 260,255', cx: 310, cy: 218, label: 'BLD-102 (180m²)' },
                      { id: 'BLD-103', points: '520,180 680,190 660,280 500,270', cx: 590, cy: 228, label: 'BLD-103 (310m²)' },
                      { id: 'BLD-104', points: '120,420 240,430 230,510 110,500', cx: 175, cy: 465, label: 'BLD-104 (120m²)' },
                    ]

                    // 3D wall data: front-face quads (roof-top → ground-shifted)
                    const wallData = [
                      { points: '120,150 120,110 240,120 240,160', color: 'rgba(0, 240, 255, 0.3)', stroke: '#00f0ff' },
                      { points: '110,240 110,200 120,150 120,190', color: 'rgba(0, 180, 255, 0.35)', stroke: '#00f0ff' },
                      { points: '270,170 270,125 360,135 360,180', color: 'rgba(0, 240, 255, 0.3)', stroke: '#00f0ff' },
                      { points: '520,180 520,130 680,140 680,190', color: 'rgba(0, 240, 255, 0.3)', stroke: '#00f0ff' },
                      { points: '680,190 680,140 660,230 660,280', color: 'rgba(0, 200, 255, 0.32)', stroke: '#00f0ff' },
                      { points: '120,420 120,375 240,385 240,430', color: 'rgba(16, 185, 129, 0.3)', stroke: '#10b981' },
                      { points: '110,500 110,455 120,420 120,465', color: 'rgba(16, 165, 110, 0.35)', stroke: '#10b981' },
                    ]

                    return (
                      <g>
                        {/* 3D Extrusion Walls */}
                        {mapMode === '3d' && (
                          <g>
                            {wallData.map((w, i) => (
                              <polygon key={i} points={w.points} fill={w.color} stroke={w.stroke} strokeWidth="1" />
                            ))}
                          </g>
                        )}

                        {/* Building Footprints (roofs) */}
                        {buildingData.map((b) => {
                          const isHov = hoveredBuilding === b.id
                          const isSelected = bldParcel[b.id] === selectedFeature.id
                          const dimmed = bldIsolated(b.id)
                          const col = bldColor(b.id)
                          const fillAlpha = isHov ? 0.75 : isSelected ? 0.6 : 0.45
                          return (
                            <g key={b.id} opacity={dimmed ? 0.18 : 1} style={{ transition: 'opacity 0.25s ease' }}>
                              {isHov && (
                                <polygon
                                  points={b.points}
                                  fill="none"
                                  stroke={col}
                                  strokeWidth="6"
                                  opacity="0.35"
                                />
                              )}
                              <polygon
                                points={b.points}
                                fill={bldFill(b.id, fillAlpha)}
                                stroke={col}
                                strokeWidth={isHov || isSelected ? '2.5' : '1.5'}
                                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                                onMouseEnter={() => setHoveredBuilding(b.id)}
                                onMouseLeave={() => setHoveredBuilding(null)}
                                onClick={() => {
                                  const parcelId = bldParcel[b.id]
                                  const parcelMap = {
                                    'P-1027': { id: 'P-1027', name: 'Parcel P-1027 (Industrial)', structures: '4 AI Extracted', landUse: 'Light Industrial / Logistics', bcr: '41.0%', confidence: '98.2%' },
                                    'P-1028': { id: 'P-1028', name: 'Parcel P-1028 (Commercial)', structures: '2 AI Extracted', landUse: 'Commercial Mixed-Use', bcr: '30.7%', confidence: '94.8%' },
                                    'P-1029': { id: 'P-1029', name: 'Parcel P-1029 (Residential)', structures: '1 AI Extracted', landUse: 'Residential Urban Low-Rise', bcr: '15.1%', confidence: '95.1%' },
                                  }
                                  setSelectedFeature(parcelMap[parcelId])
                                }}
                              />
                              <text x={b.cx - 40} y={b.cy + 3} fill="#ffffff" fontSize="9" fontWeight="800" pointerEvents="none">
                                {b.label}
                              </text>
                              {isHov && (
                                <rect
                                  x={b.cx - 40}
                                  y={b.cy - 8}
                                  width="80"
                                  height="14"
                                  rx="2"
                                  fill="rgba(4, 11, 20, 0.85)"
                                  stroke={col}
                                  strokeWidth="0.5"
                                  pointerEvents="none"
                                />
                              )}
                            </g>
                          )
                        })}
                      </g>
                    )
                  })()}

                  {/* Conflict / Encroachment Zone */}
                  {activeLayers.conflicts && (
                    <g opacity={isolated ? 0.2 : 1}>
                      <polygon
                        points="390,240 460,245 450,305 380,300"
                        fill={hoveredConflict ? 'rgba(239, 68, 68, 0.55)' : 'rgba(239, 68, 68, 0.35)'}
                        stroke="#ef4444"
                        strokeWidth={hoveredConflict ? '3.5' : '2.5'}
                        strokeDasharray="4 2"
                        style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                        onMouseEnter={() => setHoveredConflict(true)}
                        onMouseLeave={() => setHoveredConflict(false)}
                      />
                      {hoveredConflict && (
                        <polygon
                          points="390,240 460,245 450,305 380,300"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="7"
                          opacity="0.25"
                          pointerEvents="none"
                        />
                      )}
                      <circle cx="420" cy="272" r={hoveredConflict ? '16' : '14'} fill="rgba(239, 68, 68, 0.85)" style={{ transition: 'r 0.2s ease' }} pointerEvents="none" />
                      <text x="414" y="277" fill="#ffffff" fontSize="13" fontWeight="900" pointerEvents="none">!</text>
                      <text x="470" y="268" fill="#ef4444" fontSize="10" fontWeight="800" pointerEvents="none">ENCROACHMENT DETECTED</text>
                      {hoveredConflict && (
                        <text x="470" y="282" fill="rgba(239, 68, 68, 0.75)" fontSize="8" fontWeight="700" fontFamily="monospace" pointerEvents="none">BOUNDARY OVERLAP · REVIEW REQUIRED</text>
                      )}
                    </g>
                  )}

                  {/* GNSS Ground Control Points with accuracy rings */}
                  {activeLayers.gnss && (
                    <g opacity={isolated ? 0.2 : 1}>
                      {[
                        { cx: 80, cy: 80, id: 'GCP-01' },
                        { cx: 430, cy: 90, id: 'GCP-02' },
                        { cx: 880, cy: 110, id: 'GCP-03' },
                        { cx: 410, cy: 590, id: 'GCP-04' },
                      ].map((gcp) => (
                        <g key={gcp.id}>
                          {/* Accuracy ring (outer) */}
                          <circle cx={gcp.cx} cy={gcp.cy} r="18" fill="none" stroke="rgba(234, 179, 8, 0.18)" strokeWidth="1" />
                          {/* Accuracy ring (inner) */}
                          <circle cx={gcp.cx} cy={gcp.cy} r="11" fill="none" stroke="rgba(234, 179, 8, 0.28)" strokeWidth="1" strokeDasharray="2 2" />
                          {/* Crosshair H */}
                          <line x1={gcp.cx - 8} y1={gcp.cy} x2={gcp.cx + 8} y2={gcp.cy} stroke="rgba(234, 179, 8, 0.6)" strokeWidth="0.8" />
                          {/* Crosshair V */}
                          <line x1={gcp.cx} y1={gcp.cy - 8} x2={gcp.cx} y2={gcp.cy + 8} stroke="rgba(234, 179, 8, 0.6)" strokeWidth="0.8" />
                          {/* Core dot */}
                          <circle cx={gcp.cx} cy={gcp.cy} r="5" fill="#eab308" stroke="#ffffff" strokeWidth="1.5" />
                          {/* GCP label */}
                          <text x={gcp.cx + 10} y={gcp.cy - 8} fill="#eab308" fontSize="8" fontWeight="800" fontFamily="monospace">{gcp.id}</text>
                        </g>
                      ))}
                    </g>
                  )}

                  {/* Compass / North Arrow & Scale Indicator */}
                  <g transform="translate(40, 40)">
                    <circle cx="20" cy="20" r="16" fill="rgba(4, 11, 20, 0.8)" stroke="#00f0ff" strokeWidth="1" />
                    <path d="M 20,8 L 25,24 L 20,20 L 15,24 Z" fill="#00f0ff" />
                    <text x="17" y="5" fill="#00f0ff" fontSize="9" fontWeight="900">N</text>
                  </g>

                  <g transform="translate(40, 610)">
                    <rect x="0" y="0" width="100" height="4" fill="#00f0ff" />
                    <rect x="50" y="0" width="50" height="4" fill="#ffffff" />
                    <text x="0" y="-4" fill="#cbd5e1" fontSize="9" fontFamily="monospace">0m</text>
                    <text x="45" y="-4" fill="#cbd5e1" fontSize="9" fontFamily="monospace">50m</text>
                    <text x="90" y="-4" fill="#cbd5e1" fontSize="9" fontFamily="monospace">100m</text>
                  </g>
                </svg>

                {/* Floating Information Panel */}
                <div className="geo-map-info-hud">
                  <div className="geo-corner-bracket tl" />
                  <div className="geo-corner-bracket tr" />
                  <div className="geo-corner-bracket bl" />
                  <div className="geo-corner-bracket br" />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong style={{ fontSize: '12px', color: '#00f0ff', letterSpacing: '0.08em' }}>{selectedFeature.name}</strong>
                    <span style={{ fontSize: '9px', background: 'rgba(0, 240, 255, 0.15)', color: '#00f0ff', padding: '2px 6px', borderRadius: 4 }}>
                      ACTIVE
                    </span>
                  </div>

                  <div className="geo-info-hud-row">
                    <span>Detected Structures:</span>
                    <strong className="cyan">{selectedFeature.structures}</strong>
                  </div>
                  <div className="geo-info-hud-row">
                    <span>Land Use Classification:</span>
                    <strong>{selectedFeature.landUse}</strong>
                  </div>
                  <div className="geo-info-hud-row">
                    <span>Building Coverage Ratio:</span>
                    <strong className="cyan">{selectedFeature.bcr}</strong>
                  </div>
                  <div className="geo-info-hud-row">
                    <span>Spatial Confidence:</span>
                    <strong style={{ color: '#10b981' }}>{selectedFeature.confidence}</strong>
                  </div>

                  <div className="geo-info-hud-actions">
                    <button
                      type="button"
                      className="geo-btn-primary"
                      style={{ flex: 1, padding: '7px 10px', fontSize: '10px' }}
                      onClick={() => navigate('/parcels')}
                    >
                      VIEW CADASTRE
                    </button>
                    <button
                      type="button"
                      className="geo-btn-secondary"
                      style={{ flex: 1, padding: '7px 10px', fontSize: '10px', background: isolated ? '#00f0ff' : '', color: isolated ? '#030712' : '' }}
                      onClick={() => setIsolated(!isolated)}
                    >
                      {isolated ? 'SHOW ALL' : 'ISOLATE'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            9. GEOCADASTRA INTELLIGENCE ENGINE (8 CV MODULES)
            ======================================================== */}
        <section className="geo-section geo-section-alt-depth" style={{ background: 'rgba(5, 12, 24, 0.75)', borderTop: '1px solid rgba(0, 240, 255, 0.12)', borderBottom: '1px solid rgba(0, 240, 255, 0.12)' }}>
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">INTELLIGENCE: 8 CV ENGINES</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-section-header">
            <div className="geo-section-badge">
              <span className="geo-datum-tick">+</span>
              <span className="geo-datum-label">NEURAL EXTRACTION SUITE</span>
            </div>
            <p className="eyebrow">GEOCADASTRA INTELLIGENCE ENGINE</p>
            <h2 className="geo-section-title">8 SPECIALIZED GEOSPATIAL<br />COMPUTER VISION MODULES</h2>
            <p className="geo-section-desc">
              Engineered specifically for drone photogrammetry, high-density settlements, and parcel compliance auditing.
            </p>
          </div>

          <motion.div
            className="geo-modules-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            {modules.map((mod) => (
              <motion.div key={mod.idx} className="geo-module-card" variants={itemVariants}>
                <div className="geo-corner-bracket tl" />
                <div className="geo-corner-bracket tr" />
                <div className="geo-corner-bracket bl" />
                <div className="geo-corner-bracket br" />
                <div>
                  <div className="geo-module-top">
                    <span className="geo-module-idx">{mod.idx}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="geo-module-status-badge">OGC READY</span>
                      <RotateCw size={13} className="geo-module-icon-spin" style={{ color: 'rgba(0, 240, 255, 0.7)' }} />
                    </div>
                  </div>
                  <h3 className="geo-module-title">{mod.title}</h3>

                  <div className="geo-module-flow">
                    <div className="geo-module-flow-item">
                      <label>INPUT</label>
                      <span>{mod.input}</span>
                    </div>
                    <div className="geo-module-flow-item">
                      <label>PROCESS</label>
                      <span>{mod.process}</span>
                    </div>
                    <div className="geo-module-flow-item out">
                      <label style={{ color: '#00f0ff' }}>OUTPUT</label>
                      <span>{mod.output}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ========================================================
            10. CONNECTED DATA-FLOW PIPELINE
            ======================================================== */}
        <section className="geo-section geo-section-pipeline">
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">DATA-FLOW: PROGRESSIVE INFERENCE</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-section-header">
            <div className="geo-section-badge">
              <span className="geo-datum-tick">+</span>
              <span className="geo-datum-label">STAGE-BY-STAGE PROGRESSION</span>
            </div>
            <p className="eyebrow">CONNECTED DATA-FLOW PIPELINE</p>
            <h2 className="geo-section-title">FROM RAW DATA TO SPATIAL INTELLIGENCE</h2>
            <p className="geo-section-desc">
              Every aerial pixel undergoes five progressive transformations before becoming authoritative cadastral records.
            </p>
          </div>

          <div className="geo-pipeline-strip-wrap">
            {/* Animated Data Packet Traveling Along Pipeline Rail */}
            <div className="geo-pipeline-rail">
              <div className="geo-pipeline-data-packet" />
            </div>

            <div className="geo-pipeline-strip">
              {pipelineNodes.map((node, i) => (
                <div
                  key={node.num}
                  className={`geo-pipeline-node ${activePipelineStep === i ? 'active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActivePipelineStep(i)}
                >
                  <div className="geo-corner-bracket tl" />
                  <div className="geo-corner-bracket tr" />
                  <div className="geo-corner-bracket bl" />
                  <div className="geo-corner-bracket br" />
                  <div className="geo-pipeline-step-num">{node.num}</div>
                  <div className="geo-pipeline-step-name">{node.title}</div>
                  <div className="geo-pipeline-step-sub">{node.sub}</div>
                  <span className="geo-pipeline-tag">{node.tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="geo-pipeline-callout">
            <div className="geo-corner-bracket tl" />
            <div className="geo-corner-bracket tr" />
            <div className="geo-corner-bracket bl" />
            <div className="geo-corner-bracket br" />
            <div className="geo-pipeline-callout-info">
              <div className="geo-pipeline-callout-stage">
                {pipelineNodes[activePipelineStep]?.stageName || 'STAGE 02'}
              </div>
              <strong className="geo-pipeline-callout-heading">
                {pipelineNodes[activePipelineStep]?.heading || 'AI PERCEPTION — Structures Detected'}
              </strong>
              <p className="geo-pipeline-callout-desc">
                {pipelineNodes[activePipelineStep]?.desc || 'Deep U-Net++ and YOLO11-Seg sliding-window inference segmenting complex roofline geometries.'}
              </p>
            </div>

            <div className="geo-pipeline-callout-metric">
              <span className="geo-pipeline-metric-label">
                {pipelineNodes[activePipelineStep]?.metricLabel || 'VALIDATION METRIC'}
              </span>
              <strong className="geo-pipeline-metric-val">
                {pipelineNodes[activePipelineStep]?.metricVal || '96.4% CONFIDENCE'}
              </strong>
            </div>
          </div>
        </section>

        {/* ========================================================
            11. PROBLEM VS SOLUTION SECTION
            ======================================================== */}
        <section className="geo-section geo-section-alt-depth" style={{ background: 'rgba(5, 12, 24, 0.75)', borderTop: '1px solid rgba(0, 240, 255, 0.12)', borderBottom: '1px solid rgba(0, 240, 255, 0.12)' }}>
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">RECONCILIATION: PROBLEM VS SOLUTION</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-compare-grid">
            {/* Left: Traditional Challenge */}
            <div className="geo-compare-panel problem">
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-compare-content">
                <div className="geo-compare-eyebrow">THE TRADITIONAL CHALLENGE</div>
                <h3 className="geo-compare-title">Fragmented, Outdated Cadastral Silos</h3>
                <p className="geo-compare-desc">
                  Municipalities and surveyors frequently operate with disconnected records that fail to synchronize in the real world:
                </p>

                <div className="geo-compare-items">
                  <div className="geo-compare-item">
                    <AlertTriangle size={18} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <strong>Uncalibrated UAV Flights</strong>
                      <p>Pixel rasters without strict UTM geodetic bounding</p>
                    </div>
                  </div>
                  <div className="geo-compare-item">
                    <AlertTriangle size={18} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <strong>Manual Polygon Digitization</strong>
                      <p>Labor-intensive CAD tracing with human boundary errors</p>
                    </div>
                  </div>
                  <div className="geo-compare-item">
                    <AlertTriangle size={18} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <strong>Legacy Paper Registry Records</strong>
                      <p>Outdated cadastral maps failing to reflect urban encroachment</p>
                    </div>
                  </div>
                  <div className="geo-compare-item">
                    <AlertTriangle size={18} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <strong>Untracked Boundary Conflicts</strong>
                      <p>Zero topological checking for self-intersections or overlaps</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: GeoCadastra Unified Approach */}
            <div className="geo-compare-panel solution">
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-compare-content">
                <div className="geo-compare-eyebrow">THE GEOCADASTRA UNIFIED APPROACH</div>
                <h3 className="geo-compare-title">One Spatial Workflow. Multiple Sources. One Verified View.</h3>
                <p className="geo-compare-desc">
                  GeoCadastra converges optical drone photography, AI vision, and ground truth into a single synchronized geodetic record:
                </p>

                <div className="geo-compare-pill-row">
                  {['DRONE IMAGERY', 'GIS VECTORS', 'GNSS RTK', 'AI MODELS', 'CADASTRAL DATA'].map((source) => (
                    <span key={source} className="geo-compare-pill">{source}</span>
                  ))}
                </div>

                <div className="geo-compare-highlight-box">
                  <strong>GEOCADASTRA CORE SPATIAL RECONCILIATION</strong>
                  <p>Authoritative PostGIS Persistence • Strict OGC Simple Features • Zero Coordinate Fabrication</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            12. INTERACTIVE MAP STORYTELLING (BEFORE / AFTER SLIDER)
            ======================================================== */}
        <section className="geo-section geo-section-story">
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">FLAGSHIP DEMONSTRATION: RAW VS CADASTRAL</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-section-header">
            <div className="geo-section-badge">
              <span className="geo-datum-tick">+</span>
              <span className="geo-datum-label">FLAGSHIP STORYTELLING DEMO</span>
            </div>
            <p className="eyebrow">INTERACTIVE MAP STORYTELLING</p>
            <h2 className="geo-section-title">RAW OBSERVATION VS. CADASTRAL INTELLIGENCE</h2>
            <p className="geo-section-desc">
              Drag the interactive slider to inspect how raw UAV orthomosaic pixels are vectorized into topologically verified parcel geometries.
            </p>
          </div>

          {/* Flagship Product Demonstration Viewport Chassis */}
          <div className="geo-story-showcase-chassis">
            {/* Top Showcase Telemetry Bar */}
            <div className="geo-story-telemetry-bar">
              <div className="geo-story-telemetry-item">
                <span className="geo-dot-pulse" />
                <span>INTERACTIVE COMPARISON VIEWPORT • DRONE PHOTOGRAMMETRY</span>
              </div>
              <div className="geo-story-telemetry-coords">
                LAT 18.5204° N • LON 73.8567° E | SPLIT: {Math.round(sliderPos)}% | EPSG:32643
              </div>
            </div>

            <div
              className="geo-story-slider-wrap"
              onMouseDown={() => setIsDraggingSlider(true)}
              onMouseUp={() => setIsDraggingSlider(false)}
              onMouseLeave={() => setIsDraggingSlider(false)}
              onMouseMove={handleSliderMove}
              onTouchMove={handleSliderMove}
              onClick={handleSliderMove}
            >
              {/* Corner HUD brackets */}
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />

              {/* Layer 1: Before (Raw UAV Imagery) */}
              <div
                className="geo-story-layer"
                style={{
                  backgroundImage: `url('${platformAerialImg}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              >
                <div className="geo-story-badge left">
                  BEFORE • RAW UAV PHOTOGRAPHY
                </div>

                {/* Raw Telemetry HUD Overlay */}
                <div className="geo-story-raw-tag">
                  <span>SENSOR: 3-BAND RGB PHOTOGRAMMETRY</span>
                  <span>UNCLASSIFIED RASTER • EPSG:32643</span>
                </div>
              </div>

              {/* Layer 2: After (AI Cadastral Intelligence) clipped by sliderPos */}
              <div
                className="geo-story-layer"
                style={{
                  clipPath: `polygon(${sliderPos}% 0, 100% 0, 100% 100%, ${sliderPos}% 100%)`,
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(3, 15, 30, 0.4), rgba(3, 7, 18, 0.9)), url('${platformAerialImg}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              >
                <div className="geo-story-badge right">
                  AFTER • AI CADASTRAL INTELLIGENCE
                </div>

                {/* Animated Geodetic Scanning Bar on Vector Side */}
                <div className="geo-story-laser-sweep" />

                {/* Vector overlay graphic on After side */}
                <svg viewBox="0 0 1000 500" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                  <defs>
                    <pattern id="storyGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 240, 255, 0.08)" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#storyGrid)" />

                  {/* Cadastral parcel polygons with dashed lines */}
                  <polygon points="200,80 500,90 480,420 180,400" fill="rgba(0, 240, 255, 0.18)" stroke="#00f0ff" strokeWidth="2.5" strokeDasharray="6 3" />
                  <polygon points="520,100 880,120 850,440 500,410" fill="rgba(0, 240, 255, 0.14)" stroke="#00f0ff" strokeWidth="2.5" strokeDasharray="6 3" />

                  {/* Parcel Vertex Anchor Nodes */}
                  <circle cx="200" cy="80" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                  <circle cx="500" cy="90" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                  <circle cx="480" cy="420" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                  <circle cx="180" cy="400" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />

                  <circle cx="520" cy="100" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                  <circle cx="880" cy="120" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />
                  <circle cx="850" cy="440" r="4" fill="#00f0ff" stroke="#030712" strokeWidth="1.5" />

                  {/* Building Footprints */}
                  <polygon points="260,160 420,170 400,320 240,300" fill="rgba(0, 240, 255, 0.55)" stroke="#00f0ff" strokeWidth="2" />
                  <rect x="270" y="190" width="130" height="24" rx="4" fill="rgba(4, 11, 20, 0.85)" stroke="#00f0ff" strokeWidth="1" />
                  <text x="280" y="206" fill="#00f0ff" fontSize="10" fontWeight="900">BLD-102 • 520m²</text>

                  <polygon points="580,180 780,190 760,340 560,320" fill="rgba(0, 240, 255, 0.55)" stroke="#00f0ff" strokeWidth="2" />
                  <rect x="590" y="210" width="130" height="24" rx="4" fill="rgba(4, 11, 20, 0.85)" stroke="#00f0ff" strokeWidth="1" />
                  <text x="600" y="226" fill="#00f0ff" fontSize="10" fontWeight="900">BLD-104 • 480m²</text>

                  {/* Road Centerline */}
                  <path d="M 0,250 Q 500,230 1000,260" fill="none" stroke="rgba(248, 250, 252, 0.6)" strokeWidth="2" strokeDasharray="8 6" />
                </svg>

                {/* Floating Technical Annotation Chips */}
                <div className="geo-story-annotation-chip top-right">
                  <span className="geo-dot-pulse" style={{ background: '#00f0ff', boxShadow: '0 0 8px #00f0ff' }} />
                  <span>TOPOLOGY: OGC SIMPLE FEATURES VALID</span>
                </div>
              </div>

              {/* Draggable Divider Handle */}
              <div className="geo-story-handle" style={{ left: `${sliderPos}%` }}>
                <div className="geo-story-handle-knob">
                  <SplitSquareHorizontal size={18} />
                </div>
              </div>
            </div>

            {/* Bottom Showcase Calibration Footer */}
            <div className="geo-story-calibration-footer">
              <div><span>DATUM:</span> WGS84 / UTM ZONE 43N</div>
              <div><span>ALGORITHM:</span> U-NET++ RESNET18 + SHAPELY HEALING</div>
              <div><span>OUTPUT:</span> CLEAN CADASTRAL POLYGONS</div>
            </div>
          </div>
        </section>

        {/* ========================================================
            13. CORE PILLARS / SCIENTIFIC & LEGAL RIGOR
            ======================================================== */}
        <section className="geo-section geo-section-alt-depth" style={{ background: 'rgba(5, 12, 24, 0.75)', borderTop: '1px solid rgba(0, 240, 255, 0.12)', borderBottom: '1px solid rgba(0, 240, 255, 0.12)' }}>
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">STANDARDS: SCIENTIFIC & LEGAL RIGOR</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          <div className="geo-section-header">
            <div className="geo-section-badge">
              <span className="geo-datum-tick">+</span>
              <span className="geo-datum-label">FOUNDATIONAL PRINCIPLES</span>
            </div>
            <p className="eyebrow">THE 4 CORE PILLARS</p>
            <h2 className="geo-section-title">ENGINEERED FOR SCIENTIFIC & LEGAL RIGOR</h2>
          </div>

          <motion.div
            className="geo-pillars-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.div className="geo-pillar-card" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-pillar-idx">01</div>
              <h3 className="geo-pillar-title">GEODETIC DETERMINISM</h3>
              <p className="geo-pillar-desc">
                Strict UTM/EPSG coordinate projections, georeferenced transforms, and zero pixel coordinate hallucination.
              </p>
            </motion.div>

            <motion.div className="geo-pillar-card" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-pillar-idx">02</div>
              <h3 className="geo-pillar-title">TOPOLOGICAL INTEGRITY</h3>
              <p className="geo-pillar-desc">
                OGC Simple Features compliance with automated Douglas-Peucker & Shapely polygon healing algorithms.
              </p>
            </motion.div>

            <motion.div className="geo-pillar-card" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-pillar-idx">03</div>
              <h3 className="geo-pillar-title">MULTI-MODEL CONSENSUS</h3>
              <p className="geo-pillar-desc">
                Cross-validation between U-Net++, YOLO11-Seg, and Mask R-CNN for high-confidence boundary extraction.
              </p>
            </motion.div>

            <motion.div className="geo-pillar-card" variants={itemVariants}>
              <div className="geo-corner-bracket tl" />
              <div className="geo-corner-bracket tr" />
              <div className="geo-corner-bracket bl" />
              <div className="geo-corner-bracket br" />
              <div className="geo-pillar-idx">04</div>
              <h3 className="geo-pillar-title">LEGAL CADASTRE READINESS</h3>
              <p className="geo-pillar-desc">
                Surveyor-ready audit logs, encroachment reports, and direct PostGIS enterprise persistence.
              </p>
            </motion.div>
          </motion.div>
        </section>

        {/* ========================================================
            14. EMPIRICAL MODEL EVALUATION
            ======================================================== */}
        <section id="models" className="geo-section geo-section-evaluation">
          {/* Section Divider Bar */}
          <div className="geo-section-divider-bar" aria-hidden="true">
            <span className="geo-divider-cross">+</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-tag">BENCHMARKS: HELD-OUT TILE 8</span>
            <span className="geo-divider-line" />
            <span className="geo-divider-cross">+</span>
          </div>

          {/* Section Header */}
          <div className="geo-section-header geo-eval-header">
            <div className="geo-eval-header-top">
              <span className="geo-eval-verified-badge">
                <span className="geo-eval-verified-dot" />
                TILE 8 VERIFIED
              </span>
              <span className="geo-eval-meta-tag">CRS: EPSG:32643</span>
              <span className="geo-eval-meta-tag">GSD: 2.4 CM/PX</span>
              <span className="geo-eval-meta-tag">PIXELS: 1,048,576</span>
            </div>
            <h2 className="geo-section-title">Empirical Model Evaluation on Drone Orthomosaics</h2>
            <p className="geo-section-desc">
              Evaluated on held-out Tile 8 UAV dataset (1,048,576 pixels) under strict geodetic metrics.
              Three architectures benchmarked on identical orthomosaic conditions.
            </p>
          </div>

          {/* Benchmark Scope Strip */}
          <div className="geo-eval-scope-strip">
            {[
              { label: 'DATASET', value: 'HELD-OUT TILE 8' },
              { label: 'EVALUATION SIZE', value: '1,048,576 PX' },
              { label: 'TASK', value: 'ORTHOMOSAIC SEGMENTATION' },
              { label: 'MODELS', value: '3 ARCHITECTURES' },
              { label: 'METRICS', value: 'IoU · Dice · Precision · Recall · Latency' },
            ].map((item) => (
              <div key={item.label} className="geo-eval-scope-item">
                <span className="geo-eval-scope-label">{item.label}</span>
                <span className="geo-eval-scope-value">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Metric Summary Cards */}
          <div className="geo-eval-summary-grid">
            {[
              { metric: 'IoU Score', champion: '0.4804', others: ['0.2041', '0.2582'], unit: '', note: 'Intersection over Union' },
              { metric: 'Dice (F1)', champion: '0.6409', others: ['0.3251', '0.4062'], unit: '', note: 'Harmonic mean of Precision & Recall' },
              { metric: 'Precision', champion: '0.5362', others: ['0.5280', '0.3789'], unit: '', note: 'True Positives / Predicted Positives' },
              { metric: 'Recall', champion: '0.8182', others: ['0.2372', '0.5330'], unit: '', note: 'True Positives / Actual Positives' },
              { metric: 'Latency', champion: '1.052', others: ['0.048', '15.910'], unit: 's', note: 'Per-tile inference time' },
            ].map((card) => {
              const champVal = parseFloat(card.champion)
              const allVals = [champVal, ...card.others.map(Number)]
              const maxVal = Math.max(...allVals)
              return (
                <div key={card.metric} className="geo-eval-metric-card">
                  <div className="geo-eval-metric-name">{card.metric}</div>
                  <div className="geo-eval-metric-champion">{card.champion}{card.unit}</div>
                  <div className="geo-eval-metric-note">{card.note}</div>
                  <div className="geo-eval-mini-bars">
                    {allVals.map((v, i) => {
                      const labels = ['U-Net++', 'YOLO11', 'Mask R-CNN']
                      const pct = maxVal > 0 ? (v / maxVal) * 100 : 0
                      return (
                        <div key={i} className="geo-eval-mini-bar-row">
                          <span className="geo-eval-mini-bar-label">{labels[i]}</span>
                          <div className="geo-eval-mini-bar-track">
                            <div
                              className={`geo-eval-mini-bar-fill ${i === 0 ? 'champion' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="geo-eval-mini-bar-val">{v}{card.unit}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Benchmark Table */}
          <div className="geo-table-wrap">
            <div className="geo-corner-bracket tl" />
            <div className="geo-corner-bracket tr" />
            <div className="geo-corner-bracket bl" />
            <div className="geo-corner-bracket br" />
            <table className="geo-table">
              <thead>
                <tr>
                  <th>MODEL ARCHITECTURE</th>
                  <th>OPERATIONAL ROLE</th>
                  <th className="geo-th-metric" title="Intersection over Union — measures overlap between predicted and ground-truth masks">
                    IOU SCORE <span className="geo-th-tooltip-icon">?</span>
                  </th>
                  <th className="geo-th-metric" title="Dice / F1 Score — harmonic mean of Precision and Recall">
                    DICE (F1) <span className="geo-th-tooltip-icon">?</span>
                  </th>
                  <th className="geo-th-metric" title="Precision — fraction of predicted pixels that are truly positive">
                    PRECISION <span className="geo-th-tooltip-icon">?</span>
                  </th>
                  <th className="geo-th-metric" title="Recall — fraction of actual positive pixels correctly detected">
                    RECALL <span className="geo-th-tooltip-icon">?</span>
                  </th>
                  <th className="geo-th-metric" title="Inference Latency — per-tile wall-clock time on standardized hardware">
                    LATENCY <span className="geo-th-tooltip-icon">?</span>
                  </th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {/* Champion row */}
                <tr className="champion">
                  <td><strong>U-Net++ (ResNet18)</strong></td>
                  <td><span className="geo-champion-tag">PRODUCTION CHAMPION</span></td>
                  <td className="geo-td-num">0.4804</td>
                  <td className="geo-td-num geo-td-best">0.6409</td>
                  <td className="geo-td-num">0.5362</td>
                  <td className="geo-td-num geo-td-best">0.8182</td>
                  <td className="geo-td-num">1.052 s</td>
                  <td className="geo-td-expand">
                    <span className="geo-expand-icon" title="Dense skip-connection encoder–decoder; highest IoU &amp; Recall on Tile 8">▾</span>
                  </td>
                </tr>
                <tr className="geo-row-detail champion-detail">
                  <td colSpan={8}>
                    <div className="geo-row-detail-inner">
                      <div className="geo-row-detail-item"><span>ROLE</span>Production segmentation engine — primary cadastral boundary extractor</div>
                      <div className="geo-row-detail-item"><span>IoU</span>0.4804 — best overlap on held-out Tile 8</div>
                      <div className="geo-row-detail-item"><span>Dice</span>0.6409 — highest F1 across all architectures</div>
                      <div className="geo-row-detail-item"><span>Recall</span>0.8182 — recovers most true parcel boundaries</div>
                      <div className="geo-row-detail-item"><span>Latency</span>1.052 s per tile — suitable for batch pipeline</div>
                    </div>
                  </td>
                </tr>

                {/* YOLO11-Seg row */}
                <tr>
                  <td>YOLO11-Seg</td>
                  <td className="geo-td-role">RAPID SCREENING</td>
                  <td className="geo-td-num">0.2041</td>
                  <td className="geo-td-num">0.3251</td>
                  <td className="geo-td-num">0.5280</td>
                  <td className="geo-td-num">0.2372</td>
                  <td className="geo-td-num geo-td-fast">0.048 s</td>
                  <td className="geo-td-expand">
                    <span className="geo-expand-icon" title="Ultralytics single-pass instance segmentation; fastest latency">▾</span>
                  </td>
                </tr>
                <tr className="geo-row-detail">
                  <td colSpan={8}>
                    <div className="geo-row-detail-inner">
                      <div className="geo-row-detail-item"><span>ROLE</span>Rapid screening — pre-filters large orthomosaic tiles for region-of-interest detection</div>
                      <div className="geo-row-detail-item"><span>Latency</span>0.048 s — fastest architecture (21× faster than U-Net++)</div>
                      <div className="geo-row-detail-item"><span>Precision</span>0.5280 — comparable precision to U-Net++; lower recall</div>
                      <div className="geo-row-detail-item"><span>Recall</span>0.2372 — misses more boundary pixels; used for coarse pass only</div>
                    </div>
                  </td>
                </tr>

                {/* Mask R-CNN row */}
                <tr>
                  <td>Mask R-CNN</td>
                  <td className="geo-td-role">INSTANCE BENCHMARK</td>
                  <td className="geo-td-num">0.2582</td>
                  <td className="geo-td-num">0.4062</td>
                  <td className="geo-td-num">0.3789</td>
                  <td className="geo-td-num">0.5330</td>
                  <td className="geo-td-num geo-td-slow">15.910 s</td>
                  <td className="geo-td-expand">
                    <span className="geo-expand-icon" title="Torchvision instance segmentation baseline; highest latency">▾</span>
                  </td>
                </tr>
                <tr className="geo-row-detail">
                  <td colSpan={8}>
                    <div className="geo-row-detail-inner">
                      <div className="geo-row-detail-item"><span>ROLE</span>Instance segmentation baseline — region-proposal architecture for object-level masks</div>
                      <div className="geo-row-detail-item"><span>Latency</span>15.910 s — slowest; 331× slower than YOLO11-Seg</div>
                      <div className="geo-row-detail-item"><span>IoU</span>0.2582 — second highest IoU; limited by latency for production use</div>
                      <div className="geo-row-detail-item"><span>Recall</span>0.5330 — moderate boundary recovery</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Interpretation Panel */}
          <div className="geo-eval-interp-strip">
            {[
              {
                role: 'PRODUCTION CHAMPION',
                model: 'U-Net++ (ResNet18)',
                color: '#00f0ff',
                desc: 'Highest IoU (0.4804) and Dice (0.6409). Deployed in the GeoCadastra production segmentation pipeline.',
              },
              {
                role: 'RAPID SCREENING',
                model: 'YOLO11-Seg',
                color: '#94a3b8',
                desc: 'Fastest inference (0.048 s). Used for coarse pre-filtering of large orthomosaic tiles before dense segmentation.',
              },
              {
                role: 'INSTANCE BENCHMARK',
                model: 'Mask R-CNN',
                color: '#64748b',
                desc: 'Region-proposal baseline. Highest latency (15.91 s); retained as a cross-validation reference architecture.',
              },
            ].map((item) => (
              <div key={item.role} className="geo-eval-interp-card">
                <div className="geo-eval-interp-role" style={{ color: item.color }}>{item.role}</div>
                <div className="geo-eval-interp-model">{item.model}</div>
                <p className="geo-eval-interp-desc">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Metric Definitions (collapsed by default via CSS) */}
          <details className="geo-eval-definitions">
            <summary className="geo-eval-definitions-toggle">
              <span className="geo-eval-def-icon">▸</span>
              METRIC DEFINITIONS
            </summary>
            <div className="geo-eval-definitions-body">
              {[
                { term: 'IoU (Intersection over Union)', def: 'Area of overlap between the predicted segmentation mask and the ground-truth mask, divided by their union. Range 0–1; higher is better.' },
                { term: 'Dice (F1 Score)', def: 'Harmonic mean of Precision and Recall. Computed as 2·(Precision × Recall) / (Precision + Recall). Sensitive to both false positives and false negatives.' },
                { term: 'Precision', def: 'Fraction of predicted positive pixels that are genuinely positive. High precision means few false boundary detections.' },
                { term: 'Recall', def: 'Fraction of actual positive pixels that are correctly detected. High recall means few missed boundary pixels.' },
                { term: 'Inference Latency', def: 'Wall-clock time to process one orthomosaic tile on standardized hardware. Measured in seconds per tile; lower is faster.' },
              ].map((d) => (
                <div key={d.term} className="geo-eval-def-row">
                  <span className="geo-eval-def-term">{d.term}</span>
                  <span className="geo-eval-def-body">{d.def}</span>
                </div>
              ))}
            </div>
          </details>
        </section>


        {/* ========================================================
            15. FINAL CTA
            ======================================================== */}
        <section className="geo-section geo-section-cta">
          <div className="geo-final-cta-panel">
            {/* Layered Dataset Background Atmosphere */}
            <div className="geo-final-cta-backdrop" aria-hidden="true">
              <div
                className="geo-final-cta-image"
                style={{ backgroundImage: `url(${heroDatasetImg})` }}
              />
              <div className="geo-final-cta-grade" />
              <div className="geo-final-cta-vignette" />
              <div className="geo-final-cta-grid" />
              <div className="geo-final-cta-glow" />
            </div>

            {/* Corner Brackets */}
            <div className="geo-corner-bracket tl" />
            <div className="geo-corner-bracket tr" />
            <div className="geo-corner-bracket bl" />
            <div className="geo-corner-bracket br" />

            <div style={{ position: 'relative', zIndex: 3 }}>
              <div className="geo-section-badge" style={{ margin: '0 auto 16px', width: 'fit-content' }}>
                <span className="geo-datum-tick">+</span>
                <span className="geo-datum-label">POSTGIS 16 • FASTAPI • RESNET18</span>
              </div>

              <p className="eyebrow" style={{ marginBottom: 12 }}>
                GEOCADASTRA GEOSPATIAL RESEARCH & ENGINEERING LAB
              </p>
              <h2 className="geo-final-cta-title">
                FASTER TO CREATE,<br />
                EASIER TO VERIFY,<br />
                AND HARDER TO GET WRONG.
              </h2>

              <div style={{ maxWidth: 680, margin: '0 auto 30px' }}>
                <strong style={{ display: 'block', color: '#00f0ff', fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  SEE WHAT GEOCADASTRA CAN DO FOR YOUR CADASTRAL WORKFLOW
                </strong>
                <p style={{ color: 'rgba(203, 213, 225, 0.85)', fontSize: '14px', lineHeight: 1.6 }}>
                  Explore the end-to-end processing pipeline or launch the enterprise command center.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="geo-btn-secondary geo-btn-cta-secondary"
                  onClick={() => navigate('/platform')}
                >
                  EXPLORE PLATFORM
                </button>
                <button
                  type="button"
                  className="geo-btn-primary geo-btn-cta-primary"
                  onClick={() => navigate(analysisRoute)}
                >
                  <span>ENTER COMMAND CENTER</span>
                  <span className="geo-btn-arrow">→</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================
          16. FOOTER
          ======================================================== */}
      <footer className="geo-footer-wrap">
        <div className="geo-footer-inner">
          <div className="geo-footer-grid">
            {/* Column 1: GeoCadastra Brand */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div className="geo-brand-icon">
                  <Boxes size={18} />
                </div>
                <strong style={{ fontSize: '16px', letterSpacing: '0.12em', color: '#ffffff' }}>GEOCADASTRA</strong>
              </div>
              <p style={{ fontSize: '12px', lineHeight: 1.7, color: 'rgba(148, 163, 184, 0.85)', marginBottom: 20, maxWidth: 320 }}>
                Advanced AI-Based Urban Parcel Mapping & Cadastral Feature Extraction System. Transforming raw aerial photography into authoritative spatial intelligence.
              </p>
              <div className="geo-status-pill">
                <span className="geo-dot-pulse" />
                <span>FASTAPI + POSTGIS ACTIVE</span>
              </div>
            </div>

            {/* Column 2: Platform */}
            <div>
              <h4 style={{ color: '#00f0ff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
                PLATFORM
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, fontSize: '12px', color: 'rgba(203, 213, 225, 0.8)' }}>
                <li><Link to={analysisRoute} style={{ color: 'inherit', textDecoration: 'none' }}>Analysis Studio</Link></li>
                <li><Link to={isAuthenticated ? '/map' : '/login?next=/map'} style={{ color: 'inherit', textDecoration: 'none' }}>GIS Map Viewer</Link></li>
                <li><Link to={isAuthenticated ? '/models' : '/login?next=/models'} style={{ color: 'inherit', textDecoration: 'none' }}>Model Hub</Link></li>
                <li><Link to={isAuthenticated ? '/about' : '/login?next=/about'} style={{ color: 'inherit', textDecoration: 'none' }}>Architecture</Link></li>
                <li><Link to={isAuthenticated ? '/dashboard' : '/login?next=/dashboard'} style={{ color: 'inherit', textDecoration: 'none' }}>Operator Dashboard</Link></li>
              </ul>
            </div>

            {/* Column 3: AI & GIS Stack */}
            <div>
              <h4 style={{ color: '#00f0ff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
                AI & GIS STACK
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, fontSize: '12px', color: 'rgba(203, 213, 225, 0.8)' }}>
                <li>U-Net++ (ResNet18)</li>
                <li>YOLO11-Seg (Ultralytics)</li>
                <li>Mask R-CNN (Torchvision)</li>
                <li>Rasterio & GDAL</li>
                <li>Douglas-Peucker & Shapely</li>
                <li>PostgreSQL & PostGIS</li>
              </ul>
            </div>

            {/* Column 4: Geospatial Specs */}
            <div>
              <h4 style={{ color: '#00f0ff', fontSize: '11px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
                GEOSPATIAL SPECS
              </h4>
              <div style={{ display: 'grid', gap: 8, fontSize: '11px', color: 'rgba(203, 213, 225, 0.8)' }}>
                <div>Coordinate System: <strong>WGS84 (EPSG:4326)</strong></div>
                <div>Projected CRS: <strong>Dynamic UTM (EPSG:326XX)</strong></div>
                <div>Raster Formats: <strong>GeoTIFF, COG, UAV Mosaic</strong></div>
                <div>Vector Exports: <strong>GeoJSON, Shapefile, CSV</strong></div>
                <div style={{ color: '#10b981', fontWeight: 700 }}>Zero Coordinate Fabrication Policy</div>
              </div>
            </div>
          </div>

          <div className="geo-footer-bottom">
            <div>
              © 2026 GEOCADASTRA • AI-POWERED CADASTRAL INTELLIGENCE PLATFORM
            </div>
            <div style={{ fontFamily: 'monospace', color: '#00f0ff' }}>
              CRS: EPSG:32643 • GSD: 2.4CM/PX • HELD-OUT TILE 8 VERIFIED
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
