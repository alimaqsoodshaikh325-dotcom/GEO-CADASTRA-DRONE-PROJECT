import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Box,
  Building2,
  CheckCircle2,
  ChevronDown,
  Compass,
  Crosshair,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  FileSpreadsheet,
  FolderArchive,
  Globe,
  Grid,
  HelpCircle,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minus,
  Minimize2,
  Navigation,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Ruler,
  Scan,
  ScanLine,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  X
} from 'lucide-react'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../services/api'
import { useJob } from '../hooks/useJob'
import { useDemo } from '../hooks/useDemo'
import { demoData } from '../data/demoData'
import PageHeader from '../components/common/PageHeader'
import StatusBadge from '../components/common/StatusBadge'
import Geospatial3DCanvas from '../components/maps/Geospatial3DCanvas'
import './MapPage.css'

/* ─── Leaflet Event Tracker ────────────────────────────────────────────────── */
function MapEvents({ onMouseMove }) {
  useMapEvents({
    mousemove(e) {
      if (onMouseMove) onMouseMove(e.latlng)
    },
  })
  return null
}

/* ─── Leaflet Bounds Auto-Fitter ───────────────────────────────────────────── */
function MapReset({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [36, 36] })
    }
  }, [bounds, map])
  return null
}

function MapSizeInvalidator({ fullscreen }) {
  const map = useMap()
  useEffect(() => {
    const resize = () => window.requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    const observer = new ResizeObserver(resize)
    observer.observe(map.getContainer())
    window.addEventListener('resize', resize)
    resize()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [map, fullscreen])
  return null
}

function polygonRings(feature) {
  let rings = []
  if (feature?.geometry?.type === 'Polygon' && Array.isArray(feature.geometry.coordinates)) {
    rings = feature.geometry.coordinates
  }
  if (feature?.geometry?.type === 'MultiPolygon' && Array.isArray(feature.geometry.coordinates)) {
    rings = feature.geometry.coordinates.flat()
  }
  return Array.isArray(rings) ? rings.filter((ring) =>
    Array.isArray(ring) &&
    ring.length >= 3 &&
    ring.every((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
  ) : []
}

function isRenderableFeature(feature) {
  return feature?.type === 'Feature' && polygonRings(feature).length > 0
}

function geometryPoints(geometry) {
  const points = []
  const visit = (value) => {
    if (!Array.isArray(value)) return
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      points.push(value)
      return
    }
    value.forEach(visit)
  }
  visit(geometry?.coordinates)
  return points
}

/* ─── Pixel-Space 2D SVG Canvas ────────────────────────────────────────────── */
function PixelViewer2D({
  features = [],
  parcels = [],
  reviewFeatures = [],
  imageUrl = null,
  maskUrl = null,
  imageDimensions = null,
  showMask = false,
  onImageLoad = () => {},
  onImageError = () => {},
  selected = null,
  onPick = () => {},
  isolated = false,
  showBuildings = true,
  showParcels = true,
  showReview = false,
  resetKey = 0,
  onMouseMove = () => {}
}) {
  const points = useMemo(() => features.flatMap((feature) => polygonRings(feature).flat()), [features])
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const panRef = useRef(null)
  const viewWidth = imageDimensions?.width || 1000
  const viewHeight = imageDimensions?.height || 650

  const bounds = useMemo(() => {
    if (!points.length) {
      return imageDimensions
        ? { minX: 0, maxX: imageDimensions.width, minY: 0, maxY: imageDimensions.height }
        : imageUrl
          ? { minX: 0, maxX: 1000, minY: 0, maxY: 650 }
          : null
    }
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  }, [points, imageDimensions, imageUrl])

  useEffect(() => {
    if (!selected || !bounds) return
    const selectedPoints = geometryPoints(selected.geometry)
    if (!selectedPoints.length) return
    const centerX = selectedPoints.reduce((sum, point) => sum + point[0], 0) / selectedPoints.length
    const centerY = selectedPoints.reduce((sum, point) => sum + point[1], 0) / selectedPoints.length
    const w = Math.max(bounds.maxX - bounds.minX, 1)
    const h = Math.max(bounds.maxY - bounds.minY, 1)
    const canvasX = imageDimensions ? centerX : 50 + ((centerX - bounds.minX) / w) * 900
    const canvasY = imageDimensions ? centerY : 50 + ((centerY - bounds.minY) / h) * 550
    const nextZoom = 2.5
    setZoom(nextZoom)
    setOffset({ x: -(canvasX - viewWidth / 2) * nextZoom, y: -(canvasY - viewHeight / 2) * nextZoom })
  }, [selected, bounds, imageDimensions, viewWidth, viewHeight])

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [resetKey])

  if (!points.length && !imageUrl) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#8E9FA9', background: '#0E1C28' }}>
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <Layers size={36} style={{ color: '#00C7B7', margin: '0 auto 10px', opacity: 0.6 }} />
          <strong style={{ color: '#FFFFFF', display: 'block', fontSize: '14px', marginBottom: '4px' }}>
            No Vector Coordinates in Current Pixel Output
          </strong>
          <span style={{ fontSize: '12px', color: '#8E9FA9' }}>
            Select an analysis job with vectorized building contours to view pixel footprint geometry.
          </span>
        </div>
      </div>
    )
  }

  const { minX, maxX, minY, maxY } = bounds
  const w = Math.max(maxX - minX, 1)
  const h = Math.max(maxY - minY, 1)
  const projectPoint = ([x, y]) => imageDimensions
    ? [x, y]
    : [50 + ((x - minX) / w) * 900, 50 + ((y - minY) / h) * 550]

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', background: '#0E1C28' }}
      onMouseMove={(e) => {
        if (!imageDimensions && !points.length && imageUrl) {
          onMouseMove(null)
          return
        }
        const rect = e.currentTarget.querySelector('svg')?.getBoundingClientRect()
        if (!rect?.width || !rect?.height) return
        const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight)
        const renderedWidth = viewWidth * scale
        const renderedHeight = viewHeight * scale
        const canvasX = (e.clientX - rect.left - (rect.width - renderedWidth) / 2) / scale
        const canvasY = (e.clientY - rect.top - (rect.height - renderedHeight) / 2) / scale
        const baseX = (canvasX - viewWidth / 2 - offset.x) / zoom + viewWidth / 2
        const baseY = (canvasY - viewHeight / 2 - offset.y) / zoom + viewHeight / 2
        if (imageDimensions && (baseX < 0 || baseY < 0 || baseX > viewWidth || baseY > viewHeight)) {
          onMouseMove(null)
          return
        }
        const px = Math.round(imageDimensions ? baseX : minX + ((baseX - 50) / 900) * w)
        const py = Math.round(imageDimensions ? baseY : minY + ((baseY - 50) / 550) * h)
        onMouseMove({ x: px, y: py })
      }}
      onWheel={(event) => {
        event.preventDefault()
        setZoom((current) => Math.max(1, Math.min(8, current + (event.deltaY < 0 ? .2 : -.2))))
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest('path, button'))) return
        panRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!panRef.current || event.buttons !== 1) return
        const rect = event.currentTarget.querySelector('svg')?.getBoundingClientRect()
        if (!rect?.width || !rect?.height) return
        const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight)
        setOffset({
          x: panRef.current.offsetX + (event.clientX - panRef.current.x) / scale,
          y: panRef.current.offsetY + (event.clientY - panRef.current.y) / scale,
        })
      }}
      onPointerUp={() => { panRef.current = null }}
    >
      <div className="map-pixel-controls">
        <button type="button" onClick={() => setZoom((current) => Math.min(8, current + .25))} aria-label="Zoom in pixel view" title="Zoom in"><Plus size={14} /></button>
        <button type="button" onClick={() => setZoom((current) => Math.max(1, current - .25))} aria-label="Zoom out pixel view" title="Zoom out"><Minus size={14} /></button>
        <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }} aria-label="Reset pixel view" title="Fit and reset"><RotateCcw size={13} /></button>
      </div>
      <svg
        style={{ width: '100%', height: '100%', display: 'block' }}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={imageUrl ? 'Pixel-space image and feature viewer' : 'Pixel-space feature viewer'}
      >
        <defs>
          <pattern id="pixelGrid2D" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(216, 226, 232, 0.05)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={viewWidth} height={viewHeight} fill="url(#pixelGrid2D)" />

        <g transform={`translate(${offset.x} ${offset.y}) translate(${viewWidth / 2} ${viewHeight / 2}) scale(${zoom}) translate(${-viewWidth / 2} ${-viewHeight / 2})`}>
        {imageUrl && <image href={imageUrl} x="0" y="0" width={viewWidth} height={viewHeight} preserveAspectRatio="xMidYMid meet" onLoad={onImageLoad} onError={onImageError} />}
        {showMask && maskUrl && <image href={maskUrl} x="0" y="0" width={viewWidth} height={viewHeight} preserveAspectRatio="xMidYMid meet" opacity=".42" pointerEvents="none" />}
        {showParcels && parcels.map((feature, index) => polygonRings(feature).map((ring, ringIndex) => {
          const path = ring.map((point, pointIndex) => {
            const [x, y] = projectPoint(point)
            return `${pointIndex ? 'L' : 'M'} ${x} ${y}`
          }).join(' ') + ' Z'
          if (isolated && featureId(feature) !== featureId(isolated)) return null
          return (
            <path
              key={`${feature.id || index}-${ringIndex}`}
              d={path}
              fill="rgba(118, 87, 232, .06)"
              stroke="#7657E8"
              strokeWidth="1.5"
              opacity=".7"
              onClick={() => onPick(feature)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onPick(feature)
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Select parcel ${featureId(feature) || 'with unavailable ID'}`}
            >
              <title>{`Parcel ${featureId(feature) || 'ID not available'}`}</title>
            </path>
          )
        }))}

        {showReview && reviewFeatures.map((feature, index) => polygonRings(feature).map((ring, ringIndex) => {
          const path = ring.map((point, pointIndex) => {
            const [x, y] = projectPoint(point)
            return `${pointIndex ? 'L' : 'M'} ${x} ${y}`
          }).join(' ') + ' Z'
          if (isolated && featureId(feature) !== featureId(isolated)) return null
          return (
            <path
              key={`review-${featureId(feature) || index}-${ringIndex}`}
              d={path}
              fill="rgba(245, 158, 11, .12)"
              stroke="#F59E0B"
              strokeWidth="2.5"
              strokeDasharray="5 3"
              onClick={() => onPick(feature)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onPick(feature)
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Select review flag for ${featureId(feature) || 'feature with unavailable ID'}`}
            >
              <title>{`Review ${feature.properties?.exception_type || ''} · ${featureId(feature) || 'ID not available'}`}</title>
            </path>
          )
        }))}

        {/* Buildings Layer */}
        {showBuildings &&
          features.map((f, i) => {
            const rings = polygonRings(f)
            const bId = f.properties?.building_id || f.building_id || f.id || `feature-${i}`
            const confidence = f.properties?.confidence ?? f.confidence
            const isSel = selected && (selected === f || selected.properties?.building_id === bId || selected.id === f.id)
            const isDimmed = isolated && featureId(f) !== featureId(isolated)

            const path = rings.map((ring) => ring.map((point, j) => {
              const [x, y] = projectPoint(point)
              return `${j ? 'L' : 'M'} ${x} ${y}`
            }).join(' ') + ' Z').join(' ')

            const strokeColor = isSel ? '#FFFFFF' : '#00C7B7'
            const fillColor = isSel
              ? 'rgba(0, 214, 192, 0.65)'
              : isDimmed
              ? 'rgba(255, 255, 255, 0.04)'
              : 'rgba(0, 199, 183, 0.25)'

            return (
              <path
                key={bId}
                d={path}
                onClick={() => onPick(f)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onPick(f)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Select building ${featureId(f) || 'with unavailable ID'}`}
                fill={fillColor}
                fillRule="evenodd"
                stroke={strokeColor}
                strokeWidth={isSel ? '2.5' : '1.5'}
                style={{ cursor: 'pointer', transition: 'all 0.14s ease' }}
                opacity={isDimmed ? 0.2 : 1}
              >
                {featureId(f) && <title>{`Building ${featureId(f)}${confidence != null ? ` · Confidence ${(Number(confidence) * 100).toFixed(1)}%` : ''}`}</title>}
              </path>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

const featureId = (feature) => {
  const properties = feature?.properties || {}
  return properties.building_id || properties.parcel_id || feature?.id || null
}

function safeBackendMessage(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message.trim() : ''
  if (!message) return fallback
  if (/(?:[A-Za-z]:[\\/]|\\\\|(?:^|\s)\/(?:[^/\s]+\/){2,}|DATABASE_URL|JWT(?:_SECRET)?|password|secret)/i.test(message)) {
    return fallback
  }
  return message
}

function reviewFeature(review) {
  const feature = review?.geometry
  if (!isRenderableFeature(feature)) return null
  return {
    ...feature,
    properties: {
      ...(feature.properties || {}),
      ...(review.building_id ? { building_id: review.building_id } : {}),
      ...(review.parcel_id ? { parcel_id: review.parcel_id } : {}),
      ...(review.review_id ? { review_id: review.review_id } : {}),
      ...(review.exception_type ? { exception_type: review.exception_type } : {}),
      ...(review.status ? { review_status: review.status } : {}),
      ...(review.decision ? { review_decision: review.decision } : {}),
      ...(review.notes ? { review_notes: review.notes } : {}),
      ...(review.confidence != null ? { confidence: review.confidence } : {}),
      ...(review.area_m2 != null ? { area_m2: review.area_m2 } : {}),
      ...(review.perimeter_m != null ? { perimeter_m: review.perimeter_m } : {}),
      ...(review.coordinate_space ? { coordinate_space: review.coordinate_space } : {}),
      ...(review.crs ? { source_crs: review.crs } : {}),
    },
  }
}

function findAssociatedParcelId(csv, buildingId) {
  if (!csv || !buildingId) return null
  const [headerLine, ...rows] = String(csv).split(/\r?\n/).filter(Boolean)
  if (!headerLine) return null
  const headers = headerLine.split(',').map((header) => header.trim())
  const buildingIndex = headers.indexOf('building_id')
  const parcelIndex = headers.indexOf('parcel_id')
  if (buildingIndex < 0 || parcelIndex < 0) return null
  const row = rows.map((line) => line.split(',').map((value) => value.trim()))
    .find((values) => values[buildingIndex] === String(buildingId))
  return row?.[parcelIndex] || null
}

const coordinateSpace = (features, result) => {
  const crs = result?.crs || result?.coordinate_reference_system ||
    result?.source_crs ||
    features.find((feature) => feature.properties?.source_crs)?.properties?.source_crs ||
    features.find((feature) => feature.properties?.crs)?.properties?.crs ||
    null
  const reported = String(
    result?.coordinate_space ||
    features.find((feature) => feature.properties?.coordinate_space)?.properties?.coordinate_space ||
    ''
  ).toLowerCase()
  if (reported.includes('pixel')) return { kind: 'pixel', crs: null }
  const normalizedCrs = typeof crs === 'number'
    ? `EPSG:${crs}`
    : String(crs || '').trim().toUpperCase()
  if (reported.includes('geographic') || ['EPSG:4326', 'CRS:84'].includes(normalizedCrs)) {
    return { kind: 'geographic', crs }
  }
  if (crs) return { kind: 'projected', crs }
  return { kind: 'unknown', crs: null }
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT: MapPage (GeoAI Operations Workstation)
   ══════════════════════════════════════════════════════════════════════════════ */
export default function MapPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { jobId, setJobId } = useJob()
  const { isDemo, toggleDemo } = useDemo()
  const workstationRef = useRef(null)
  const downloadDropdownRef = useRef(null)
  const demoDropdownRef = useRef(null)
  const requestIdRef = useRef(0)

  /* Core Data State */
  const [health, setHealth] = useState(null)
  const [postgisInfo, setPostgisInfo] = useState(null)
  const [historyJobs, setHistoryJobs] = useState([])
  const [buildings, setBuildings] = useState([])
  const [buildingRecordCount, setBuildingRecordCount] = useState(null)
  const [parcels, setParcels] = useState([])
  const [parcelResults, setParcelResults] = useState(null)
  const [resultsSummary, setResultsSummary] = useState(null)
  const [reviewRecords, setReviewRecords] = useState([])
  const [reviewTotal, setReviewTotal] = useState(null)
  const [reviewLoadState, setReviewLoadState] = useState('idle')
  const [jobImageArtifact, setJobImageArtifact] = useState(null)
  const [jobImageDimensions, setJobImageDimensions] = useState(null)
  const [jobImageError, setJobImageError] = useState('')
  const [jobImageAttempt, setJobImageAttempt] = useState(0)
  const [projectAerialMetadata, setProjectAerialMetadata] = useState(null)
  const [projectAerialError, setProjectAerialError] = useState('')
  const [projectAerialMetadataAttempt, setProjectAerialMetadataAttempt] = useState(0)
  const [projectAerialImageError, setProjectAerialImageError] = useState('')
  const [projectAerialLoaded, setProjectAerialLoaded] = useState(false)
  const [projectAerialAttempt, setProjectAerialAttempt] = useState(0)
  const [demoRegistry, setDemoRegistry] = useState(null)
  const [demoRecord, setDemoRecord] = useState(null)
  const [demoMode, setDemoMode] = useState(Boolean(isDemo))
  const [demoSearch, setDemoSearch] = useState('')

  useEffect(() => {
    if (isDemo === demoMode) return

    setDemoMode(isDemo)

    if (isDemo) {
      if (!demoRecord && !jobId) {
        const defaultRecord = {
          ...demoData.analysisSummary,
          id: 'demo-pune-default',
          filename: 'aerial_pune_sih2026.tif',
          split: 'demo',
          split_label: 'Demo split',
          dimensions: '1024 × 768',
          format: 'GeoTIFF',
          validation: 'VALID',
          mask_available: false,
        }
        setDemoRecord(defaultRecord)
        setViewMode('PIXEL')
      }
      return
    }

    if (demoRecord) {
      setDemoRecord(null)
      setViewMode('2D')
    }
  }, [isDemo, demoMode, demoRecord, jobId])
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [demoImageLoaded, setDemoImageLoaded] = useState(false)
  const [demoImageError, setDemoImageError] = useState('')
  const [demoImageAttempt, setDemoImageAttempt] = useState(0)
  const [demoImageDimensions, setDemoImageDimensions] = useState(null)
  const [showDemoMask, setShowDemoMask] = useState(false)
  const [inspectorTab, setInspectorTab] = useState('OVERVIEW') // 'OVERVIEW'|'GEOMETRY'|'CADASTRAL'|'AI ANALYSIS'|'DATA'
  const [showGeomModal, setShowGeomModal] = useState(false)
  const leafletMapRef = useRef(null)

  /* Active Workspace Controls */
  const [viewMode, setViewMode] = useState('2D') // '2D' | '3D' | 'PIXEL' | 'AERIAL'
  const [pixelResetKey, setPixelResetKey] = useState(0)
  const [cameraCommand, setCameraCommand] = useState(null)
  const [baseMap, setBaseMap] = useState('osm') // 'osm' | 'satellite' | 'terrain' | 'aerial' | 'vector'
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [isolatedFeature, setIsolatedFeature] = useState(null)

  /* Layer Visibility */
  const [showBuildings, setShowBuildings] = useState(true)
  const [showParcels, setShowParcels] = useState(true)
  const [showReviewFlags, setShowReviewFlags] = useState(false)

  /* Search & Tool State */
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFeedback, setSearchFeedback] = useState('')
  const [cursorPos, setCursorPos] = useState(null)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  /* Geolocation State */
  const [userLocation, setUserLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('IDLE') // 'IDLE' | 'LOCATING' | 'AVAILABLE' | 'DENIED'
  const [locationError, setLocationError] = useState('')

  /* Visual Spatial Scanner State */
  const [scanState, setScanState] = useState('OFF') // 'OFF' | 'SCANNING' | 'PAUSED'
  const toggleScanner = () => {
    setScanState((prev) => {
      if (prev === 'OFF') return 'SCANNING'
      if (prev === 'SCANNING') return 'PAUSED'
      return 'SCANNING'
    })
  }
  const resetScanner = () => setScanState('OFF')

  /* Zoom Control Helpers */
  const zoomInMap = () => {
    if (leafletMapRef.current) {
      try {
        leafletMapRef.current.zoomIn()
      } catch {
        // fallback
      }
    }
  }
  const zoomOutMap = () => {
    if (leafletMapRef.current) {
      try {
        leafletMapRef.current.zoomOut()
      } catch {
        // fallback
      }
    }
  }

  /* Loading / Error */
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const jobImageUrl = jobImageArtifact && jobId
    ? `${api.getArtifactUrl(jobId, jobImageArtifact)}?attempt=${jobImageAttempt}`
    : null
  const projectAerialUrl = `${api.getProjectAerialPreviewUrl()}?attempt=${projectAerialAttempt}`

  /* ─ Load Real Backend Data ─ */
  useEffect(() => {
    const routeJobId = searchParams.get('job')
    if (routeJobId && routeJobId !== jobId) setJobId(routeJobId)
  }, [searchParams, jobId, setJobId])

  useEffect(() => {
    let active = true
    api.getProjectAerialMetadata()
      .then((metadata) => {
        if (!active) return
        setProjectAerialMetadata(metadata)
        setProjectAerialError('')
      })
      .catch((requestError) => {
        if (!active) return
        setProjectAerialMetadata(null)
        setProjectAerialError(safeBackendMessage(requestError, 'Project aerial metadata is unavailable.'))
      })
    return () => { active = false }
  }, [projectAerialMetadataAttempt])

  const openDemoSelector = async () => {
    setDemoOpen((open) => !open)
    setDemoError('')
    if (demoRegistry || demoLoading) return
    setDemoLoading(true)
    try {
      const registry = await api.getDatasetRegistry()
      if (!Array.isArray(registry?.records)) throw new Error('Dataset registry returned an invalid response.')
      setDemoRegistry(registry)
    } catch (requestError) {
      setDemoError(safeBackendMessage(requestError, 'Dataset registry is unavailable.'))
    } finally {
      setDemoLoading(false)
    }
  }

  const activateDemoMode = (nextRecord = null) => {
    const record = nextRecord || demoRecord || { ...demoData.analysisSummary, id: 'demo-pune-default', filename: 'aerial_pune_sih2026.tif', split: 'demo', split_label: 'Demo split', dimensions: '1024 × 768', format: 'GeoTIFF', validation: 'VALID', mask_available: false }
    setDemoRecord(record)
    setDemoMode(true)
    setDemoOpen(false)
    setDemoError('')
    setSelectedFeature(null)
    setIsolatedFeature(null)
    setShowGeomModal(false)
    setInspectorTab('OVERVIEW')
    setSearchQuery('')
    setSearchFeedback('')
    setViewMode('PIXEL')
    setShowBuildings(true)
    setShowParcels(true)
    setShowReviewFlags(false)
    setPixelResetKey((value) => value + 1)
  }

  const deactivateDemoMode = () => {
    setDemoMode(false)
    setDemoRecord(null)
    setDemoOpen(false)
    setDemoError('')
    setSelectedFeature(null)
    setIsolatedFeature(null)
    setShowGeomModal(false)
    setInspectorTab('OVERVIEW')
    setSearchQuery('')
    setSearchFeedback('')
    setShowBuildings(true)
    setShowParcels(true)
    setShowReviewFlags(false)
    setViewMode('2D')
    setPixelResetKey((value) => value + 1)
  }

  const selectDemoDataset = (record) => {
    if (jobId) {
      setDemoError('Dataset preview is unavailable while a live job is selected.')
      return
    }
    if (!record?.filename || !record?.split) {
      setDemoError('This dataset record is missing its image reference.')
      return
    }
    requestIdRef.current += 1
    setDemoMode(true)
    setDemoRecord(record)
    setBuildings([])
    setBuildingRecordCount(null)
    setParcels([])
    setParcelResults(null)
    setResultsSummary(null)
    setReviewRecords([])
    setReviewTotal(null)
    setReviewLoadState('idle')
    setJobImageArtifact(null)
    setJobImageDimensions(null)
    setJobImageError('')
    setDemoImageLoaded(false)
    setDemoImageError('')
    setDemoImageAttempt((attempt) => attempt + 1)
    setDemoImageDimensions(
      Number.isFinite(record.width) && Number.isFinite(record.height)
        ? { width: record.width, height: record.height }
        : null
    )
    setShowDemoMask(false)
    setSelectedFeature(null)
    setIsolatedFeature(null)
    setShowGeomModal(false)
    setInspectorTab('OVERVIEW')
    setSearchQuery('')
    setSearchFeedback('')
    setViewMode('PIXEL')
    setDemoOpen(false)
  }

  const clearDemoDataset = () => {
    setDemoRecord(null)
    setDemoImageLoaded(false)
    setDemoImageError('')
    setDemoImageDimensions(null)
    setShowDemoMask(false)
    setSelectedFeature(null)
    setIsolatedFeature(null)
    setShowGeomModal(false)
    setInspectorTab('OVERVIEW')
    setSearchQuery('')
    setViewMode('2D')
  }

  const selectAnalysisJob = (nextJobId) => {
    if (demoRecord) clearDemoDataset()
    setJobId(nextJobId || null)
    const nextParams = new URLSearchParams(searchParams)
    if (nextJobId) nextParams.set('job', nextJobId)
    else nextParams.delete('job')
    setSearchParams(nextParams)
  }

  const reload = async () => {
    const requestId = ++requestIdRef.current
    setError('')
    setLoading(true)
    if (demoRecord) {
      setDemoImageLoaded(false)
      setDemoImageError('')
      setDemoImageAttempt((attempt) => attempt + 1)
    }
    if (!demoRecord) {
      setViewMode('2D')
      setBuildings([])
      setBuildingRecordCount(null)
      setParcels([])
      setParcelResults(null)
      setResultsSummary(null)
      setReviewRecords([])
      setReviewTotal(null)
      setReviewLoadState(jobId ? 'loading' : 'idle')
      setJobImageArtifact(null)
      setJobImageDimensions(null)
      setJobImageError('')
      setSelectedFeature(null)
    }
    const [healthResult, postgisResult, historyResult] = await Promise.allSettled([
      api.getHealth(),
      api.getPostgisStatus(),
      api.getHistory(),
    ])
    if (requestId !== requestIdRef.current) return
    setHealth(healthResult.status === 'fulfilled' ? healthResult.value : null)
    setPostgisInfo(postgisResult.status === 'fulfilled' ? postgisResult.value : null)
    if (historyResult.status === 'fulfilled') {
      const returnedHistory = Array.isArray(historyResult.value?.history) ? historyResult.value.history : []
      setHistoryJobs(returnedHistory)
    } else {
      setHistoryJobs([])
      if (!jobId) setError(safeBackendMessage(historyResult.reason, 'Unable to load available analysis jobs.'))
    }
    if (demoRecord) {
      setLoading(false)
      return
    }
    if (!jobId) {
      setBuildings([])
      setBuildingRecordCount(null)
      setParcels([])
      setParcelResults(null)
      setResultsSummary(null)
      setReviewRecords([])
      setReviewTotal(null)
      setReviewLoadState('idle')
      setSelectedFeature(null)
      setViewMode('2D')
      setLoading(false)
      return
    }

    const selectedJob = historyResult.status === 'fulfilled'
      ? historyResult.value?.history?.find((job) => job.job_id === jobId)
      : null

    try {
      const status = await api.getJobStatus(jobId)
      if (requestId !== requestIdRef.current) return
      const jobStatus = String(status?.status || selectedJob?.status || '').toLowerCase()
      if (!['completed', 'complete'].includes(jobStatus)) {
        setBuildings([])
        setBuildingRecordCount(null)
        setParcels([])
        setParcelResults(null)
        setResultsSummary({ ...status, status: status?.status || selectedJob?.status || 'NOT AVAILABLE' })
        setReviewRecords([])
        setReviewTotal(null)
        setReviewLoadState('idle')
        setSelectedFeature(null)
        setViewMode('2D')
        setLoading(false)
        return
      }

      const [buildingResult, parcelResult, result, reviewResult] = await Promise.allSettled([
        api.getBuildings(jobId),
        api.getParcels(jobId),
        api.getResults(jobId),
        api.getReviewQueue(jobId),
      ])
      if (requestId !== requestIdRef.current) return
      const featureArray = (value) => {
        if (Array.isArray(value)) return value.filter(isRenderableFeature)
        if (value?.type === 'FeatureCollection' && Array.isArray(value.features)) {
          return value.features.filter(isRenderableFeature)
        }
        return []
      }
      const returnedBuildingRecords = buildingResult.status === 'fulfilled'
        ? Array.isArray(buildingResult.value?.buildings) ? buildingResult.value.buildings : null
        : null
      const buildingFeatures = returnedBuildingRecords
        ? featureArray(returnedBuildingRecords)
        : []
      const returnedParcelValue = parcelResult.status === 'fulfilled' ? parcelResult.value?.parcels : null
      const parcelFeatures = featureArray(returnedParcelValue)
      setBuildings(buildingFeatures)
      setBuildingRecordCount(returnedBuildingRecords?.length ?? null)
      setParcels(parcelFeatures)
      setParcelResults(returnedParcelValue)
      const resultValue = result.status === 'fulfilled' ? result.value : null
      const nextSummary = { ...(resultValue || {}), ...(resultValue?.summary || {}), status: resultValue?.status || status?.status }
      setResultsSummary(nextSummary)
      const returnedReviews = reviewResult.status === 'fulfilled' && Array.isArray(reviewResult.value?.reviews)
        ? reviewResult.value.reviews
        : null
      setReviewRecords(returnedReviews || [])
      const returnedReviewTotal = reviewResult.status === 'fulfilled' && reviewResult.value.total != null
        ? Number(reviewResult.value.total)
        : NaN
      setReviewTotal(returnedReviews
        ? Number.isFinite(returnedReviewTotal) ? returnedReviewTotal : returnedReviews.length
        : null)
      setReviewLoadState(returnedReviews ? 'loaded' : 'error')
      const outputFiles = Array.isArray(resultValue?.output_files) ? resultValue.output_files : []
      const inputPreview = outputFiles.find(
        (filename) => String(filename).replace(/\\/g, '/').toLowerCase() === 'visualizations/input.png'
      )
      setJobImageArtifact(inputPreview ? 'visualizations/input.png' : null)
      setJobImageError('')
      const resultSpace = coordinateSpace([...buildingFeatures, ...parcelFeatures], nextSummary)
      if (resultSpace.kind === 'pixel') setViewMode('PIXEL')
      else if (resultSpace.kind === 'geographic') setViewMode('2D')
      setSelectedFeature((current) => {
        const currentId = featureId(current)
        return currentId
          ? buildingFeatures.find((feature) => featureId(feature) === currentId) ||
            parcelFeatures.find((feature) => featureId(feature) === currentId) || null
          : null
      })
      const partialErrors = [
        buildingResult.status === 'rejected'
          ? `Building layer unavailable: ${safeBackendMessage(buildingResult.reason, 'request failed')}`
          : !returnedBuildingRecords ? 'Building endpoint returned an unsupported response.' : '',
        parcelResult.status === 'rejected' ? `Parcel data unavailable: ${safeBackendMessage(parcelResult.reason, 'request failed')}` : '',
        result.status === 'rejected' ? `Result metadata unavailable: ${safeBackendMessage(result.reason, 'request failed')}` : '',
        reviewResult.status === 'rejected'
          ? `Review data unavailable: ${safeBackendMessage(reviewResult.reason, 'request failed')}`
          : !returnedReviews ? 'Review endpoint returned an unsupported response.' : '',
      ].filter(Boolean)
      setError(partialErrors.join(' · '))
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return
      setBuildings([])
      setBuildingRecordCount(null)
      setParcels([])
      setParcelResults(null)
      setResultsSummary(null)
      setReviewRecords([])
      setReviewTotal(null)
      setReviewLoadState('error')
      setJobImageArtifact(null)
      setSelectedFeature(null)
      setError(safeBackendMessage(requestError, 'Unable to load the selected analysis from the backend.'))
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    return () => { requestIdRef.current += 1 }
  }, [jobId, demoRecord?.id])

  useEffect(() => {
    if (demoRecord || viewMode !== 'PIXEL' || !jobImageUrl) return undefined
    let active = true
    setJobImageError('')
    setJobImageDimensions(null)
    const image = new window.Image()
    image.onload = () => {
      if (!active) return
      setJobImageDimensions({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      if (active) setJobImageError('The selected job input image could not be loaded from its backend artifact.')
    }
    image.src = jobImageUrl
    return () => { active = false }
  }, [demoRecord, viewMode, jobImageUrl])

  /* ─ Close Export Dropdown on Outside Click & Escape Key ─ */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(e.target)) {
        setDownloadOpen(false)
      }
      if (demoDropdownRef.current && !demoDropdownRef.current.contains(e.target)) {
        setDemoOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (downloadOpen || demoOpen) {
          setDownloadOpen(false)
          setDemoOpen(false)
        } else if (showGeomModal) {
          setShowGeomModal(false)
        } else if (selectedFeature) {
          setSelectedFeature(null)
          setIsolatedFeature(null)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [demoOpen, downloadOpen, selectedFeature, showGeomModal])

  /* ─ Fullscreen Handling ─ */
  const toggleFullscreen = () => {
    const enterFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          if (!workstationRef.current?.requestFullscreen) {
            setError('Fullscreen is not supported by this browser.')
            return
          }
          await workstationRef.current.requestFullscreen()
        } else {
          if (!document.exitFullscreen) {
            setError('Exiting fullscreen is not supported by this browser.')
            return
          }
          await document.exitFullscreen()
        }
      } catch (fullscreenError) {
        setError(fullscreenError?.message || 'Fullscreen could not be changed.')
      }
    }
    enterFullscreen()
  }

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  /* ─ Geolocation Request ─ */
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('DENIED')
      setLocationError('Geolocation API is not supported in this browser environment.')
      return
    }
    setLocationStatus('LOCATING')
    setLocationError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toLocaleTimeString(),
        })
        setLocationStatus('AVAILABLE')
      },
      (err) => {
        setLocationStatus('DENIED')
        setLocationError(err.message || 'Location permission denied.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const reviewFeatures = useMemo(
    () => reviewRecords.map(reviewFeature).filter(Boolean),
    [reviewRecords]
  )
  const visibleBuildings = isolatedFeature
    ? buildings.filter((feature) => featureId(feature) === featureId(isolatedFeature))
    : buildings
  const visibleParcels = isolatedFeature
    ? parcels.filter((feature) => featureId(feature) === featureId(isolatedFeature))
    : parcels
  const visibleReviewFeatures = isolatedFeature
    ? reviewFeatures.filter((feature) => featureId(feature) === featureId(isolatedFeature))
    : reviewFeatures

  /* ─ Search Handler ─ */
  const handleFeatureSearch = (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      setSearchFeedback('')

      const foundJob = historyJobs.find((job) => String(job.job_id || '').toLowerCase() === q) ||
        historyJobs.find((job) => String(job.input_filename || '').toLowerCase() === q) ||
        historyJobs.find((job) =>
          String(job.job_id || '').toLowerCase().includes(q) ||
          String(job.input_filename || '').toLowerCase().includes(q)
        )
      if (foundJob?.job_id) {
        selectAnalysisJob(foundJob.job_id)
        setSearchFeedback(`Selected job ${foundJob.job_id}`)
        return
      }

      // Search in buildings
      const foundBldg = buildings.find((feature) => String(featureId(feature) || '').toLowerCase() === q) ||
        buildings.find((feature) => String(featureId(feature) || '').toLowerCase().includes(q))

      if (foundBldg) {
        setSelectedFeature(foundBldg)
        setSearchFeedback(`Found Building: ${featureId(foundBldg)}`)
        zoomToFeature(foundBldg)
        return
      }

      // Search in parcels
      const foundParcel = parcels.find((feature) => String(featureId(feature) || '').toLowerCase() === q) ||
        parcels.find((feature) => String(featureId(feature) || '').toLowerCase().includes(q))

      if (foundParcel) {
        setSelectedFeature(foundParcel)
        setSearchFeedback(`Found Parcel: ${featureId(foundParcel)}`)
        zoomToFeature(foundParcel)
        return
      }

      const foundReview = reviewFeatures.find((feature) =>
        String(feature.properties?.review_id || '').toLowerCase() === q ||
        String(feature.properties?.review_id || '').toLowerCase().includes(q)
      )
      if (foundReview) {
        setSelectedFeature(foundReview)
        setSearchFeedback(`Found review record: ${foundReview.properties.review_id}`)
        zoomToFeature(foundReview)
        return
      }

      setSearchFeedback(`FEATURE NOT FOUND: "${searchQuery}"`)
    }
  }

  /* ─ Real File Export Actions ─ */
  const exportGeoJson = () => {
    if (!jobId || !buildings.length) return
    const collection = {
      type: 'FeatureCollection',
      features: buildings,
      ...(spatialInfo.kind !== 'unknown' ? { coordinate_space: spatialInfo.kind } : {}),
      ...(spatialInfo.crs ? { source_crs: spatialInfo.crs } : {}),
    }
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cadastral_features_${jobId || 'export'}.geojson`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDownloadOpen(false)
  }

  const exportBuildingsCsv = () => {
    if (!jobId || !buildings.length) return
    const records = buildings.map((feature) => ({
      ...(feature.id != null ? { id: feature.id } : {}),
      ...(feature.properties || {}),
    }))
    const headers = [...new Set(records.flatMap((record) => Object.keys(record)))]
    const escapeCsv = (value) => {
      const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }
    const csvContent = [headers.map(escapeCsv).join(','), ...records.map((record) => headers.map((header) => escapeCsv(record[header])).join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `building_records_${jobId || 'export'}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDownloadOpen(false)
  }

  /* ─ Zoom to selected feature on Leaflet map ─ */
  const zoomToFeature = (feature = selectedFeature) => {
    if (!feature) return
    const space = coordinateSpace(buildings, resultsSummary)
    if (space.kind === 'pixel') {
      setViewMode('PIXEL')
      return
    }
    if (leafletMapRef.current && feature.geometry) {
      try {
        const b = L.geoJSON(feature).getBounds()
        if (b.isValid()) leafletMapRef.current.fitBounds(b, { padding: [40, 40] })
      } catch {
        setSearchFeedback('GEOMETRY BOUNDS UNAVAILABLE')
      }
    }
  }

  /* ─ Show parcel related to selected building ─ */
  const showRelatedParcel = () => {
    const parcelId = selectedFeature?.properties?.parcel_id ||
      findAssociatedParcelId(parcelResults?.association, selectedFeature?.properties?.building_id)
    if (!parcelId) return
    const related = parcels.find(
      (p) => (p.properties?.parcel_id || p.parcel_id) === parcelId
    )
    if (related) {
      setSelectedFeature(related)
      setInspectorTab('CADASTRAL')
    } else {
      setSearchFeedback('PARCEL GEOMETRY IS NOT EXPOSED BY THE BACKEND')
    }
  }

  /* ─ Derived Spatial Values ─ */
  const spatialInfo = coordinateSpace([...buildings, ...parcels], resultsSummary)
  const hasGeo = spatialInfo.kind === 'geographic' &&
    ['EPSG:4326', 'CRS:84'].includes(String(spatialInfo.crs || '').toUpperCase())
  const hasPixel = Boolean(demoRecord) || spatialInfo.kind === 'pixel'
  const demoImageUrl = demoRecord ? api.getImageUrl(demoRecord.split, demoRecord.filename) : null
  const demoMaskAvailable = Boolean(demoRecord?.mask_available && demoRecord.validation !== 'INVALID')
  const demoMaskUrl = demoMaskAvailable && demoRecord?.mask_filename
    ? api.getMaskUrl(demoRecord.split, demoRecord.mask_filename)
    : null
  const demoDatasetOverview = useMemo(() => {
    if (!demoRecord && !demoData?.buildings?.length && !demoData?.parcels?.length) return null
    const buildingsCount = demoRecord?.buildings_count ?? demoData.buildings.length
    const parcelsCount = demoRecord?.parcels_count ?? demoData.parcels.length
    const roadsCount = demoRecord?.roads_count ?? 0
    const gnssCount = demoRecord?.gnss_count ?? 0
    const conflictsCount = demoRecord?.conflicts_count ?? 0
    const area = demoRecord?.area_m2 ?? demoData.parcels.reduce((sum, parcel) => sum + Number(parcel.area_m2 || 0), 0)
    const crs = demoRecord?.crs || demoData.analysisSummary?.crs || 'EPSG:4326'
    return {
      buildings: buildingsCount,
      parcels: parcelsCount,
      roads: roadsCount,
      gnss: gnssCount,
      conflicts: conflictsCount,
      area,
      crs,
    }
  }, [demoRecord])
  const reportedBuildingCount = resultsSummary?.building_count != null
    ? Number(resultsSummary.building_count)
    : NaN
  const reportedParcelCount = resultsSummary?.parcel_count != null
    ? Number(resultsSummary.parcel_count)
    : NaN
  const parcelMappableCount = !jobId
    ? null
    : parcelResults != null || reportedParcelCount === 0
      ? parcels.length
      : null
  const geometryCountNote = !demoRecord && [
    Number.isFinite(reportedBuildingCount) && buildingRecordCount != null && reportedBuildingCount !== buildingRecordCount
      ? `Result summary reports ${reportedBuildingCount} buildings; the building endpoint returned ${buildingRecordCount} records.`
      : '',
    buildingRecordCount != null && buildingRecordCount > buildings.length
      ? `${buildingRecordCount} building records returned, but only ${buildings.length} contain valid polygon geometry.`
      : '',
    Number.isFinite(reportedParcelCount) && reportedParcelCount > parcels.length
      ? `Backend reports ${reportedParcelCount} parcels, but only ${parcels.length} parcel geometries are available.`
      : '',
    Number.isFinite(reportedParcelCount) && reportedParcelCount === 0
      ? 'PARCELS: 0 · NO PARCEL DATA.'
      : '',
  ].filter(Boolean).join(' ')
  const selectedProps = selectedFeature?.properties || selectedFeature || {}
  const selectedParcelId = selectedProps.parcel_id ||
    findAssociatedParcelId(parcelResults?.association, selectedProps.building_id)
  const isDemoFeature = Boolean(selectedProps.demo_data)
  const boundaryStatus = String(selectedProps.boundary_status || '').toUpperCase()
  const isBoundaryConflict = ['REVIEW_REQUIRED', 'BOUNDARY_CROSSING'].includes(boundaryStatus)

  const geographicFeatures = useMemo(
    () => [...buildings, ...parcels, ...reviewFeatures].filter((feature) => feature?.geometry),
    [buildings, parcels, reviewFeatures]
  )
  const buildingFeatureCollection = useMemo(
    () => ({ type: 'FeatureCollection', features: visibleBuildings }),
    [visibleBuildings]
  )
  const parcelFeatureCollection = useMemo(
    () => ({ type: 'FeatureCollection', features: visibleParcels }),
    [visibleParcels]
  )
  const reviewFeatureCollection = useMemo(
    () => ({ type: 'FeatureCollection', features: visibleReviewFeatures }),
    [visibleReviewFeatures]
  )
  const mapBounds = useMemo(() => {
    if (!geographicFeatures.length || !hasGeo) return null
    try {
      const bounds = L.geoJSON({ type: 'FeatureCollection', features: geographicFeatures }).getBounds()
      return bounds.isValid() ? bounds : null
    } catch {
      return null
    }
  }, [geographicFeatures, hasGeo])
  const mapCenter = useMemo(() => {
    if (!mapBounds) return null
    const center = mapBounds.getCenter()
    return [center.lat, center.lng]
  }, [mapBounds])
  const canFitView = viewMode === '3D'
    ? buildings.length > 0
    : viewMode === 'AERIAL'
      ? Boolean(projectAerialMetadata?.available)
      : viewMode === 'PIXEL'
        ? Boolean(demoRecord || jobImageArtifact || buildings.length || parcels.length)
        : Boolean(mapBounds)
  const fitViewToData = () => {
    if (viewMode === '3D') {
      setCameraCommand({ type: 'reset' })
      return
    }
    setSelectedFeature(null)
    setIsolatedFeature(null)
    if (viewMode === 'PIXEL' || viewMode === 'AERIAL') {
      setPixelResetKey((key) => key + 1)
      return
    }
    if (mapBounds && leafletMapRef.current) {
      leafletMapRef.current.fitBounds(mapBounds, { padding: [36, 36] })
    }
  }
  const openIsometricView = () => {
    setViewMode('3D')
    setCameraCommand({ type: 'iso' })
  }

  /* ══════════════════════════════════════════════════════════════════════════════
     RENDER WORKSTATION
     ══════════════════════════════════════════════════════════════════════════════ */
  return (
    <div ref={workstationRef} className="map-workstation">
      {/* ── Top Floating GIS Toolbar ── */}
      <div className="map-toolbar-viewport">
        <div className="map-toolbar">
        {/* Left: 2D/3D Mode & Coordinate Space */}
        <div className="map-toolbar-group map-toolbar-view">
          <div className="map-mode-pills">
            <button
              className={`map-mode-pill${viewMode === '2D' ? ' active' : ''}`}
              onClick={() => setViewMode('2D')}
              title="2D Geographic GIS Map"
              aria-pressed={viewMode === '2D'}
            >
              <MapIcon size={12} />
              2D GIS MAP
            </button>
            <button
              className={`map-mode-pill${viewMode === '3D' ? ' active' : ''}`}
              onClick={openIsometricView}
              disabled={!buildings.length}
              title={buildings.length
                ? 'Open the interactive 2.5D geometry view; extrusion is not shown without returned height data'
                : 'No building geometry is available for the 2.5D view'}
              aria-pressed={viewMode === '3D'}
            >
              <Box size={12} />
              2.5D GEOMETRY
            </button>
            {(demoRecord || (hasPixel && (buildings.length > 0 || jobImageArtifact))) && (
              <button
                className={`map-mode-pill${viewMode === 'PIXEL' ? ' active' : ''}`}
                onClick={() => setViewMode('PIXEL')}
                title="Pixel Space Raster View"
                aria-pressed={viewMode === 'PIXEL'}
              >
                <Grid size={12} />
                PIXEL VIEW
              </button>
            )}
            {projectAerialMetadata?.available && (
              <button
                className={`map-mode-pill${viewMode === 'AERIAL' ? ' active' : ''}`}
                onClick={() => {
                  setProjectAerialImageError('')
                  setProjectAerialLoaded(false)
                  setViewMode('AERIAL')
                }}
                title="View the separately georeferenced project aerial preview; it is not aligned to a pixel-space job"
                aria-pressed={viewMode === 'AERIAL'}
              >
                <Globe size={12} />
                PROJECT AERIAL
              </button>
            )}
          </div>

          <span className={`map-coordinate-badge ${hasGeo ? 'geographic' : hasPixel ? 'pixel' : 'unknown'}`}>
            {viewMode === 'AERIAL'
              ? projectAerialMetadata?.crs ? `PROJECTED · ${projectAerialMetadata.crs}` : 'CRS NOT DETECTED'
              : hasGeo ? `GEOGRAPHIC · ${spatialInfo.crs}` : hasPixel ? 'PIXEL SPACE' : spatialInfo.crs || 'CRS NOT DETECTED'}
          </span>

        </div>

        {/* Analysis target */}
        <div className="map-toolbar-group map-toolbar-analysis">
            <select
              value={jobId || ''}
              onChange={(e) => selectAnalysisJob(e.target.value)}
              className="layer-btn map-analysis-target"
              disabled={!historyJobs.length}
              title={historyJobs.length ? 'Switch to a real analysis job from operation history' : 'No analysis jobs were returned by the history API'}
              aria-label="Switch active analysis job"
            >
              <option value="">{historyJobs.length ? 'Select Analysis Target…' : 'NO SAVED ANALYSES'}</option>
              {historyJobs.map((j) => (
                <option key={j.job_id} value={j.job_id}>
                  {j.input_filename || 'Input filename not available'} · #{j.job_id.slice(0, 8)} · {String(j.status || 'STATUS NOT AVAILABLE').toUpperCase()}
                </option>
              ))}
            </select>
        </div>

        {!jobId && <div className="map-toolbar-group map-toolbar-demo">
          <div className="map-demo-selector" ref={demoDropdownRef}>
            <button
              type="button"
              className={`layer-btn${demoRecord ? ' active-teal' : ''}`}
              onClick={openDemoSelector}
              aria-haspopup="dialog"
              aria-expanded={demoOpen}
              title="Open an independent dataset image preview"
            >
              <Database size={12} />
              {demoRecord ? demoRecord.filename : 'Dataset Preview'}
              <ChevronDown size={10} />
            </button>
            {demoOpen && (
              <div className="map-demo-menu" role="dialog" aria-label="Select a demo dataset">
                <label className="map-demo-search">
                  <Search size={13} aria-hidden="true" />
                  <input
                    autoFocus
                    type="search"
                    value={demoSearch}
                    onChange={(event) => setDemoSearch(event.target.value)}
                    placeholder="Search datasets..."
                    aria-label="Search demo datasets"
                  />
                </label>
                {demoLoading && <div className="map-demo-menu-state" role="status">Loading dataset catalog...</div>}
                {demoError && <div className="map-demo-menu-error" role="alert">{demoError}</div>}
                {!demoLoading && demoRegistry?.records && (
                  <div
                    className="map-demo-options"
                    role="listbox"
                    aria-label="Available datasets"
                    onKeyDown={(event) => {
                      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                      const options = [...event.currentTarget.querySelectorAll('[role="option"]')]
                      if (!options.length) return
                      const currentIndex = options.indexOf(document.activeElement)
                      const nextIndex = event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? options.length - 1
                          : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
                      options[nextIndex]?.focus()
                      event.preventDefault()
                    }}
                  >
                    {demoRegistry.records
                      .filter((record) => `${record.filename || ''} ${record.split || ''} ${record.tile || ''}`.toLowerCase().includes(demoSearch.trim().toLowerCase()))
                      .map((record) => (
                        <button
                          key={record.id}
                          type="button"
                          role="option"
                          aria-selected={demoRecord?.id === record.id}
                          className={`map-demo-option${demoRecord?.id === record.id ? ' selected' : ''}`}
                          onClick={() => selectDemoDataset(record)}
                        >
                          <span className="map-demo-option-title">{record.filename}</span>
                          <span className="map-demo-option-meta">
                            {record.split_label || record.split || 'Split not available'}
                            {' · '}
                            {record.dimensions || 'Dimensions not available'}
                            {record.format ? ` · ${record.format}` : ''}
                          </span>
                        </button>
                      ))}
                    {!demoRegistry.records.length ? (
                      <div className="map-demo-menu-state">No demo datasets are available.</div>
                    ) : !demoRegistry.records.some((record) => `${record.filename || ''} ${record.split || ''} ${record.tile || ''}`.toLowerCase().includes(demoSearch.trim().toLowerCase())) && (
                      <div className="map-demo-menu-state">No datasets match this search.</div>
                    )}
                  </div>
                )}
                {demoRegistry?.records && <div className="map-demo-total">{demoRegistry.total_images ?? demoRegistry.records.length} available images</div>}
              </div>
            )}
          </div>
          {demoRecord && (
            <button type="button" className="layer-btn" onClick={clearDemoDataset} title="Close the independent dataset preview">
              <X size={12} /> Close Preview
            </button>
          )}
        </div>}

        {/* Center: Layer Toggles & Basemap Switcher */}
        <div className="map-toolbar-group map-toolbar-layers">
          <button
            className={`layer-btn${showBuildings ? ' active-teal' : ''}`}
            onClick={() => setShowBuildings(!showBuildings)}
            disabled={!buildings.length}
            title={`${buildingRecordCount == null ? 'Building record count not available' : `${buildingRecordCount} backend records`}; ${buildings.length} valid polygon geometries`}
            aria-pressed={showBuildings}
          >
            <Building2 size={12} style={{ color: showBuildings ? '#00C7B7' : '#8E9FA9' }} />
            Buildings ({loading ? '…' : buildingRecordCount ?? 'N/A'})
          </button>

          <button
            className={`layer-btn${showParcels ? ' active-purple' : ''}`}
            onClick={() => setShowParcels(!showParcels)}
            disabled={!parcels.length}
            title={`${Number.isFinite(reportedParcelCount) ? `${reportedParcelCount} result records` : parcels.length ? `${parcels.length} returned parcel geometries` : 'Parcel geometry is not available'}; ${parcels.length} mappable parcel geometries`}
            aria-pressed={showParcels}
          >
            <Grid size={12} style={{ color: showParcels ? '#7657E8' : '#8E9FA9' }} />
            Parcels ({loading ? '…' : !jobId && !demoRecord ? 'N/A' : demoRecord ? 'NO DATA' : Number.isFinite(reportedParcelCount) ? reportedParcelCount : parcels.length || 'N/A'})
          </button>

          <button
            className={`layer-btn${showReviewFlags ? ' active-amber' : ''}`}
            onClick={() => setShowReviewFlags(!showReviewFlags)}
            disabled={reviewLoadState !== 'loaded' || reviewFeatures.length === 0}
            title={reviewLoadState === 'loaded'
              ? `${reviewTotal ?? reviewRecords.length} backend review records; ${reviewFeatures.length} mappable review geometries`
              : reviewLoadState === 'error' ? 'Review data is unavailable from the backend' : 'Review data is loading or not available'}
            aria-pressed={showReviewFlags}
          >
            <ShieldAlert size={12} style={{ color: showReviewFlags ? '#F59E0B' : '#8E9FA9' }} />
            Review Flags ({reviewLoadState === 'loading' ? '…' : reviewLoadState === 'error' ? 'N/A' : reviewTotal ?? 0})
          </button>
          {demoMaskAvailable && (
            <button
              className={`layer-btn${showDemoMask ? ' active-purple' : ''}`}
              onClick={() => setShowDemoMask((visible) => !visible)}
              title="Toggle the dataset's actual ground-truth segmentation mask"
              aria-pressed={showDemoMask}
            >
              <Layers size={12} /> Ground-truth mask
            </button>
          )}

          {/* Basemap Source Dropdown */}
          <select
            value={baseMap}
            onChange={(e) => setBaseMap(e.target.value)}
            className="layer-btn"
            disabled={!hasGeo || viewMode !== '2D'}
            style={{ outline: 'none', cursor: 'pointer' }}
            title={hasGeo && viewMode === '2D' ? 'Select Basemap Provider' : 'Basemaps are available only for geographic map data'}
          >
            <option value="osm">Street (OpenStreetMap)</option>
            <option value="satellite">Satellite (Esri World)</option>
            <option value="terrain">Terrain (OpenTopoMap)</option>
            <option value="vector">Vector Canvas (Dark Grid)</option>
          </select>

          {/* Visual Overlay Scanner Button */}
          <button
            type="button"
            className={`layer-btn map-scanner-toggle-btn${scanState === 'SCANNING' ? ' active-cyan map-scan-pulsing' : scanState === 'PAUSED' ? ' active-amber' : ''}`}
            onClick={toggleScanner}
            title={scanState === 'OFF' ? 'Enable visual spatial scanner overlay' : scanState === 'SCANNING' ? 'Pause visual scanner' : 'Resume visual scanner'}
            aria-pressed={scanState !== 'OFF'}
          >
            <ScanLine size={12} className={scanState === 'SCANNING' ? 'map-scanner-icon-active' : ''} />
            <span>{scanState === 'OFF' ? 'VISUAL SCAN' : scanState === 'SCANNING' ? 'SCANNING…' : 'PAUSED'}</span>
            {scanState !== 'OFF' && (
              <span
                role="button"
                tabIndex={0}
                className="map-scanner-reset-tag"
                onClick={(e) => {
                  e.stopPropagation()
                  resetScanner()
                }}
                title="Stop and reset scan"
                aria-label="Stop scan"
              >
                <X size={10} />
              </span>
            )}
          </button>
        </div>

        {/* Right: Search, Export & Fullscreen */}
        <div className="map-toolbar-group map-toolbar-actions">
          {/* Feature Search Box */}
          <div className="map-search-box">
            <button type="button" className="map-search-submit" onClick={handleFeatureSearch} aria-label="Search features and jobs" title="Search features and jobs">
              <Search size={12} />
            </button>
            <input
              className="map-search-input"
              placeholder="Search feature ID or job…"
              aria-label="Search building, parcel, or job"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleFeatureSearch}
            />
            {searchQuery && (
              <button
                type="button"
                className="map-search-clear"
                aria-label="Clear feature search"
                onClick={() => {
                  setSearchQuery('')
                  setSearchFeedback('')
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* ─── CRITICAL EXPORT DROPDOWN (Anchored Directly Below Export Button) ─── */}
          <div ref={downloadDropdownRef} className="download-dropdown-container">
            <button
              className="layer-btn"
              onClick={() => setDownloadOpen(!downloadOpen)}
              title="Export Spatial Artifacts"
              aria-haspopup="menu"
              aria-expanded={downloadOpen}
              aria-label="Export spatial artifacts"
            >
              <Download size={12} />
              Export
              <ChevronDown size={10} />
            </button>

            {downloadOpen && (
              <div className="download-dropdown-menu" role="menu">
                <button
                  className="download-dropdown-item"
                  onClick={exportGeoJson}
                  disabled={!buildings.length}
                  role="menuitem"
                >
                  <FileCode size={13} style={{ color: '#00C7B7' }} />
                  <div>
                    <div>Export GeoJSON</div>
                    <small style={{ color: '#8E9FA9', fontSize: '9px' }}>Vector building contours</small>
                  </div>
                </button>
                <button
                  className="download-dropdown-item"
                  onClick={exportBuildingsCsv}
                  disabled={!buildings.length}
                  role="menuitem"
                >
                  <FileSpreadsheet size={13} style={{ color: '#4D7CFE' }} />
                  <div>
                    <div>Export Attributes CSV</div>
                    <small style={{ color: '#8E9FA9', fontSize: '9px' }}>Building cadastral metrics</small>
                  </div>
                </button>
                {!buildings.length && <span className="download-dropdown-item" aria-disabled="true">No building geometry available for this job.</span>}
              </div>
            )}
          </div>

          <button
            type="button"
            className="layer-btn"
            onClick={reload}
            disabled={loading}
            title="Refresh current job, dataset image, and map data"
            aria-label="Refresh map data"
          >
            <RefreshCw size={12} className={loading ? 'map-refresh-spin' : ''} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            className="layer-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Workspace'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
        </div>
      </div>

      <div className="map-service-strip" aria-label="Live service status">
        <span className="map-service-strip__label">LIVE SERVICES</span>
        <span className="map-service-strip__item"><i className={health?.status ? 'is-reported' : ''} /> API <b>{health?.status ? String(health.status).toUpperCase() : 'NOT AVAILABLE'}</b></span>
        <span className="map-service-strip__item"><i className={health?.database?.status ? 'is-reported' : ''} /> DATABASE <b>{health?.database?.status ? String(health.database.status).toUpperCase() : 'NOT AVAILABLE'}</b></span>
        <span className="map-service-strip__item"><i className={postgisInfo?.status ? 'is-reported' : ''} /> POSTGIS <b>{postgisInfo?.status ? String(postgisInfo.status).toUpperCase() : 'NOT AVAILABLE'}</b></span>
      </div>

      {loading && !demoRecord && <div className="map-data-banner" role="status"><RefreshCw size={13} className="map-refresh-spin" /> {jobId ? 'Loading selected job from FastAPI…' : 'Loading available jobs and map status…'}</div>}
      {error && <div className="map-data-banner map-data-banner-error" role="alert"><AlertTriangle size={14} /> {error}<button type="button" className="btn-geo btn-geo-secondary btn-geo-sm" onClick={reload} aria-label="Retry loading map data">Retry</button></div>}
      {demoRecord && (
        <div className="map-demo-notice" role="status">
          <strong>DEMO DATA</strong>
          <span>
            {demoRecord.filename} · {demoRecord.split_label || demoRecord.split}
            {' · '}
            {demoImageDimensions ? `${demoImageDimensions.width} × ${demoImageDimensions.height}` : demoRecord.dimensions || 'Dimensions not available'}
            {demoRecord.format ? ` · ${demoRecord.format}` : ''}
            {demoRecord.validation ? ` · Dataset validation: ${demoRecord.validation}` : ''}
            {' · CRS not reported'}
            {` · ${demoMaskAvailable ? 'Ground-truth mask available' : demoRecord.mask_available ? 'Mask available but not validated for overlay' : 'No mask available'}`}
            {' · '}
            {demoImageError ? 'Image unavailable' : demoImageLoaded ? 'Image loaded' : 'Loading image...'}
            {' · '}
            {buildings.length ? `${buildings.length} vector features` : 'Feature geometry not available for this dataset'}
          </span>
        </div>
      )}
      {jobId && !demoRecord && (
        <div className="map-live-notice" role="status">
          <strong>LIVE RESULT</strong>
          <span>
            Job {jobId}
            {' · '}
            {resultsSummary?.status || historyJobs.find((job) => job.job_id === jobId)?.status || (loading ? 'Loading status...' : 'Status not available')}
          </span>
        </div>
      )}
      {jobId && !demoRecord && viewMode === 'PIXEL' && jobImageArtifact && (
        <div className="map-live-notice" role={jobImageError ? 'alert' : 'status'}>
          <strong>JOB INPUT IMAGE</strong>
          <span>
            {jobImageError || (jobImageDimensions
              ? `${jobImageDimensions.width} × ${jobImageDimensions.height} · ${jobImageArtifact} · ${buildings.length} valid building geometries in pixel space`
              : `Loading ${jobImageArtifact} from the selected job...`)}
          </span>
          {jobImageError && (
            <button type="button" className="btn-geo btn-geo-secondary btn-geo-sm" onClick={() => setJobImageAttempt((attempt) => attempt + 1)}>
              Retry image
            </button>
          )}
        </div>
      )}
      {projectAerialError && (
        <div className="map-data-banner map-data-banner-error" role="alert">
          Project aerial metadata unavailable: {projectAerialError}
          <button type="button" className="btn-geo btn-geo-secondary btn-geo-sm" onClick={() => setProjectAerialMetadataAttempt((attempt) => attempt + 1)}>
            Retry
          </button>
        </div>
      )}
      {viewMode === 'AERIAL' && projectAerialMetadata && (
        <div className="map-live-notice map-aerial-notice" role={projectAerialImageError ? 'alert' : 'status'}>
          <strong>PROJECT AERIAL PREVIEW</strong>
          <span>
            {projectAerialImageError
              ? `Preview unavailable: ${projectAerialImageError}`
              : `${projectAerialMetadata.filename || 'Raster'} · ${projectAerialMetadata.crs || 'CRS NOT DETECTED'} · ${projectAerialMetadata.width ?? 'N/A'} × ${projectAerialMetadata.height ?? 'N/A'} px · ${projectAerialMetadata.bands ?? 'N/A'} bands · ${projectAerialMetadata.format || 'format unavailable'}${Array.isArray(projectAerialMetadata.bounds) ? ` · bounds: ${projectAerialMetadata.bounds.map((value) => Number(value).toFixed(2)).join(', ')}` : ''} · ${projectAerialLoaded ? 'preview loaded' : 'loading preview'} · separate raster; not overlaid on the active job`}
          </span>
          {projectAerialImageError && (
            <button
              type="button"
              className="btn-geo btn-geo-secondary btn-geo-sm"
              onClick={() => {
                setProjectAerialImageError('')
                setProjectAerialLoaded(false)
                setProjectAerialAttempt((attempt) => attempt + 1)
              }}
            >
              Retry preview
            </button>
          )}
        </div>
      )}
      {geometryCountNote && <div className="map-data-banner" role="status">{geometryCountNote} The map renders returned geometries only.</div>}
      {jobId && resultsSummary?.status && !['completed', 'complete'].includes(String(resultsSummary.status).toLowerCase()) && !loading && (
        <div className="map-data-banner" role="status">
          JOB STATUS: {String(resultsSummary.status).toUpperCase()} · {resultsSummary.message || 'Spatial results are not loaded until processing completes.'}
        </div>
      )}

      {/* ── Search Feedback Toast if active ── */}
      {searchFeedback && (
        <div
          style={{
            padding: '5px 12px',
            background: searchFeedback.includes('NOT FOUND') ? 'rgba(239, 68, 68, 0.92)' : 'rgba(0, 199, 183, 0.92)',
            color: '#FFFFFF',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '700',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 600,
          }}
        >
          <span>{searchFeedback}</span>
          <button type="button" className="map-feedback-dismiss" aria-label="Dismiss search message" onClick={() => setSearchFeedback('')}><X size={12} /></button>
        </div>
      )}

      {/* ── Main Viewport Workspace ── */}
      <div
        className="map-viewport-grid"
        style={{ gridTemplateColumns: selectedFeature ? 'minmax(0, 1fr) var(--map-inspector-width, 380px)' : '1fr' }}
      >
        {/* Left GIS Spatial Canvas Container */}
        <div className="map-canvas-container">
          {/* Floating Left Tool Rail: Camera Presets & My Location */}
          <div className="map-left-tool-rail">
            <button
              className={`map-tool-btn${viewMode !== '3D' && viewMode !== 'AERIAL' ? ' active' : ''}`}
              onClick={() => viewMode === '3D'
                ? setCameraCommand({ type: 'top' })
                : setViewMode(hasGeo ? '2D' : hasPixel ? 'PIXEL' : '2D')}
              title={hasGeo ? 'Top-down geographic map view' : hasPixel ? 'Top-down pixel view' : 'Top-down map view'}
              aria-label="Show top-down map view"
            >
              TOP
            </button>
            <button
              className={`map-tool-btn${viewMode === '3D' && cameraCommand?.type === 'north' ? ' active' : ''}`}
              disabled={viewMode !== '3D'}
              onClick={() => setCameraCommand({ type: 'north' })}
              title={viewMode === '3D' ? 'Reset 2.5D camera yaw to north' : '2D map is already fixed north-up'}
              aria-label={viewMode === '3D' ? 'Reset camera yaw to north' : 'North-up orientation is fixed in 2D'}
            >
              NORTH
            </button>
            <button
              className={`map-tool-btn${viewMode === '3D' ? ' active' : ''}`}
              onClick={openIsometricView}
              disabled={!buildings.length}
              title="Set the 2.5D camera to the isometric preset"
              aria-label="Open 2.5D geometry view"
            >
              2.5D ISO
            </button>
            <button
              className="map-tool-btn"
              onClick={fitViewToData}
              disabled={!canFitView}
              title={canFitView
                ? viewMode === '3D' ? 'Reset camera' : 'Fit map to available data'
                : 'No mappable data is available to fit'}
              aria-label={viewMode === '3D' ? 'Reset camera' : 'Fit map to available data'}
            >
              <RotateCcw size={11} />
            </button>
            <button
              className="map-tool-btn"
              onClick={zoomInMap}
              title="Zoom in viewport"
              aria-label="Zoom in"
            >
              <Plus size={11} />
            </button>
            <button
              className="map-tool-btn"
              onClick={zoomOutMap}
              title="Zoom out viewport"
              aria-label="Zoom out"
            >
              <Minus size={11} />
            </button>
            <button
              className={`map-tool-btn${locationStatus === 'AVAILABLE' ? ' active' : ''}`}
              onClick={requestLocation}
              disabled={locationStatus === 'LOCATING'}
              title={locationError || (locationStatus === 'LOCATING' ? 'Acquiring browser location...' : 'Acquire browser GPS coordinates')}
              aria-label="Acquire browser GPS coordinates"
            >
              <Navigation size={11} />
            </button>
            <button
              className={`map-tool-btn${scanState !== 'OFF' ? ' active-cyan' : ''}`}
              onClick={toggleScanner}
              title={scanState === 'OFF' ? 'Enable visual spatial scanner overlay' : scanState === 'SCANNING' ? 'Pause visual scanner' : 'Resume visual scanner'}
              aria-label="Visual spatial scanner"
            >
              <ScanLine size={11} />
            </button>
          </div>

          {/* Visual Spatial Scanner Overlay */}
          {scanState !== 'OFF' && (
            <div className={`map-visual-scanner ${scanState === 'PAUSED' ? 'is-paused' : 'is-scanning'}`} aria-label="Visual Spatial Scanner Overlay">
              <div className="map-scanner-beam" />
              <div className="map-scanner-grid" />
              <div className="map-scanner-reticle tl" />
              <div className="map-scanner-reticle tr" />
              <div className="map-scanner-reticle bl" />
              <div className="map-scanner-reticle br" />
              <div className="map-scanner-center-crosshair">
                <div className="map-scanner-ch-h" />
                <div className="map-scanner-ch-v" />
                <div className="map-scanner-ch-ring" />
              </div>

              {/* Floating Scanner HUD Panel */}
              <div className="map-scanner-hud">
                <div className="map-scanner-hud-header">
                  <div className="map-scanner-hud-title">
                    <ScanLine size={13} style={{ color: '#00C7B7' }} />
                    <span style={{ fontWeight: 800 }}>SPATIAL OVERLAY SCAN</span>
                    <span className="map-scanner-mode-tag">VISUAL ANALYSIS MODE</span>
                  </div>
                  <div className="map-scanner-hud-actions">
                    <button
                      type="button"
                      className="map-scanner-hud-btn"
                      onClick={toggleScanner}
                      title={scanState === 'SCANNING' ? 'Pause scan' : 'Resume scan'}
                    >
                      {scanState === 'SCANNING' ? <Pause size={10} /> : <Play size={10} />}
                      <span>{scanState === 'SCANNING' ? 'PAUSE' : 'RESUME'}</span>
                    </button>
                    <button
                      type="button"
                      className="map-scanner-hud-btn map-scanner-hud-btn--close"
                      onClick={resetScanner}
                      title="Stop and reset scan"
                    >
                      <X size={10} />
                      <span>OFF</span>
                    </button>
                  </div>
                </div>

                <div className="map-scanner-hud-body">
                  <div className="map-scanner-hud-metric">
                    <span className="map-scanner-hud-label">STATE:</span>
                    <span className={`map-scanner-hud-val ${scanState === 'SCANNING' ? 'is-active' : 'is-paused'}`}>
                      <span className="map-scanner-dot" />
                      {scanState}
                    </span>
                  </div>
                  <div className="map-scanner-hud-metric">
                    <span className="map-scanner-hud-label">JOB:</span>
                    <span className="map-scanner-hud-val" title={jobId || (demoRecord ? demoRecord.filename : 'NO ACTIVE JOB')}>
                      {jobId || (demoRecord ? demoRecord.filename : 'NO ACTIVE JOB')}
                    </span>
                  </div>
                  <div className="map-scanner-hud-metric">
                    <span className="map-scanner-hud-label">CRS:</span>
                    <span className="map-scanner-hud-val">
                      {viewMode === 'AERIAL'
                        ? projectAerialMetadata?.crs || 'CRS NOT DETECTED'
                        : hasGeo ? spatialInfo.crs : hasPixel ? 'PIXEL SPACE' : spatialInfo.crs || 'CRS NOT DETECTED'}
                    </span>
                  </div>
                  <div className="map-scanner-hud-metric">
                    <span className="map-scanner-hud-label">MODE:</span>
                    <span className="map-scanner-hud-val">
                      {viewMode === '3D' ? '3D ISOMETRIC' : viewMode === 'PIXEL' ? 'PIXEL VIEWER' : viewMode === 'AERIAL' ? 'PROJECT AERIAL' : '2D GIS LEAFLET'}
                    </span>
                  </div>
                  <div className="map-scanner-hud-metric">
                    <span className="map-scanner-hud-label">PARCELS:</span>
                    <span className="map-scanner-hud-val">
                      {parcels.length} {showParcels ? '(ACTIVE)' : '(HIDDEN)'}
                    </span>
                  </div>
                  <div className="map-scanner-hud-metric">
                    <span className="map-scanner-hud-label">BUILDINGS:</span>
                    <span className="map-scanner-hud-val">
                      {buildings.length} {showBuildings ? '(ACTIVE)' : '(HIDDEN)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Floating Bottom Status & Coordinate Readout */}
          <div className="map-coord-readout">
            {(() => {
              const mapStatus = loading
                ? 'LOADING'
                : error
                  ? 'PARTIAL / ERROR'
                  : jobId
                    ? String(resultsSummary?.status || 'DATA UNAVAILABLE').toUpperCase()
                    : demoRecord
                      ? 'DATASET PREVIEW'
                      : viewMode === 'AERIAL'
                        ? 'PROJECT AERIAL'
                        : 'NO ACTIVE JOB'
              return (
                <>
            <div className="map-coord-item">
              <span style={{ color: '#00C7B7', fontWeight: '800' }}>ENGINE:</span>
              <span>{viewMode === '3D' ? '3D VIEW' : viewMode === 'AERIAL' ? 'PROJECT AERIAL PREVIEW' : hasGeo ? '2D LEAFLET GIS ENGINE' : demoRecord ? 'DATASET PIXEL VIEWER' : hasPixel ? '2D PIXEL VECTOR ENGINE' : 'MAP ENGINE UNAVAILABLE'}</span>
            </div>

            <div className="map-coord-item">
              <span style={{ color: '#00C7B7', fontWeight: '800' }}>CRS:</span>
              <span>{viewMode === 'AERIAL'
                ? projectAerialMetadata?.crs || 'CRS NOT DETECTED'
                : hasGeo ? spatialInfo.crs : hasPixel ? 'PIXEL SPACE' : spatialInfo.crs || 'CRS NOT DETECTED'}</span>
            </div>

            <div className="map-coord-item">
              <Crosshair size={11} style={{ color: '#00C7B7' }} />
              <span>
                {cursorPos ? (
                  hasGeo && viewMode !== 'AERIAL' ? (
                    `Lat: ${cursorPos.lat.toFixed(6)} · Lng: ${cursorPos.lng.toFixed(6)}`
                  ) : (
                    `Pixel X: ${cursorPos.x} · Y: ${cursorPos.y}`
                  )
                ) : (
                  'Track Cursor Coordinates'
                )}
              </span>
            </div>

            <div className="map-coord-item">
              <span>
                {loading
                  ? 'FEATURES: LOADING'
                  : !jobId && !demoRecord
                    ? 'FEATURES: NO ACTIVE JOB'
                    : demoRecord
                      ? 'FEATURES: NO ANALYSIS DATA'
                      : `BUILDINGS: ${buildingRecordCount ?? 'N/A'} / ${buildingRecordCount == null ? 'N/A' : buildings.length} MAPPABLE · PARCELS: ${Number.isFinite(reportedParcelCount) ? reportedParcelCount : parcels.length || 'N/A'} / ${parcelMappableCount ?? 'N/A'} MAPPABLE`}
              </span>
            </div>

            <div className="map-coord-item">
              <span style={{ color: error ? '#FF6678' : '#FFFFFF' }}>STATUS: {mapStatus}</span>
            </div>

            {userLocation && (
              <div className="map-coord-item" style={{ color: '#4D7CFE' }}>
                <span>GPS: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)} (±{Math.round(userLocation.accuracy)}m)</span>
              </div>
            )}
                </>
              )
            })()}
          </div>

          {/* Viewport Render: 3D Canvas vs 2D Geographic Leaflet vs 2D Pixel Canvas */}
          {viewMode === '3D' ? (
            <Geospatial3DCanvas
              features={showBuildings ? visibleBuildings : []}
              selected={selectedFeature}
              onPick={setSelectedFeature}
              cameraCommand={cameraCommand}
            />
          ) : viewMode === 'AERIAL' && projectAerialImageError ? (
            <div className="map-data-unavailable" role="alert">
              <AlertTriangle size={28} />
              <strong>PROJECT AERIAL PREVIEW UNAVAILABLE</strong>
              <span>{projectAerialImageError}</span>
              <button
                type="button"
                className="btn-geo btn-geo-secondary btn-geo-sm"
                onClick={() => {
                  setProjectAerialImageError('')
                  setProjectAerialLoaded(false)
                  setProjectAerialAttempt((attempt) => attempt + 1)
                }}
              >
                Retry Preview
              </button>
            </div>
          ) : viewMode === 'AERIAL' ? (
            <PixelViewer2D
              key={`project-aerial-${projectAerialAttempt}`}
              imageUrl={projectAerialUrl}
              imageDimensions={projectAerialMetadata?.width && projectAerialMetadata?.height
                ? { width: projectAerialMetadata.width, height: projectAerialMetadata.height }
                : null}
              onImageLoad={() => {
                setProjectAerialLoaded(true)
                setProjectAerialImageError('')
              }}
              onImageError={() => {
                setProjectAerialLoaded(false)
                setProjectAerialImageError('Backend did not return the project aerial preview.')
              }}
              resetKey={pixelResetKey}
              onMouseMove={setCursorPos}
            />
          ) : viewMode === 'PIXEL' && demoRecord && demoImageError ? (
            <div className="map-data-unavailable" role="alert">
              <AlertTriangle size={28} />
              <strong>IMAGE UNAVAILABLE</strong>
              <span>{demoRecord.filename}: {demoImageError}</span>
              <button
                type="button"
                className="btn-geo btn-geo-secondary btn-geo-sm"
                onClick={() => {
                  setDemoImageError('')
                  setDemoImageLoaded(false)
                  setDemoImageAttempt((attempt) => attempt + 1)
                }}
              >
                Retry Image
              </button>
            </div>
          ) : viewMode === 'PIXEL' && !demoRecord && jobImageError && !visibleBuildings.length && !visibleParcels.length && !visibleReviewFeatures.length ? (
            <div className="map-data-unavailable" role="alert">
              <AlertTriangle size={28} />
              <strong>JOB INPUT IMAGE UNAVAILABLE</strong>
              <span>{jobImageError}</span>
              <button
                type="button"
                className="btn-geo btn-geo-secondary btn-geo-sm"
                onClick={() => setJobImageAttempt((attempt) => attempt + 1)}
              >
                Retry Image
              </button>
            </div>
          ) : viewMode === 'PIXEL' ? (
          <PixelViewer2D
            key={demoRecord ? `${demoRecord.id}-${demoImageAttempt}` : `pixel-results-${jobId || 'none'}-${jobImageAttempt}`}
              features={visibleBuildings}
              parcels={visibleParcels}
              reviewFeatures={visibleReviewFeatures}
              imageUrl={demoRecord ? demoImageUrl : jobImageUrl}
              maskUrl={demoMaskUrl}
              imageDimensions={demoRecord ? demoImageDimensions : jobImageDimensions}
              showMask={Boolean(demoRecord) && showDemoMask}
              onImageLoad={() => {
                if (demoRecord) {
                  setDemoImageLoaded(true)
                  setDemoImageError('')
                } else {
                  setJobImageError('')
                }
              }}
              onImageError={() => {
                if (demoRecord) {
                  setDemoImageLoaded(false)
                  setDemoImageError(`Image unavailable for ${demoRecord.filename}.`)
                } else {
                  setJobImageError('The selected job input image could not be loaded from its backend artifact.')
                }
              }}
              selected={selectedFeature}
              onPick={setSelectedFeature}
              isolated={isolatedFeature}
              showBuildings={showBuildings}
              showParcels={showParcels}
              showReview={showReviewFlags}
              resetKey={pixelResetKey}
              onMouseMove={setCursorPos}
            />
          ) : (
            /* 2D Geographic GIS Map (Default & Primary View) */
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {hasGeo && mapCenter ? <MapContainer
                ref={leafletMapRef}
                center={mapCenter}
                zoom={14}
                scrollWheelZoom
                style={{ height: '100%', width: '100%', minHeight: 0 }}
              >
                {baseMap === 'osm' && (
                  <TileLayer
                    attribution="© OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                )}
                {baseMap === 'satellite' && (
                  <TileLayer
                    attribution="© Esri, Maxar, Earthstar Geographics"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                )}
                {baseMap === 'terrain' && (
                  <TileLayer
                    attribution="© OpenTopoMap contributors"
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  />
                )}
                {baseMap === 'vector' && (
                  <TileLayer
                    attribution="© CartoDB Dark Matter"
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                  />
                )}

                {/* Cadastral Parcels Layer */}
                {showParcels && visibleParcels.length > 0 && (
                  <GeoJSON 
                    data={parcelFeatureCollection}
                    style={(feature) => {
                      const parcelId = feature.properties?.parcel_id
                      const isSel = selectedParcelId === parcelId
                      return { 
                        color: isSel ? '#FFFFFF' : '#7657E8', 
                        weight: isSel ? 3 : 2, 
                        fillColor: '#7657E8', 
                        fillOpacity: isSel ? 0.25 : 0.08 
                      }
                    }} 
                    onEachFeature={(feature, layer) => layer.on('click', () => {
                      setSelectedFeature(feature)
                      const bounds = layer.getBounds()
                      if (bounds.isValid()) leafletMapRef.current?.fitBounds(bounds, { padding: [40, 40] })
                    })}
                  />
                )}

                {showReviewFlags && visibleReviewFeatures.length > 0 && (
                  <GeoJSON
                    data={reviewFeatureCollection}
                    style={() => ({
                      color: '#F59E0B',
                      weight: 3,
                      dashArray: '6 4',
                      fillColor: '#F59E0B',
                      fillOpacity: 0.12,
                    })}
                    onEachFeature={(feature, layer) => {
                      const reviewLabel = feature.properties?.exception_type || 'Review flag'
                      const id = featureId(feature)
                      layer.bindTooltip(`${reviewLabel}${id ? ` · ${id}` : ''}`)
                      layer.on('click', () => {
                        setSelectedFeature(feature)
                        const bounds = layer.getBounds()
                        if (bounds.isValid()) leafletMapRef.current?.fitBounds(bounds, { padding: [40, 40] })
                      })
                    }}
                  />
                )}

                {/* Geographic Buildings GeoJSON Layer */}
                {showBuildings && visibleBuildings.length > 0 && hasGeo && (
                  <GeoJSON
                    data={buildingFeatureCollection}
                    style={(feature) => {
                      const isSel = selectedFeature && (selectedFeature.id === feature.id || selectedFeature.properties?.building_id === feature.properties?.building_id)
                      return {
                        color: isSel ? '#FFFFFF' : '#00C7B7',
                        weight: isSel ? 3 : 2,
                        fillColor: '#00C7B7',
                        fillOpacity: isSel ? 0.6 : 0.35,
                      }
                    }}
                    onEachFeature={(feat, layer) => {
                      const id = featureId(feat)
                      const confidence = feat.properties?.confidence
                      if (id) layer.bindTooltip(`Building ${id}${confidence != null ? ` · Confidence ${(Number(confidence) * 100).toFixed(1)}%` : ''}`)
                      layer.on('click', () => {
                        setSelectedFeature(feat)
                        const bounds = layer.getBounds()
                        if (bounds.isValid()) leafletMapRef.current?.fitBounds(bounds, { padding: [40, 40] })
                      })
                    }}
                  />
                )}

                <MapEvents onMouseMove={setCursorPos} />
                <MapReset bounds={mapBounds} />
                <MapSizeInvalidator fullscreen={isFullscreen} />
              </MapContainer> : (
                <div className={`map-data-unavailable${!jobId && !demoRecord ? ' map-data-unavailable--empty' : ''}`}>
                  <Layers size={28} />
                  <strong>{demoRecord ? 'DATASET PREVIEW IS IN PIXEL SPACE' : !jobId ? 'NO ACTIVE ANALYSIS SELECTED' : hasPixel ? 'PIXEL-SPACE RESULT' : spatialInfo.kind === 'projected' ? `PROJECTED MAP CRS NOT SUPPORTED · ${spatialInfo.crs}` : 'GEOGRAPHIC MAP UNAVAILABLE'}</strong>
                  <span>
                    {demoRecord
                      ? 'This dataset has no reported geographic CRS. Open Pixel View to inspect the real image and available mask.'
                      : !jobId
                      ? 'Select a real completed job from the analysis selector, or start a new analysis.'
                      : hasPixel
                        ? 'This job contains pixel coordinates, not geographic CRS coordinates. Open Pixel View to inspect its real vector features.'
                        : spatialInfo.kind === 'projected'
                          ? 'The backend exposed a projected CRS. This Leaflet view cannot reproject it safely, so no geographic basemap is shown.'
                          : 'The backend did not expose a supported geographic CRS and mappable geometry for this job.'}
                  </span>
                  {!jobId && !demoRecord && (
                    <>
                      <div className="map-empty-state__facts">
                        <span><b>GEOGRAPHIC CRS</b> NOT DETECTED</span>
                        <span><b>PROJECT FEATURES</b> NOT AVAILABLE</span>
                        <span><b>BASEMAP</b> WAITING FOR REAL GEOGRAPHIC EXTENT</span>
                      </div>
                      <label className="map-empty-state__selector">
                        <span>SELECT AN EXISTING ANALYSIS</span>
                        <select
                          value=""
                          onChange={(event) => selectAnalysisJob(event.target.value)}
                          disabled={!historyJobs.length}
                          aria-label="Select an existing analysis job"
                        >
                          <option value="">{historyJobs.length ? 'Choose a job from operation history…' : 'No saved analyses returned by the API'}</option>
                          {historyJobs.map((job) => (
                            <option key={job.job_id} value={job.job_id}>
                              {job.input_filename || 'Input filename not available'} · #{job.job_id.slice(0, 8)} · {String(job.status || 'STATUS NOT AVAILABLE').toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="btn-geo btn-geo-primary btn-geo-sm" onClick={() => navigate('/analysis')}><Plus size={12} /> New Analysis</button>
                      {projectAerialMetadata?.available && (
                        <button
                          className="btn-geo btn-geo-secondary btn-geo-sm"
                          onClick={() => {
                            setProjectAerialImageError('')
                            setProjectAerialLoaded(false)
                            setViewMode('AERIAL')
                          }}
                        >
                          <Globe size={12} /> Open Project Aerial Preview
                        </button>
                      )}
                    </>
                  )}
                  {(demoRecord || (jobId && hasPixel)) && <button className="btn-geo btn-geo-secondary btn-geo-sm" onClick={() => setViewMode('PIXEL')}><Grid size={12} /> Open Pixel Canvas</button>}
                </div>
              )}

              {/* Pixel-Space Warning Banner */}
              {jobId && hasPixel && buildings.length > 0 && viewMode === '2D' && (
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 900,
                  background: 'rgba(245, 158, 11, 0.95)',
                  color: '#14232E',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '11px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.2)'
                }}>
                  <span>⚠️ Active job contains unreferenced pixel coordinates (No geospatial CRS detected).</span>
                  <button 
                    className="btn-geo btn-geo-secondary btn-geo-sm"
                    onClick={() => setViewMode('PIXEL')}
                    style={{ fontSize: '10px', padding: '3px 8px', background: '#FFFFFF', borderColor: '#14232E', color: '#14232E' }}
                  >
                    Open Pixel Canvas
                  </button>
                </div>
              )}
            </div>
          )}
          {demoRecord && !demoImageLoaded && !demoImageError && viewMode === 'PIXEL' && (
            <div className="map-raster-loading" role="status">
              <RefreshCw size={15} className="map-refresh-spin" /> Loading image...
            </div>
          )}
        </div>

        {/* Right: Spatial Intelligence Inspector Drawer */}
        {selectedFeature && (
          <div className="map-inspector-card">
            {/* Header */}
            <div className="map-inspector-header">
              <div style={{ minWidth: 0 }}>
                <span className="page-eyebrow" style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  SPATIAL INTELLIGENCE
                  {isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>}
                </span>
                <h3 className="geo-card-title" style={{ fontSize: '13px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedProps.building_id
                    ? `Building ${selectedProps.building_id}`
                    : selectedParcelId
                    ? `Parcel ${selectedParcelId}`
                    : 'Feature'}
                </h3>
              </div>
              <button
                className="btn-geo btn-geo-secondary btn-geo-sm"
                onClick={() => { setSelectedFeature(null); setIsolatedFeature(null); setShowGeomModal(false) }}
                title="Close Inspector"
                aria-label="Close Spatial Intelligence panel"
                style={{ padding: '2px 6px', flexShrink: 0 }}
              >
                <X size={12} />
              </button>
            </div>

            {/* Conflict alert */}
            {isBoundaryConflict && (
              <div style={{ margin: '8px 14px 0', padding: '6px 10px', background: '#FEF6E9', border: '1px solid #FCE1B3', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#B3740D', fontWeight: '800', fontSize: '10px' }}>
                  <ShieldAlert size={12} />
                  BOUNDARY EXCEPTION — REVIEW REQUIRED
                </div>
              </div>
            )}

            {/* Tab Bar */}
            <div className="insp-tab-bar" role="tablist" aria-label="Feature information sections">
              {['OVERVIEW', 'GEOMETRY', 'CADASTRAL', 'AI ANALYSIS', 'DATA'].map((t) => (
                <button
                  key={t}
                  className={`insp-tab${inspectorTab === t ? ' active' : ''}`}
                  onClick={() => setInspectorTab(t)}
                  role="tab"
                  aria-selected={inspectorTab === t}
                  aria-controls="map-inspector-tabpanel"
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div className="map-inspector-body" id="map-inspector-tabpanel" role="tabpanel">

              {/* OVERVIEW TAB */}
              {inspectorTab === 'OVERVIEW' && (
                <div>
                  <div className="inspector-section-title">
                    <Sparkles size={10} style={{ color: '#00C7B7' }} /> Overview
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Feature ID</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.building_id || selectedParcelId || 'NOT AVAILABLE'}
                    </span>
                  </div>
                  {selectedProps.review_id && (
                    <div className="inspector-field-compact">
                      <span className="inspector-field-compact-label">Review Record</span>
                      <span className="inspector-field-compact-value">
                        {selectedProps.exception_type || 'Review flag'}
                        {selectedProps.review_status ? ` · ${selectedProps.review_status}` : ''}
                      </span>
                    </div>
                  )}
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Model Confidence</span>
                    <span className="inspector-field-compact-value" style={{ color: selectedProps.confidence != null ? '#00897B' : '#8E9FA9' }}>
                      {selectedProps.confidence != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {(Number(selectedProps.confidence) * 100).toFixed(1)}%</>
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Footprint Area</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.area_m2 != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(selectedProps.area_m2).toFixed(1)} m\u00b2</>
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Perimeter</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.perimeter_m != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(selectedProps.perimeter_m).toFixed(1)} m</>
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Building Height</span>
                    <span className="inspector-field-compact-value" style={{ color: selectedProps.height_m != null ? '#14232E' : '#8E9FA9' }}>
                      {selectedProps.height_m != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(selectedProps.height_m).toFixed(1)} m</>
                        : 'HEIGHT DATA NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Target Parcel</span>
                    <span className="inspector-field-compact-value" style={{ color: selectedParcelId ? '#7657E8' : '#8E9FA9' }}>
                      {selectedParcelId || 'NOT ASSIGNED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Spatial Consensus</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.spatial_consensus || selectedProps.consensus_status || 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Quality Class</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.quality_class
                        ? <span className={`insp-badge ${(selectedProps.quality_class || '').toUpperCase().includes('LOW') ? 'insp-badge-warn' : 'insp-badge-ok'}`}>
                            {selectedProps.quality_class}
                          </span>
                        : <span className="insp-badge insp-badge-na">NOT AVAILABLE</span>}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Review Required</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.review_required != null
                        ? selectedProps.review_required
                          ? <span className="insp-badge insp-badge-err">YES</span>
                          : <span className="insp-badge insp-badge-ok">NO</span>
                        : isBoundaryConflict
                        ? <span className="insp-badge insp-badge-err">YES</span>
                        : <span className="insp-badge insp-badge-na">NOT REPORTED</span>}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Coordinate Space</span>
                    <span className="inspector-field-compact-value">
                      {hasGeo
                        ? <span className="insp-badge insp-badge-ok">GEOGRAPHIC</span>
                        : hasPixel
                          ? <span className="insp-badge insp-badge-na">PIXEL SPACE</span>
                          : <span className="insp-badge insp-badge-na">CRS NOT DETECTED</span>}
                    </span>
                  </div>
                </div>
              )}

              {/* GEOMETRY TAB */}
              {inspectorTab === 'GEOMETRY' && (
                <div>
                  <div className="inspector-section-title">
                    <Compass size={10} style={{ color: '#4D7CFE' }} /> Geometry &amp; Dimensions
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Geometry Type</span>
                    <span className="inspector-field-compact-value">
                      {selectedFeature?.geometry?.type || 'NOT REPORTED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Vertices</span>
                    <span className="inspector-field-compact-value">
                      {geometryPoints(selectedFeature?.geometry).length || 'NOT REPORTED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Footprint Area</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.area_m2 != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(selectedProps.area_m2).toFixed(2)} m\u00b2 <span style={{ color: '#8E9FA9', fontSize: '9px' }}>(proj.)</span></>
                        : hasGeo
                          ? <span style={{ color: '#8E9FA9' }}>NOT REPORTED</span>
                          : <span style={{ color: '#8E9FA9' }}>PIXEL SPACE</span>}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Perimeter</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.perimeter_m != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(selectedProps.perimeter_m).toFixed(2)} m</>
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Height (DSM)</span>
                    <span className="inspector-field-compact-value" style={{ color: selectedProps.height_m != null ? '#14232E' : '#8E9FA9' }}>
                      {selectedProps.height_m != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(selectedProps.height_m).toFixed(1)} m</>
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">CRS</span>
                    <span className="inspector-field-compact-value">
                      {hasGeo ? spatialInfo.crs : hasPixel ? 'PIXEL SPACE' : spatialInfo.crs || 'CRS NOT DETECTED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Measurement CRS</span>
                    <span className="inspector-field-compact-value" style={{ color: '#8E9FA9' }}>
                      NOT AVAILABLE
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Coordinate Space</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.coordinate_space || (hasGeo ? 'geographic' : hasPixel ? 'pixel' : 'NOT REPORTED')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button className="btn-geo btn-geo-secondary" style={{ fontSize: '10px', padding: '4px 8px' }} onClick={zoomToFeature}>
                      <Crosshair size={11} /> Zoom to
                    </button>
                    <button className="btn-geo btn-geo-secondary" style={{ fontSize: '10px', padding: '4px 8px' }} onClick={() => setShowGeomModal(true)}>
                      <Ruler size={11} /> Inspect Vertices
                    </button>
                  </div>
                  {showGeomModal && (
                    <div style={{ marginTop: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '10px', fontSize: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <strong style={{ color: '#14232E' }}>GEOMETRY DETAIL</strong>
                        <button type="button" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#647580' }} aria-label="Close geometry details" onClick={() => setShowGeomModal(false)}>
                          <X size={11} />
                        </button>
                      </div>
                      <div style={{ fontFamily: 'monospace', color: '#14232E', lineHeight: '1.6' }}>
                        <div>Type: {selectedFeature?.geometry?.type || '\u2014'}</div>
                        <div>Vertices: {geometryPoints(selectedFeature?.geometry).length || 'NOT REPORTED'}</div>
                        <div>CRS: {hasGeo ? spatialInfo.crs : hasPixel ? 'PIXEL SPACE' : spatialInfo.crs || 'CRS NOT DETECTED'}</div>
                        <div>Area: {selectedProps.area_m2 != null ? `${Number(selectedProps.area_m2).toFixed(2)} m\u00b2` : 'NOT REPORTED'}</div>
                        <div>Perimeter: {selectedProps.perimeter_m != null ? `${Number(selectedProps.perimeter_m).toFixed(2)} m` : 'NOT REPORTED'}</div>
                        <div>Bounding box: {geometryPoints(selectedFeature?.geometry).length ? (() => {
                          const points = geometryPoints(selectedFeature.geometry)
                          const xs = points.map((point) => point[0])
                          const ys = points.map((point) => point[1])
                          return `${Math.min(...xs)}, ${Math.min(...ys)} — ${Math.max(...xs)}, ${Math.max(...ys)}`
                        })() : 'NOT AVAILABLE'}</div>
                        <div>Validity: {selectedProps.geometry_valid == null ? 'UNKNOWN' : selectedProps.geometry_valid ? 'VALID' : 'INVALID'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CADASTRAL TAB */}
              {inspectorTab === 'CADASTRAL' && (
                <div>
                  <div className="inspector-section-title">
                    <Grid size={10} style={{ color: '#7657E8' }} /> Cadastral Relation
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                    <div style={{ display: 'inline-block', background: '#EEF2FF', border: '1px solid #7657E8', borderRadius: '5px', padding: '4px 12px', fontSize: '11px', fontWeight: '700', color: '#7657E8' }}>
                      {selectedProps.building_id || selectedParcelId || 'FEATURE'}
                    </div>
                    {selectedParcelId && selectedProps.building_id && (
                      <>
                        <div style={{ height: '12px', borderLeft: '2px dashed #7657E8', margin: '0 auto', width: 0 }} />
                        <ArrowRight size={14} style={{ color: '#7657E8', transform: 'rotate(90deg)' }} />
                        <div style={{ height: '6px', borderLeft: '2px dashed #7657E8', margin: '0 auto', width: 0 }} />
                        <div style={{ display: 'inline-block', background: '#F5F3FF', border: '1px solid #7657E8', borderRadius: '5px', padding: '4px 12px', fontSize: '11px', fontWeight: '700', color: '#7657E8' }}>
                          {selectedParcelId}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Linked Parcel ID</span>
                    <span className="inspector-field-compact-value" style={{ color: selectedParcelId ? '#7657E8' : '#8E9FA9' }}>
                      {selectedParcelId || 'NOT ASSIGNED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Association Confidence</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.association_confidence != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {(Number(selectedProps.association_confidence) * 100).toFixed(1)}%</>
                        : 'NOT REPORTED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Boundary Relationship</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.boundary_status
                        ? <span className={`insp-badge ${isBoundaryConflict ? 'insp-badge-warn' : 'insp-badge-ok'}`}>{selectedProps.boundary_status}</span>
                        : <span className="insp-badge insp-badge-na">NOT AVAILABLE</span>}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Parcel Artifacts</span>
                    <span className="inspector-field-compact-value">
                      {reportedParcelCount === 0
                        ? 'NO PARCEL DATA'
                        : parcelResults && (parcelResults.association || parcelResults.statistics)
                        ? 'RESULT DATA AVAILABLE · GEOMETRY NOT EXPOSED'
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  {(() => {
                    const linked = parcels.find((p) => (p.properties?.parcel_id || p.parcel_id) === selectedParcelId)
                    const lp = linked?.properties || linked || {}
                    if (!linked) return (
                      <div className="inspector-field-compact">
                        <span className="inspector-field-compact-label">Parcel Area</span>
                        <span className="inspector-field-compact-value" style={{ color: '#8E9FA9' }}>NOT AVAILABLE</span>
                      </div>
                    )
                    return (
                      <>
                        <div className="inspector-field-compact">
                          <span className="inspector-field-compact-label">Parcel Area</span>
                          <span className="inspector-field-compact-value">
                            {lp.area_m2 != null
                              ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(lp.area_m2).toFixed(1)} m\u00b2</>
                              : 'NOT REPORTED'}
                          </span>
                        </div>
                        <div className="inspector-field-compact">
                          <span className="inspector-field-compact-label">Parcel Status</span>
                          <span className="inspector-field-compact-value">
                            {lp.boundary_status
                              ? <span className="insp-badge insp-badge-ok">{lp.boundary_status}</span>
                              : <span className="insp-badge insp-badge-na">NOT REPORTED</span>}
                          </span>
                        </div>
                        {selectedProps.area_m2 != null && lp.area_m2 != null && (
                          <div className="inspector-field-compact">
                            <span className="inspector-field-compact-label">Building Coverage</span>
                            <span className="inspector-field-compact-value">
                              {isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {((selectedProps.area_m2 / lp.area_m2) * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button className="btn-geo btn-geo-secondary" style={{ fontSize: '10px', padding: '4px 8px' }} onClick={showRelatedParcel} title="Show linked parcel geometry if returned by the backend">
                      <Grid size={11} /> View Parcel
                    </button>
                    <button className="btn-geo btn-geo-secondary" style={{ fontSize: '10px', padding: '4px 8px' }} onClick={zoomToFeature}>
                      <Crosshair size={11} /> Zoom to
                    </button>
                  </div>
                </div>
              )}

              {/* AI ANALYSIS TAB */}
              {inspectorTab === 'AI ANALYSIS' && (
                <div>
                  <div className="inspector-section-title">
                    <Sparkles size={10} style={{ color: '#00C7B7' }} /> AI Extraction
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Model</span>
                    <span className="inspector-field-compact-value">
                      {isDemoFeature
                        ? <>{selectedProps.source_model || 'NOT AVAILABLE'}</>
                        : (selectedProps.source_model || 'NOT AVAILABLE')}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Confidence</span>
                    <span className="inspector-field-compact-value" style={{ color: selectedProps.confidence != null ? '#00897B' : '#8E9FA9' }}>
                      {selectedProps.confidence != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {(Number(selectedProps.confidence) * 100).toFixed(1)}%</>
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  {selectedProps.confidence != null && (
                    <div style={{ margin: '2px 0 6px', height: '4px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(Number(selectedProps.confidence) * 100).toFixed(0)}%`,
                        height: '100%',
                        background: Number(selectedProps.confidence) > 0.75 ? '#00C7B7' : Number(selectedProps.confidence) > 0.5 ? '#F59E0B' : '#EF4444',
                        borderRadius: '2px',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  )}
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Detection Status</span>
                    <span className="inspector-field-compact-value">
                      {isDemoFeature
                        ? <span className="insp-badge insp-badge-demo">DEMO FEATURE</span>
                        : selectedProps.detection_status
                          ? <span className="insp-badge insp-badge-ok">{selectedProps.detection_status}</span>
                          : <span className="insp-badge insp-badge-na">NOT REPORTED</span>}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Segmentation Quality</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.segmentation_quality != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {selectedProps.segmentation_quality}</>
                        : <span className="insp-badge insp-badge-na">NOT REPORTED</span>}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">IoU (feature-level)</span>
                    <span className="inspector-field-compact-value" style={{ color: '#8E9FA9' }}>
                      {selectedProps.iou != null
                        ? <>{isDemoFeature && <span className="insp-badge insp-badge-demo">DEMO</span>} {Number(selectedProps.iou).toFixed(3)}</>
                        : 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Boundary Quality</span>
                    <span className="inspector-field-compact-value" style={{ color: '#8E9FA9' }}>
                      {selectedProps.boundary_quality || 'NOT REPORTED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">False Positive Risk</span>
                    <span className="inspector-field-compact-value" style={{ color: '#8E9FA9' }}>
                      {selectedProps.false_positive_risk || 'NOT REPORTED'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Review Required</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.review_required != null
                        ? selectedProps.review_required
                          ? <span className="insp-badge insp-badge-err">YES</span>
                          : <span className="insp-badge insp-badge-ok">NO</span>
                        : isBoundaryConflict
                        ? <span className="insp-badge insp-badge-err">YES</span>
                        : <span className="insp-badge insp-badge-na">NOT REPORTED</span>}
                    </span>
                  </div>
                </div>
              )}

              {/* DATA TAB */}
              {inspectorTab === 'DATA' && (
                <div>
                  <div className="inspector-section-title">
                    <Database size={10} style={{ color: '#10B981' }} /> Data Provenance
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Input</span>
                    <span className="inspector-field-compact-value">
                      {resultsSummary?.input_filename || historyJobs.find((job) => job.job_id === jobId)?.input_filename || 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Raster Size</span>
                    <span className="inspector-field-compact-value">
                      NOT AVAILABLE
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Source CRS</span>
                    <span className="inspector-field-compact-value">
                      {spatialInfo.crs || (hasPixel ? 'PIXEL SPACE' : 'CRS NOT DETECTED')}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">AI Segmentation</span>
                    <span className="inspector-field-compact-value">
                      {selectedProps.source_model || resultsSummary?.model_name || historyJobs.find((job) => job.job_id === jobId)?.model_name || 'NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Cadastral Layer</span>
                    <span className="inspector-field-compact-value">
                      {parcels.length > 0
                        ? <span className="insp-badge insp-badge-ok">GEOMETRY AVAILABLE</span>
                        : <span className="insp-badge insp-badge-na">NOT AVAILABLE</span>}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">DSM / DTM</span>
                    <span className="inspector-field-compact-value">
                      <span className="insp-badge insp-badge-na">NOT AVAILABLE</span>
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">GNSS / CORS</span>
                    <span className="inspector-field-compact-value">
                      <span className="insp-badge insp-badge-na">NOT AVAILABLE</span>
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Analysis Job</span>
                    <span className="inspector-field-compact-value" style={{ color: jobId ? '#14232E' : '#8E9FA9', wordBreak: 'break-all' }}>
                      {jobId ? jobId.slice(0, 16) + '\u2026' : 'NO JOB CONTEXT'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">API</span>
                    <span className="inspector-field-compact-value">
                      {health?.status || 'STATUS NOT AVAILABLE'}
                    </span>
                  </div>
                  {health?.database && (
                    <div className="inspector-field-compact">
                      <span className="inspector-field-compact-label">Database</span>
                      <span className="inspector-field-compact-value">
                        {health.database.status || 'STATUS NOT AVAILABLE'}
                      </span>
                    </div>
                  )}
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">PostGIS</span>
                    <span className="inspector-field-compact-value">
                      {postgisInfo
                        ? `${postgisInfo.status || 'STATUS NOT AVAILABLE'}${postgisInfo.version ? ` · ${postgisInfo.version}` : ''}`
                        : 'STATUS NOT AVAILABLE'}
                    </span>
                  </div>
                  <div className="inspector-field-compact">
                    <span className="inspector-field-compact-label">Processing Status</span>
                    <span className="inspector-field-compact-value">
                      {resultsSummary?.status || historyJobs.find((job) => job.job_id === jobId)?.status || 'NOT AVAILABLE'}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    className={`btn-geo ${isolatedFeature ? 'btn-geo-primary' : 'btn-geo-secondary'}`}
                    onClick={() => setIsolatedFeature(isolatedFeature ? null : selectedFeature)}
                    style={{ flex: 1, fontSize: '10px', padding: '5px 6px' }}
                    title="Dim all other features"
                  >
                    <Eye size={11} /> {isolatedFeature ? 'Exit Isolation' : 'Isolate'}
                  </button>
                  <button
                    className="btn-geo btn-geo-secondary"
                    onClick={zoomToFeature}
                    style={{ flex: 1, fontSize: '10px', padding: '5px 6px' }}
                    title="Zoom map to this feature"
                  >
                    <Crosshair size={11} /> Zoom To
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button
                    className="btn-geo btn-geo-secondary"
                    onClick={showRelatedParcel}
                    disabled={!selectedParcelId}
                    style={{ flex: 1, fontSize: '10px', padding: '5px 6px', opacity: selectedParcelId ? 1 : 0.5 }}
                    title={selectedParcelId ? 'Navigate to linked parcel geometry if exposed' : 'No target parcel is assigned to this feature'}
                  >
                    <Grid size={11} /> {selectedParcelId ? 'Show Parcel' : 'No Parcel'}
                  </button>
                  <button
                    className="btn-geo btn-geo-secondary"
                    onClick={() => { setInspectorTab('GEOMETRY'); setShowGeomModal(true) }}
                    style={{ flex: 1, fontSize: '10px', padding: '5px 6px' }}
                    title="Open geometry detail"
                  >
                    <Ruler size={11} /> Geometry
                  </button>
                </div>
                {jobId ? (
                  <button
                    className="btn-geo btn-geo-secondary"
                    onClick={() => navigate(`/results/${jobId}`)}
                    style={{ width: '100%', fontSize: '10px', padding: '5px 6px' }}
                  >
                    <ExternalLink size={11} /> Open Results ({jobId.slice(0, 8)}\u2026)
                  </button>
                ) : (
                  <button className="btn-geo btn-geo-secondary" disabled style={{ width: '100%', opacity: 0.5, fontSize: '10px', padding: '5px 6px' }}>
                    NO ANALYSIS CONTEXT
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
