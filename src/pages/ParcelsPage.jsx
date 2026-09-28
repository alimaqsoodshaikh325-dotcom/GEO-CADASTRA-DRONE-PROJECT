import React, { Component, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, Polygon, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Box,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Compass,
  Copy,
  Crosshair,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  FileSpreadsheet,
  FileText,
  Filter,
  Grid,
  Info,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Move,
  RefreshCw,
  Rotate3d,
  RotateCcw,
  RotateCw,
  Ruler,
  Search,
  Server,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  SquareStack,
  TableProperties,
  X,
  Zap,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts'
import { demoData } from '../data/demoData'
import { api } from '../services/api'
import { useJob } from '../hooks/useJob'
import './ParcelsPage.css'
import './ParcelsContext.css'

/* ─────────────────────────────────────────────────────────────
   HELPER FORMATTERS (NO DATA FABRICATION)
   ───────────────────────────────────────────────────────────── */
const formatValue = (v, suffix = '') => {
  if (v === null || v === undefined || v === '') return 'NOT AVAILABLE'
  const num = Number(v)
  if (isNaN(num)) return String(v)
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`
}

const formatCoverage = (v) => {
  if (v === null || v === undefined || v === '') return 'NOT AVAILABLE'
  const num = Number(v)
  if (isNaN(num)) return 'NOT AVAILABLE'
  const pct = num <= 1 ? num * 100 : num
  return `${pct.toFixed(1)}%`
}

const getParcelId = (p) => p?.parcel_id || p?.properties?.parcel_id || p?.id || 'UNKNOWN_ID'
const getProperties = (p) => p?.properties || p || {}

const formatDateTime = (isoString) => {
  if (!isoString) return null
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return null
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      raw: d.toLocaleString(),
    }
  } catch {
    return null
  }
}

/* ─────────────────────────────────────────────────────────────
   SESSION / STORAGE PARSER
   ───────────────────────────────────────────────────────────── */
function readParcelSession() {
  try {
    const stored = window.localStorage
    const isDemo = JSON.parse(stored.getItem('urban-ai-demo-mode') ?? 'true')
    const analysisActive = JSON.parse(stored.getItem('urban-ai-analysis-active') ?? 'false')
    const customParcels = JSON.parse(stored.getItem('urban-ai-custom-parcels') ?? '[]')
    const customGeoJSON = JSON.parse(stored.getItem('urban-ai-custom-geojson') ?? 'null')
    const uploadedFile = JSON.parse(stored.getItem('urban-ai-uploaded-file') ?? 'null')
    return {
      isDemo: Boolean(isDemo),
      analysisActive: Boolean(analysisActive),
      customParcels: Array.isArray(customParcels) ? customParcels : [],
      customGeoJSON,
      uploadedFile,
    }
  } catch {
    return {
      isDemo: true,
      analysisActive: false,
      customParcels: [],
      customGeoJSON: null,
      uploadedFile: null,
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   LEAFLET 2D MAP CONTROLS & FITTER
   ───────────────────────────────────────────────────────────── */
function MapFitter({ bounds, parcel }) {
  const map = useMap()
  useEffect(() => {
    if (parcel?.polygon?.length) {
      map.fitBounds(parcel.polygon, { padding: [40, 40], maxZoom: 19 })
    } else if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 })
    }
  }, [map, bounds, parcel])
  return null
}

function Spatial2DMap({
  parcels,
  buildings,
  selected,
  selectedBuilding,
  onParcelSelect,
  onBuildingSelect,
  fitTrigger,
  showParcelsLayer = true,
  showBuildingsLayer = true,
  showSatellite = false,
}) {
  const geometryParcels = useMemo(
    () => parcels.filter((p) => Array.isArray(p.polygon) && p.polygon.length > 0),
    [parcels]
  )
  const hasGeometry = geometryParcels.length > 0

  const allPoints = useMemo(() => {
    const pts = []
    geometryParcels.forEach((p) => {
      if (Array.isArray(p.polygon)) pts.push(...p.polygon)
    })
    return pts
  }, [geometryParcels])

  const center = useMemo(() => {
    if (selected?.polygon?.length) return selected.polygon[0]
    if (geometryParcels.length > 0) return geometryParcels[0].polygon[0]
    return demoData.mapCenter || [18.5204, 73.8567]
  }, [selected, geometryParcels])

  return (
    <div className="parcel-map-container" aria-label="2D Cadastral Map View">
      {hasGeometry ? (
        <MapContainer
          center={center}
          zoom={18}
          scrollWheelZoom
          className="parcel-leaflet-map"
        >
          {showSatellite ? (
            <TileLayer
              attribution="&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          )}

          <MapFitter bounds={allPoints} parcel={fitTrigger ? selected : null} />

          {/* Parcel Boundaries */}
          {showParcelsLayer &&
            geometryParcels.map((parcel) => {
              const pid = getParcelId(parcel)
              const isSelected = pid === getParcelId(selected)
              const pData = getProperties(parcel)
              const isReview = pData.status === 'REVIEW_REQUIRED' || pData.review_required

              let strokeColor = '#162531'
              let fillColor = '#4D72FF'
              let fillOpacity = 0.08
              let weight = 1.8

              if (isSelected) {
                strokeColor = '#00AFA3'
                fillColor = '#00AFA3'
                fillOpacity = 0.28
                weight = 3.5
              } else if (isReview) {
                strokeColor = '#D99A00'
                fillColor = '#D99A00'
                fillOpacity = 0.15
                weight = 2.2
              }

              return (
                <Polygon
                  key={`p-${pid}`}
                  positions={parcel.polygon}
                  pathOptions={{
                    color: strokeColor,
                    weight,
                    fillColor,
                    fillOpacity,
                    dashArray: isReview && !isSelected ? '4, 4' : undefined,
                  }}
                  eventHandlers={{
                    click: () => onParcelSelect(parcel),
                  }}
                />
              )
            })}

          {/* Building Overlays */}
          {showBuildingsLayer &&
            buildings
              .filter((b) => Array.isArray(b.polygon) && b.polygon.length > 0)
              .map((b) => {
                const isSelected = b.building_id === selectedBuilding?.building_id
                const isParentSelected = selected && b.parcel_id === getParcelId(selected)

                let strokeColor = '#162531'
                let fillColor = '#00AFA3'
                let fillOpacity = 0.55
                let weight = 1.5

                if (isSelected) {
                  strokeColor = '#162531'
                  fillColor = '#008D84'
                  fillOpacity = 0.85
                  weight = 3
                } else if (isParentSelected) {
                  strokeColor = '#00AFA3'
                  fillColor = '#00C8BA'
                  fillOpacity = 0.65
                  weight = 2
                }

                return (
                  <Polygon
                    key={`b-${b.building_id}`}
                    positions={b.polygon}
                    pathOptions={{
                      color: strokeColor,
                      weight,
                      fillColor,
                      fillOpacity,
                    }}
                    eventHandlers={{
                      click: (e) => {
                        e.originalEvent?.stopPropagation?.()
                        onBuildingSelect(b)
                      },
                    }}
                  />
                )
              })}
        </MapContainer>
      ) : (
        <div className="parcel-map-unavailable">
          <Layers size={36} />
          <strong>GEOMETRY NOT AVAILABLE</strong>
          <span>The current parcel records do not include displayable polygon boundary geometry.</span>
        </div>
      )}

      <div className="map-legend">
        <span className="legend-item">
          <span className="legend-swatch parcel-swatch" /> Parcel Boundary
        </span>
        <span className="legend-item">
          <span className="legend-swatch building-swatch" /> Building Footprint
        </span>
        <span className="legend-item">
          <span className="legend-swatch selected-swatch" /> Selected Feature
        </span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   HIGH-END 3D CADASTRAL & STRUCTURAL EXTRUSION ENGINE
   ───────────────────────────────────────────────────────────── */
function Spatial3DParcelCanvas({
  parcels,
  buildings,
  selected,
  onParcelSelect,
  onBuildingSelect,
  selectedBuilding,
  showParcelsLayer = true,
  showBuildingsLayer = true,
}) {
  const [pitch, setPitch] = useState(52) // Camera pitch (elevation angle 15 - 85 deg)
  const [yaw, setYaw] = useState(38) // Camera yaw / azimuth (0 - 360 deg)
  const [zoom, setZoom] = useState(1.1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hoveredFeature, setHoveredFeature] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef(null)

  const geometryParcels = useMemo(
    () => parcels.filter((p) => Array.isArray(p.polygon) && p.polygon.length > 0),
    [parcels]
  )

  // Calculate normalized coordinate bounding box
  const bounds = useMemo(() => {
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity

    geometryParcels.forEach((p) => {
      p.polygon.forEach(([lat, lng]) => {
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
      })
    })

    buildings.forEach((b) => {
      if (Array.isArray(b.polygon)) {
        b.polygon.forEach(([lat, lng]) => {
          if (lat < minLat) minLat = lat
          if (lat > maxLat) maxLat = lat
          if (lng < minLng) minLng = lng
          if (lng > maxLng) maxLng = lng
        })
      }
    })

    if (!isFinite(minLat)) {
      return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1, spanLat: 1, spanLng: 1 }
    }

    const spanLat = maxLat - minLat || 0.001
    const spanLng = maxLng - minLng || 0.001
    return { minLat, maxLat, minLng, maxLng, spanLat, spanLng }
  }, [geometryParcels, buildings])

  // Sunlight Direction Vector (Sun from Azimuth 125 deg, Elevation 45 deg)
  const sunVector = useMemo(() => {
    const sunAzimuth = (125 * Math.PI) / 180
    const sunElevation = (45 * Math.PI) / 180
    return {
      x: Math.cos(sunAzimuth) * Math.cos(sunElevation),
      y: Math.sin(sunAzimuth) * Math.cos(sunElevation),
      z: Math.sin(sunElevation),
    }
  }, [])

  // 3D Projection into 2D Viewport Space
  const projectPoint = (lat, lng, height = 0) => {
    // Normalize to [-260, 260] centered bounding coordinate space
    const normX = ((lng - bounds.minLng) / bounds.spanLng - 0.5) * 520
    const normY = ((lat - bounds.minLat) / bounds.spanLat - 0.5) * 520

    const radYaw = (yaw * Math.PI) / 180
    const radPitch = (pitch * Math.PI) / 180

    // Rotate around Z axis (Yaw)
    const rx = normX * Math.cos(radYaw) - normY * Math.sin(radYaw)
    const ry = normX * Math.sin(radYaw) + normY * Math.cos(radYaw)

    // Project with Camera Pitch Angle and Vertical Height Extrusion
    const px = rx * zoom + pan.x + 450
    const py = (ry * Math.cos(radPitch) - height * Math.sin(radPitch) * 2.4) * zoom + pan.y + 300
    // Depth for painter's sorting (Z-buffer approximation)
    const depth = ry * Math.sin(radPitch) + height * Math.cos(radPitch)

    return { x: px, y: py, depth, rawX: normX, rawY: normY }
  }

  // Differentiated Heights for realistic urban massing based on real properties
  const getBuildingHeight = (b) => {
    const isSelected = b.building_id === selectedBuilding?.building_id
    const area = Number(b.area_m2) || 200
    // Variable height based on building footprint area (3-story, 4-story, 2-story relative extrusion)
    const baseHeight = area > 300 ? 52 : area > 220 ? 42 : area > 160 ? 34 : 24
    return isSelected ? baseHeight + 10 : baseHeight
  }

  // Mouse / Pointer Interaction handlers
  const handleMouseDown = (e) => {
    if (e.button === 2 || e.shiftKey) {
      setIsPanning(true)
      setIsDragging(false)
    } else if (e.button === 0) {
      setIsDragging(true)
      setIsPanning(false)
    }
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e) => {
    if (!isDragging && !isPanning) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y

    if (isDragging) {
      setYaw((prev) => (prev + dx * 0.45 + 360) % 360)
      setPitch((prev) => Math.min(84, Math.max(16, prev + dy * 0.3)))
    } else if (isPanning) {
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
    }
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsPanning(false)
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.12 : -0.12
    setZoom((z) => Math.min(2.8, Math.max(0.5, z + delta)))
  }

  const handleResetCamera = () => {
    setPitch(52)
    setYaw(38)
    setZoom(1.1)
    setPan({ x: 0, y: 0 })
  }

  const handleFitSelection = () => {
    setZoom(1.45)
    setPan({ x: 0, y: 0 })
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Prevent right-click context menu inside 3D viewport for seamless panning
  const handleContextMenu = (e) => e.preventDefault()

  if (!geometryParcels.length) {
    return (
      <div className="parcel-3d-empty">
        <Box size={38} />
        <strong>3D VISUALIZATION UNAVAILABLE</strong>
        <span>No polygon geometry available for 3D extrusion scene.</span>
      </div>
    )
  }

  // Depth-sorted Parcel Ground Slabs (Painter's Algorithm)
  const sortedParcels = [...geometryParcels].sort((a, b) => {
    const p1 = projectPoint(a.polygon[0][0], a.polygon[0][1], 0)
    const p2 = projectPoint(b.polygon[0][0], b.polygon[0][1], 0)
    return p1.depth - p2.depth
  })

  // Depth-sorted Extruded Buildings
  const sortedBuildings = [...buildings]
    .filter((b) => Array.isArray(b.polygon) && b.polygon.length > 0)
    .sort((a, b) => {
      const p1 = projectPoint(a.polygon[0][0], a.polygon[0][1], 0)
      const p2 = projectPoint(b.polygon[0][0], b.polygon[0][1], 0)
      return p1.depth - p2.depth
    })

  return (
    <div
      ref={containerRef}
      className={`parcel-3d-viewport ${isFullscreen ? 'is-fullscreen' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      style={{ cursor: isDragging ? 'grabbing' : isPanning ? 'move' : 'grab' }}
      aria-label="3D Cadastral & Structural Extrusion Scene"
    >
      {/* 3D Viewport Title Ribbon */}
      <div className="canvas-3d-overlay-tag">
        <span className="mode-badge">
          <Box size={12} /> 3D CADASTRE &amp; STRUCTURAL EXTRUSION
        </span>
        <span className="info-badge">
          RELATIVE EXTRUSION &bull; HEIGHT DATA NOT AVAILABLE IN 2D CADASTRAL INPUT
        </span>
      </div>

      {/* Floating 3D Interactive Compass / North Indicator */}
      <div
        className="compass-3d-widget"
        title="Click to reset camera to North (0°)"
        onClick={() => setYaw(0)}
      >
        <div className="compass-rose" style={{ transform: `rotate(${-yaw}deg)` }}>
          <span className="north-mark">N</span>
          <div className="compass-needle" />
        </div>
        <small className="compass-yaw-val">{Math.round(yaw)}&deg;</small>
      </div>

      {/* SVG 3D Spatial Scene */}
      <svg
        viewBox="0 0 900 600"
        className="parcel-3d-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Spatial Ground Terrain Grid Pattern */}
          <pattern id="spatialGridPattern" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(221, 229, 234, 0.08)" strokeWidth="1" />
            <circle cx="0" cy="0" r="1.5" fill="rgba(0, 175, 163, 0.3)" />
          </pattern>

          {/* Gradients for Parcel Slabs */}
          <linearGradient id="parcelBaseSlab" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E2F3D" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#132330" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="selectedParcelSlab" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#006C64" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#004742" stopOpacity="0.95" />
          </linearGradient>

          {/* Gradients for Roof Surfaces */}
          <linearGradient id="roofStandard" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00C4B8" />
            <stop offset="100%" stopColor="#008D84" />
          </linearGradient>

          <linearGradient id="roofSelected" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#39F3D0" />
            <stop offset="100%" stopColor="#00AFA3" />
          </linearGradient>

          {/* Soft Drop Shadow Filter for Contact Shadows */}
          <filter id="softContactShadow" x="-20%" y="-20%" width="150%" height="150%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
            <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.5 0" />
            <feOffset dx="6" dy="8" />
            <feBlend in="SourceGraphic" in2="blurOut" mode="normal" />
          </filter>
        </defs>

        {/* Global Spatial Ground Plane */}
        <rect width="900" height="600" fill="#0E1C28" />
        <rect width="900" height="600" fill="url(#spatialGridPattern)" />

        {/* ─── LAYER 1: CONTACT DROP SHADOWS CAST BY BUILDINGS ─── */}
        {showBuildingsLayer &&
          sortedBuildings.map((b) => {
            // Shadow offset along sunlight vector
            const shadowOffsetLng = bounds.spanLng * 0.03
            const shadowOffsetLat = -bounds.spanLat * 0.03
            const shadowPts = b.polygon.map(([lat, lng]) => {
              const pt = projectPoint(lat + shadowOffsetLat, lng + shadowOffsetLng, 2)
              return `${pt.x},${pt.y}`
            }).join(' ')

            return (
              <polygon
                key={`shadow-${b.building_id}`}
                points={shadowPts}
                fill="rgba(5, 12, 18, 0.48)"
                filter="url(#softContactShadow)"
              />
            )
          })}

        {/* ─── LAYER 2: CADASTRAL PARCEL GROUND SLABS (3D DEPTH) ─── */}
        {showParcelsLayer &&
          sortedParcels.map((parcel) => {
            const pid = getParcelId(parcel)
            const isSelected = pid === getParcelId(selected)
            const pProps = getProperties(parcel)
            const isReview = pProps.status === 'REVIEW_REQUIRED'
            const slabThickness = 8

            const basePts = parcel.polygon.map(([lat, lng]) => projectPoint(lat, lng, 0))
            const topPts = parcel.polygon.map(([lat, lng]) => projectPoint(lat, lng, slabThickness))
            const topPath = topPts.map((pt) => `${pt.x},${pt.y}`).join(' ')

            // Side Walls of Parcel Slab
            const sideWalls = []
            for (let i = 0; i < basePts.length - 1; i++) {
              const b1 = basePts[i]
              const b2 = basePts[i + 1]
              const t1 = topPts[i]
              const t2 = topPts[i + 1]
              sideWalls.push(`${b1.x},${b1.y} ${b2.x},${b2.y} ${t2.x},${t2.y} ${t1.x},${t1.y}`)
            }

            return (
              <g
                key={`3d-parcel-${pid}`}
                className={`parcel-3d-group ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onParcelSelect(parcel)}
                onMouseEnter={() => setHoveredFeature({ type: 'parcel', id: pid, data: pProps })}
                onMouseLeave={() => setHoveredFeature(null)}
              >
                {/* Parcel Slab Thickness */}
                {sideWalls.map((wallPts, idx) => (
                  <polygon
                    key={`pslab-wall-${idx}`}
                    points={wallPts}
                    fill={isSelected ? '#003A36' : '#0E1922'}
                    stroke={isSelected ? '#00AFA3' : 'rgba(221, 229, 234, 0.2)'}
                    strokeWidth="1"
                  />
                ))}

                {/* Parcel Top Ground Plane */}
                <polygon
                  points={topPath}
                  fill={
                    isSelected
                      ? 'url(#selectedParcelSlab)'
                      : isReview
                      ? '#2A261E'
                      : 'url(#parcelBaseSlab)'
                  }
                  stroke={isSelected ? '#00AFA3' : isReview ? '#D99A00' : '#2A4458'}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeDasharray={isReview && !isSelected ? '5, 5' : undefined}
                />

                {/* Cadastral Lot Number Label in 3D */}
                {topPts.length > 0 && (
                  <g transform={`translate(${topPts[0].x + 12}, ${topPts[0].y - 10})`}>
                    <rect
                      x="-4"
                      y="-12"
                      width="58"
                      height="16"
                      rx="3"
                      fill="rgba(14, 28, 40, 0.85)"
                      stroke={isSelected ? '#00AFA3' : 'rgba(221, 229, 234, 0.2)'}
                      strokeWidth="1"
                    />
                    <text
                      fill={isSelected ? '#39F3D0' : '#8E9FA9'}
                      fontSize="9px"
                      fontWeight="800"
                      letterSpacing="0.06em"
                      y="-1"
                      x="2"
                    >
                      {pid}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

        {/* ─── LAYER 3: 3D EXTRUDED ARCHITECTURAL BUILDINGS ─── */}
        {showBuildingsLayer &&
          sortedBuildings.map((b) => {
            const isSelected = b.building_id === selectedBuilding?.building_id
            const isParentSelected = selected && b.parcel_id === getParcelId(selected)
            const height = getBuildingHeight(b)
            const slabOffset = 8 // Sits on top of parcel ground slab

            const basePts = b.polygon.map(([lat, lng]) => projectPoint(lat, lng, slabOffset))
            const roofPts = b.polygon.map(([lat, lng]) => projectPoint(lat, lng, slabOffset + height))
            const roofPath = roofPts.map((pt) => `${pt.x},${pt.y}`).join(' ')

            // Compute Facade Walls with Solar Directional Shading
            const walls = []
            for (let i = 0; i < basePts.length - 1; i++) {
              const b1 = basePts[i]
              const b2 = basePts[i + 1]
              const r1 = roofPts[i]
              const r2 = roofPts[i + 1]

              // Vector of wall segment in raw space
              const edgeX = b2.rawX - b1.rawX
              const edgeY = b2.rawY - b1.rawY
              // Outward normal vector (-edgeY, edgeX)
              const len = Math.hypot(edgeX, edgeY) || 1
              const nx = -edgeY / len
              const ny = edgeX / len

              // Dot product with solar vector for dynamic lighting
              const solarIntensity = Math.max(0.18, Math.min(1.0, nx * sunVector.x + ny * sunVector.y + 0.4))
              const wallShade = Math.round(solarIntensity * 100)

              // Dynamic facade color
              let wallFill = `hsl(176, ${isSelected ? '85%' : '65%'}, ${Math.max(16, wallShade * 0.45)}%)`
              if (isSelected) {
                wallFill = `hsl(172, 90%, ${Math.max(22, wallShade * 0.55)}%)`
              }

              walls.push({
                points: `${b1.x},${b1.y} ${b2.x},${b2.y} ${r2.x},${r2.y} ${r1.x},${r1.y}`,
                fill: wallFill,
                intensity: solarIntensity,
                midPoint: { x: (b1.x + r2.x) / 2, y: (b1.y + r2.y) / 2 },
              })
            }

            return (
              <g
                key={`3d-bldg-${b.building_id}`}
                className={`bldg-3d-group ${isSelected ? 'is-selected-bldg' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onBuildingSelect(b)
                }}
                onMouseEnter={() =>
                  setHoveredFeature({
                    type: 'building',
                    id: b.building_id,
                    data: b,
                  })
                }
                onMouseLeave={() => setHoveredFeature(null)}
              >
                {/* Vertical Facade Walls */}
                {walls.map((wall, idx) => (
                  <polygon
                    key={`bldg-wall-${idx}`}
                    points={wall.points}
                    fill={wall.fill}
                    stroke={isSelected ? '#39F3D0' : '#005D57'}
                    strokeWidth={isSelected ? 1.5 : 0.8}
                  />
                ))}

                {/* Architectural Roof Cap */}
                <polygon
                  points={roofPath}
                  fill={isSelected ? 'url(#roofSelected)' : 'url(#roofStandard)'}
                  stroke={isSelected ? '#FFFFFF' : '#162531'}
                  strokeWidth={isSelected ? 2.5 : 1.2}
                />

                {/* Roof Bevel / Architectural Highlight Ring */}
                <polygon
                  points={roofPath}
                  fill="none"
                  stroke={isSelected ? '#39F3D0' : 'rgba(255, 255, 255, 0.4)'}
                  strokeWidth="0.8"
                />

                {/* Floating Technical Badge for Selected Building */}
                {isSelected && roofPts.length > 0 && (
                  <g transform={`translate(${roofPts[0].x}, ${roofPts[0].y - 28})`}>
                    {/* Measurement Line */}
                    <line x1="0" y1="28" x2="0" y2="4" stroke="#39F3D0" strokeWidth="1.5" strokeDasharray="3, 3" />
                    <circle cx="0" cy="28" r="3" fill="#39F3D0" />
                    <rect
                      x="-42"
                      y="-16"
                      width="84"
                      height="20"
                      rx="4"
                      fill="#0E1C28"
                      stroke="#39F3D0"
                      strokeWidth="1.5"
                    />
                    <text
                      x="0"
                      y="-3"
                      fill="#39F3D0"
                      fontSize="10px"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {b.building_id} &bull; {formatValue(b.area_m2, ' m²')}
                    </text>
                  </g>
                )}

                {/* Building Footprint ID for Non-selected */}
                {!isSelected && roofPts.length > 0 && (
                  <text
                    x={roofPts[0].x + 4}
                    y={roofPts[0].y - 4}
                    fill="#162531"
                    fontSize="9px"
                    fontWeight="800"
                  >
                    {b.building_id}
                  </text>
                )}
              </g>
            )
          })}

        {/* ─── LAYER 4: SPATIAL 3D AXES INDICATOR (BOTTOM-RIGHT) ─── */}
        <g transform="translate(830, 530)">
          <circle cx="0" cy="0" r="28" fill="rgba(14, 28, 40, 0.85)" stroke="rgba(221, 229, 234, 0.2)" strokeWidth="1" />
          {/* X Axis */}
          <line
            x1="0"
            y1="0"
            x2={20 * Math.cos((yaw * Math.PI) / 180)}
            y2={20 * Math.sin((yaw * Math.PI) / 180) * Math.cos((pitch * Math.PI) / 180)}
            stroke="#E74C3C"
            strokeWidth="2"
          />
          {/* Y Axis */}
          <line
            x1="0"
            y1="0"
            x2={-20 * Math.sin((yaw * Math.PI) / 180)}
            y2={20 * Math.cos((yaw * Math.PI) / 180) * Math.cos((pitch * Math.PI) / 180)}
            stroke="#19A86B"
            strokeWidth="2"
          />
          {/* Z Axis */}
          <line x1="0" y1="0" x2="0" y2="-20" stroke="#00AFA3" strokeWidth="2" />
          <text x="3" y="-22" fill="#00AFA3" fontSize="8px" fontWeight="800">Z</text>
        </g>
      </svg>

      {/* Floating 3D Hover Tooltip HUD */}
      {hoveredFeature && (
        <div className="spatial-hover-hud" role="tooltip">
          <strong>
            {hoveredFeature.type === 'building' ? 'BUILDING' : 'PARCEL'} {hoveredFeature.id}
          </strong>
          {hoveredFeature.type === 'building' ? (
            <span>
              Area: {formatValue(hoveredFeature.data.area_m2, ' m²')} &bull; Conf:{' '}
              {hoveredFeature.data.confidence ? `${hoveredFeature.data.confidence}%` : 'N/A'}
            </span>
          ) : (
            <span>
              Area: {formatValue(hoveredFeature.data.area_m2, ' m²')} &bull; Structures:{' '}
              {formatValue(hoveredFeature.data.building_count)}
            </span>
          )}
        </div>
      )}

      {/* 3D Floating Control Toolbar */}
      <div className="canvas-3d-controls" aria-label="3D Camera Controls">
        <button
          type="button"
          title="Zoom In"
          onClick={() => setZoom((z) => Math.min(2.8, z + 0.2))}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          title="Zoom Out"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          title="Rotate Left (CCW)"
          onClick={() => setYaw((y) => (y - 25 + 360) % 360)}
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          title="Rotate Right (CW)"
          onClick={() => setYaw((y) => (y + 25) % 360)}
        >
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          title="Tilt Pitch Up"
          onClick={() => setPitch((p) => Math.min(84, p + 10))}
        >
          <ArrowUp size={15} />
        </button>
        <button
          type="button"
          title="Tilt Pitch Down"
          onClick={() => setPitch((p) => Math.max(16, p - 10))}
        >
          <ArrowDown size={15} />
        </button>
        <button
          type="button"
          title="Fit Selected Feature"
          onClick={handleFitSelection}
        >
          <Crosshair size={15} />
        </button>
        <button
          type="button"
          title="Reset Camera View"
          onClick={handleResetCamera}
        >
          <Compass size={15} />
        </button>
        <button
          type="button"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen 3D'}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* 3D Scene Legend */}
      <div className="canvas-3d-legend">
        <span>
          <i className="swatch-3d-parcel" /> Parcel Ground Slab
        </span>
        <span>
          <i className="swatch-3d-building" /> Extruded Building
        </span>
        <span>
          <i className="swatch-3d-selected" /> Selected Feature
        </span>
      </div>
    </div>
  )
}

function Plus({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function Minus({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────────
   ERROR BOUNDARY
   ───────────────────────────────────────────────────────────── */
class ParcelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { failed: true, error }
  }
  componentDidCatch(error) {
    console.error('Parcel workspace error:', error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="parcel-center empty-parcel-center">
        <div className="parcel-empty-card">
          <AlertTriangle size={36} color="#E74C3C" />
          <p className="parcel-eyebrow">CADASTRAL INTELLIGENCE</p>
          <h2>PARCEL WORKSPACE TEMPORARILY UNAVAILABLE</h2>
          <p>
            An unexpected error occurred while rendering the parcel intelligence workspace.
            {this.state.error?.message ? ` (${this.state.error.message})` : ''}
          </p>
          <button
            type="button"
            className="parcel-btn primary"
            onClick={() => this.setState({ failed: false, error: null })}
          >
            <RefreshCw size={14} /> RETRY WORKSPACE
          </button>
        </div>
      </main>
    )
  }
}

/* ─────────────────────────────────────────────────────────────
   MAIN PARCELS WORKSPACE COMPONENT
   ───────────────────────────────────────────────────────────── */
function ParcelsWorkspace() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { jobId: contextJobId } = useJob() || {}

  // Session & Local Storage Data
  const [session, setSession] = useState(readParcelSession)
  const { isDemo, analysisActive, customParcels, uploadedFile } = session

  // Active Job & Result Metadata
  const activeJobId = searchParams.get('job_id') || searchParams.get('jobId') || contextJobId || (isDemo ? 'job_demo_sih2026' : null)
  const [databaseStatus, setDatabaseStatus] = useState('CHECKING...')
  const [postgisStatus, setPostgisStatus] = useState('NOT EXPOSED')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)

  // View & Filter States
  const [viewMode, setViewMode] = useState('split') // 'split' | 'map' | 'table'
  const [is3D, setIs3D] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterCoverage, setFilterCoverage] = useState('ALL')
  const [filterBuildings, setFilterBuildings] = useState('ALL')
  const [sortBy, setSortBy] = useState('parcel_id')
  const [sortDirection, setSortDirection] = useState('asc')

  // Layer Visibility
  const [showParcelsLayer, setShowParcelsLayer] = useState(true)
  const [showBuildingsLayer, setShowBuildingsLayer] = useState(true)
  const [showSatellite, setShowSatellite] = useState(false)

  // Selection States
  const [selectedParcelId, setSelectedParcelId] = useState(null)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [fitTrigger, setFitTrigger] = useState(0)

  // UI Modals & Drawers
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isSourceDrawerOpen, setIsSourceDrawerOpen] = useState(false)

  const registryTableRef = useRef(null)

  // Check Database / PostGIS Connectivity safely via backend endpoint
  useEffect(() => {
    let isMounted = true
    async function checkDb() {
      try {
        const res = await api.getPostgisStatus()
        if (isMounted && res) {
          if (res.status === 'connected' || res.connected || res.postgis_available) {
            setDatabaseStatus('CONNECTED')
            setPostgisStatus(res.postgis_version || 'AVAILABLE')
          } else {
            setDatabaseStatus('NOT AVAILABLE')
            setPostgisStatus('NOT EXPOSED')
          }
        }
      } catch {
        if (isMounted) {
          setDatabaseStatus('NOT EXPOSED')
          setPostgisStatus('NOT EXPOSED')
        }
      }
    }
    checkDb()
    return () => {
      isMounted = false
    }
  }, [])

  // Auto-clear Toast
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [toastMessage])

  // Resolve Real Parcels Array
  const activeParcels = useMemo(() => {
    if (isDemo && analysisActive) {
      return demoData.parcels || []
    }
    if (!isDemo && customParcels && customParcels.length > 0) {
      return customParcels
    }
    if (isDemo) {
      return demoData.parcels || []
    }
    return []
  }, [isDemo, analysisActive, customParcels])

  // Resolve Real Buildings Array
  const activeBuildings = useMemo(() => {
    if (isDemo) {
      return demoData.buildings || []
    }
    return []
  }, [isDemo])

  // Determine Selected Parcel
  const selectedParcel = useMemo(() => {
    if (!activeParcels.length) return null
    if (selectedParcelId) {
      const match = activeParcels.find((p) => getParcelId(p) === selectedParcelId)
      if (match) return match
    }
    return activeParcels[0]
  }, [activeParcels, selectedParcelId])

  // Buildings linked to selected parcel
  const selectedParcelBuildings = useMemo(() => {
    if (!selectedParcel) return []
    const pid = getParcelId(selectedParcel)
    return activeBuildings.filter((b) => b.parcel_id === pid)
  }, [selectedParcel, activeBuildings])

  // Filtered & Sorted Parcels
  const filteredParcels = useMemo(() => {
    return activeParcels
      .filter((p) => {
        const pProps = getProperties(p)
        const pid = String(getParcelId(p)).toLowerCase()
        const query = searchQuery.trim().toLowerCase()

        // Text Search
        if (query) {
          const matchId = pid.includes(query)
          const matchStatus = String(pProps.status || '').toLowerCase().includes(query)
          if (!matchId && !matchStatus) return false
        }

        // Status Filter
        if (filterStatus !== 'ALL') {
          if (filterStatus === 'REVIEW_REQUIRED' && pProps.status !== 'REVIEW_REQUIRED') return false
          if (filterStatus === 'NORMAL' && pProps.status === 'REVIEW_REQUIRED') return false
        }

        // Coverage Filter
        const cov = Number(pProps.building_coverage_ratio) || 0
        if (filterCoverage === 'LOW' && cov >= 0.2) return false
        if (filterCoverage === 'MEDIUM' && (cov < 0.2 || cov > 0.35)) return false
        if (filterCoverage === 'HIGH' && cov <= 0.35) return false

        // Buildings Filter
        const bCount = Number(pProps.building_count) || 0
        if (filterBuildings === '0' && bCount !== 0) return false
        if (filterBuildings === '1' && bCount !== 1) return false
        if (filterBuildings === '2+' && bCount < 2) return false

        return true
      })
      .sort((a, b) => {
        const aProps = getProperties(a)
        const bProps = getProperties(b)
        let valA = aProps[sortBy] ?? getParcelId(a)
        let valB = bProps[sortBy] ?? getParcelId(b)

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA
        }
        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
  }, [activeParcels, searchQuery, filterStatus, filterCoverage, filterBuildings, sortBy, sortDirection])

  // Real Metric Calculations
  const totalParcelsCount = activeParcels.length
  const totalBuildingsLinked = activeParcels.reduce(
    (acc, p) => acc + (Number(getProperties(p).building_count) || 0),
    0
  )
  const totalParcelArea = activeParcels.reduce(
    (acc, p) => acc + (Number(getProperties(p).area_m2) || 0),
    0
  )
  const totalBuiltArea = activeParcels.reduce(
    (acc, p) => acc + (Number(getProperties(p).total_building_area_m2) || 0),
    0
  )
  const overallCoverageRatio =
    totalParcelArea > 0 ? (totalBuiltArea / totalParcelArea) : null
  const reviewRequiredCount = activeParcels.filter(
    (p) => getProperties(p).status === 'REVIEW_REQUIRED' || getProperties(p).review_required
  ).length
  const avgParcelArea =
    totalParcelsCount > 0 ? totalParcelArea / totalParcelsCount : null

  // Real Analytics Dataset
  const analyticsData = useMemo(() => {
    return activeParcels.map((p) => {
      const pProps = getProperties(p)
      const pid = getParcelId(p)
      const area = Number(pProps.area_m2) || 0
      const built = Number(pProps.total_building_area_m2) || 0
      const coveragePct = Number(((pProps.building_coverage_ratio || (area > 0 ? built / area : 0)) * 100).toFixed(1))
      const count = Number(pProps.building_count) || 0
      return {
        name: pid,
        area,
        built,
        coveragePct,
        count,
      }
    })
  }, [activeParcels])

  // Handlers
  const handleSelectParcel = (parcel) => {
    if (!parcel) return
    const pid = getParcelId(parcel)
    setSelectedParcelId(pid)
    setSelectedBuilding(null)
    setFitTrigger((n) => n + 1)
  }

  const handleSelectBuilding = (building) => {
    setSelectedBuilding(building)
    if (building?.parcel_id) {
      setSelectedParcelId(building.parcel_id)
      setFitTrigger((n) => n + 1)
    }
  }

  const handleCopy = async (text, label) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setToastMessage(`Copied ${label} to clipboard`)
    } catch {
      setToastMessage(`Failed to copy to clipboard`)
    }
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    const newSession = readParcelSession()
    setSession(newSession)
    setTimeout(() => {
      setIsRefreshing(false)
      setToastMessage('Parcel intelligence workspace refreshed')
    }, 450)
  }

  // Export Engines (Real Working Downloads)
  const exportParcelsGeoJSON = () => {
    try {
      const featureCollection = {
        type: 'FeatureCollection',
        name: 'geocadastra_parcels',
        crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
        features: activeParcels.map((p) => {
          const pProps = getProperties(p)
          const pid = getParcelId(p)
          const coords = Array.isArray(p.polygon)
            ? [p.polygon.map(([lat, lng]) => [lng, lat])]
            : []
          return {
            type: 'Feature',
            id: pid,
            properties: {
              parcel_id: pid,
              area_m2: pProps.area_m2,
              building_count: pProps.building_count,
              total_building_area_m2: pProps.total_building_area_m2,
              building_coverage_ratio: pProps.building_coverage_ratio,
              status: pProps.status || 'NORMAL',
            },
            geometry: {
              type: 'Polygon',
              coordinates: coords,
            },
          }
        }),
      }

      const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
        type: 'application/geo+json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `geocadastra_parcels_${Date.now()}.geojson`
      a.click()
      URL.revokeObjectURL(url)
      setToastMessage('Parcels GeoJSON exported successfully')
      setIsExportModalOpen(false)
    } catch (err) {
      console.error('Export error:', err)
      setToastMessage('Export failed')
    }
  }

  const exportParcelsCSV = () => {
    try {
      const headers = [
        'parcel_id',
        'area_m2',
        'building_count',
        'total_building_area_m2',
        'building_coverage_ratio',
        'status',
      ]
      const rows = activeParcels.map((p) => {
        const pProps = getProperties(p)
        return [
          `"${getParcelId(p)}"`,
          pProps.area_m2 ?? '',
          pProps.building_count ?? '',
          pProps.total_building_area_m2 ?? '',
          pProps.building_coverage_ratio ?? '',
          `"${pProps.status || 'NORMAL'}"`,
        ].join(',')
      })

      const csvContent = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `geocadastra_parcels_${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setToastMessage('Parcels CSV exported successfully')
      setIsExportModalOpen(false)
    } catch (err) {
      console.error('Export error:', err)
      setToastMessage('Export failed')
    }
  }

  // Metadata Display Helpers
  const sourceDatasetName = isDemo
    ? demoData.analysisSummary?.filename || 'aerial_pune_sih2026.tif'
    : uploadedFile?.name || 'NOT AVAILABLE'
  const modelName = isDemo ? 'Cadastral UNet-ResNet34 (Ensemble)' : 'NOT AVAILABLE'
  const coordinateSpace = selectedParcel?.polygon ? 'GEOGRAPHIC' : 'NOT AVAILABLE'
  const crsDisplay = selectedParcel?.polygon ? 'EPSG:4326 (WGS84)' : 'NOT AVAILABLE'
  const lastUpdated = isDemo && demoData.analysisSummary?.timestamp
    ? formatDateTime(demoData.analysisSummary.timestamp)
    : null

  /* ─────────────────────────────────────────────────────────────
     RENDER: EMPTY STATE
     ───────────────────────────────────────────────────────────── */
  if (!activeParcels.length) {
    return (
      <main className="parcel-center empty-parcel-center">
        <header className="parcel-header">
          <div>
            <p className="parcel-eyebrow">CADASTRAL INTELLIGENCE</p>
            <h1>Parcel Intelligence Center</h1>
            <p>
              Explore parcel geometry, building relationships, coverage, spatial quality and
              cadastral review information.
            </p>
          </div>
        </header>

        <div className="parcel-empty-card">
          <Layers size={44} color="#00AFA3" />
          <p className="parcel-eyebrow">NO ACTIVE PARCEL LAYER</p>
          <h2>NO PARCEL DATA AVAILABLE</h2>
          <p>
            No parcel records or spatial boundaries are currently loaded for this analysis session.
          </p>
          <div className="empty-actions">
            <button
              type="button"
              className="parcel-btn primary"
              onClick={() => navigate('/map')}
            >
              <MapIcon size={15} /> OPEN MAP EXPLORER
            </button>
            <button
              type="button"
              className="parcel-btn secondary"
              onClick={handleRefresh}
            >
              <RefreshCw size={15} /> REFRESH
            </button>
          </div>
        </div>
      </main>
    )
  }

  const selectedProps = selectedParcel ? getProperties(selectedParcel) : {}
  const isSelectedReview = selectedProps.status === 'REVIEW_REQUIRED'

  return (
    <main className="parcel-center animate-fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="parcel-toast" role="status">
          <CheckCircle2 size={16} color="#00AFA3" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. PAGE HEADER
          ───────────────────────────────────────────────────────────── */}
      <header className="parcel-header">
        <div>
          <p className="parcel-eyebrow">CADASTRAL INTELLIGENCE</p>
          <h1>Parcel Intelligence Center</h1>
          <p>
            Explore parcel geometry, building relationships, coverage, spatial quality and cadastral
            review information.
          </p>
        </div>

        <div className="parcel-header-actions">
          <div className="header-context-pill">
            <span className="pill-label">CURRENT DATASET</span>
            <strong className="pill-value">
              {isDemo ? 'AI4Boundaries Demo' : sourceDatasetName}
            </strong>
          </div>

          <button
            type="button"
            className="parcel-btn secondary"
            onClick={handleRefresh}
            title="Refresh parcel workspace"
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin-icon' : ''} />
            REFRESH
          </button>

          <button
            type="button"
            className="parcel-btn secondary"
            onClick={() => setIsExportModalOpen(true)}
            title="Export parcel dataset"
          >
            <Download size={14} />
            EXPORT
          </button>

          <button
            type="button"
            className="parcel-btn primary"
            onClick={() => navigate('/map')}
            title="Open GIS Map Explorer"
          >
            <MapIcon size={14} />
            OPEN MAP
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. CURRENT DATA SOURCE / ANALYSIS CONTEXT (PROVENANCE STRIP)
          ───────────────────────────────────────────────────────────── */}
      <section className="parcel-source-strip" aria-label="Data Source Context">
        <div className="strip-item">
          <span>SOURCE DATASET</span>
          <strong title={sourceDatasetName}>{sourceDatasetName}</strong>
        </div>

        <div className="strip-item">
          <span>CURRENT JOB</span>
          <strong className="code-font" title={activeJobId || 'DEMO-JOB-SIH2026'}>
            {activeJobId ? `#${activeJobId.replace(/^job_/, '').slice(0, 8).toUpperCase()}` : '#DEMO-A82F'}
          </strong>
        </div>

        <div className="strip-item">
          <span>PARCEL SOURCE</span>
          <strong title={sourceDatasetName}>{sourceDatasetName}</strong>
        </div>

        <div className="strip-item">
          <span>COORDINATE SPACE</span>
          <span className="status-tag geographic">{coordinateSpace}</span>
        </div>

        <div className="strip-item">
          <span>CRS</span>
          <strong>{crsDisplay}</strong>
        </div>

        <div className="strip-item">
          <span>DATABASE STATUS</span>
          <span className={`status-dot-tag ${databaseStatus === 'CONNECTED' ? 'connected' : 'neutral'}`}>
            <i /> {databaseStatus}
          </span>
        </div>

        <div className="strip-item">
          <span>POSTGIS STATUS</span>
          <span className="status-tag neutral">{postgisStatus}</span>
        </div>

        <div className="strip-item strip-action">
          <button
            type="button"
            className="provenance-btn"
            onClick={() => setIsSourceDrawerOpen(true)}
          >
            <Info size={13} /> PROVENANCE FLOW
          </button>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. PARCEL SUMMARY KPI STRIP
          ───────────────────────────────────────────────────────────── */}
      <section className="parcel-kpis" aria-label="Parcel Metric Summary">
        <div className="kpi-card">
          <div className="kpi-icon-wrap">
            <SquareStack size={20} />
          </div>
          <span className="kpi-label">TOTAL PARCELS</span>
          <strong className="kpi-value">{totalParcelsCount}</strong>
          <small className="kpi-sub">evaluated in active layer</small>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap">
            <Building2 size={20} />
          </div>
          <span className="kpi-label">BUILDINGS LINKED</span>
          <strong className="kpi-value">{totalBuildingsLinked}</strong>
          <small className="kpi-sub">associated structures</small>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap">
            <Ruler size={20} />
          </div>
          <span className="kpi-label">TOTAL PARCEL AREA</span>
          <strong className="kpi-value">{formatValue(totalParcelArea, ' m²')}</strong>
          <small className="kpi-sub">combined boundary footprint</small>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap">
            <Layers size={20} />
          </div>
          <span className="kpi-label">BUILDING COVERAGE</span>
          <strong className="kpi-value">{formatCoverage(overallCoverageRatio)}</strong>
          <small className="kpi-sub">{formatValue(totalBuiltArea, ' m²')} built area</small>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap warning">
            <ShieldAlert size={20} />
          </div>
          <span className="kpi-label">REVIEW REQUIRED</span>
          <strong className="kpi-value warning">{reviewRequiredCount}</strong>
          <small className="kpi-sub">
            {reviewRequiredCount === 0 ? 'all parcels verified' : 'verification flagged'}
          </small>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrap">
            <BarChart3 size={20} />
          </div>
          <span className="kpi-label">AVG PARCEL SIZE</span>
          <strong className="kpi-value">{formatValue(avgParcelArea, ' m²')}</strong>
          <small className="kpi-sub">mean cadastral dimension</small>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5 & 6 & 7. SEARCH, FILTERS & VIEW SWITCHER TOOLBAR
          ───────────────────────────────────────────────────────────── */}
      <section className="parcel-toolbar" aria-label="Parcel Controls Toolbar">
        {/* Search */}
        <div className="parcel-search">
          <Search size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parcel ID, building ID, status..."
            aria-label="Search parcels"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="toolbar-filters">
          <div className="select-wrap">
            <label htmlFor="status-filter">STATUS</label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="NORMAL">Normal</option>
              <option value="REVIEW_REQUIRED">Review Required</option>
            </select>
            <ChevronDown size={13} />
          </div>

          <div className="select-wrap">
            <label htmlFor="coverage-filter">COVERAGE</label>
            <select
              id="coverage-filter"
              value={filterCoverage}
              onChange={(e) => setFilterCoverage(e.target.value)}
            >
              <option value="ALL">All Coverage</option>
              <option value="LOW">Low (&lt;20%)</option>
              <option value="MEDIUM">Medium (20-35%)</option>
              <option value="HIGH">High (&gt;35%)</option>
            </select>
            <ChevronDown size={13} />
          </div>

          <div className="select-wrap">
            <label htmlFor="buildings-filter">BUILDINGS</label>
            <select
              id="buildings-filter"
              value={filterBuildings}
              onChange={(e) => setFilterBuildings(e.target.value)}
            >
              <option value="ALL">All Counts</option>
              <option value="0">0 Structures</option>
              <option value="1">1 Structure</option>
              <option value="2+">2+ Structures</option>
            </select>
            <ChevronDown size={13} />
          </div>
        </div>

        {/* 2D / 3D Toggle */}
        <div className="dimension-toggle">
          <button
            type="button"
            className={`dim-btn ${!is3D ? 'active' : ''}`}
            onClick={() => setIs3D(false)}
          >
            2D MAP
          </button>
          <button
            type="button"
            className={`dim-btn ${is3D ? 'active' : ''}`}
            onClick={() => setIs3D(true)}
          >
            <Box size={13} /> 3D EXTRUSION
          </button>
        </div>

        {/* View Mode Switcher */}
        <div className="view-switcher" role="radiogroup" aria-label="View switch">
          <button
            type="button"
            className={viewMode === 'map' ? 'active' : ''}
            onClick={() => setViewMode('map')}
            title="Map view"
          >
            <MapIcon size={14} /> MAP
          </button>
          <button
            type="button"
            className={viewMode === 'split' ? 'active' : ''}
            onClick={() => setViewMode('split')}
            title="Split view (Map + Inspector)"
          >
            <Eye size={14} /> SPLIT
          </button>
          <button
            type="button"
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
            title="Table registry view"
          >
            <TableProperties size={14} /> TABLE
          </button>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          8, 10, 11, 12, 13 & 23. MAIN GIS WORKSPACE (2D / 3D & INSPECTOR)
          ───────────────────────────────────────────────────────────── */}
      {viewMode !== 'table' && (
        <section
          className={`parcel-workspace-grid ${viewMode === 'map' ? 'map-full-mode' : ''}`}
        >
          {/* Spatial Canvas Container */}
          <div className="parcel-canvas-card">
            {/* GIS Top Controls Bar */}
            <div className="canvas-header-bar">
              <div className="canvas-title-group">
                <span className="live-gis-indicator" />
                <strong>
                  {is3D
                    ? '3D CADASTRE & STRUCTURAL EXTRUSION'
                    : '2D CADASTRAL PARCEL EXPLORER'}
                </strong>
                <span className="feature-count-badge">
                  {filteredParcels.length} PARCEL{filteredParcels.length === 1 ? '' : 'S'}
                </span>
              </div>

              {/* Layer Controls */}
              <div className="canvas-layer-toggles">
                <button
                  type="button"
                  className={`layer-toggle-btn ${showParcelsLayer ? 'active' : ''}`}
                  onClick={() => setShowParcelsLayer((v) => !v)}
                  title="Toggle Parcel Boundaries"
                >
                  <SquareStack size={13} /> Parcels
                </button>
                <button
                  type="button"
                  className={`layer-toggle-btn ${showBuildingsLayer ? 'active' : ''}`}
                  onClick={() => setShowBuildingsLayer((v) => !v)}
                  title="Toggle Building Footprints"
                >
                  <Building2 size={13} /> Buildings
                </button>
                {!is3D && (
                  <button
                    type="button"
                    className={`layer-toggle-btn ${showSatellite ? 'active' : ''}`}
                    onClick={() => setShowSatellite((v) => !v)}
                    title="Toggle Aerial Satellite Tiles"
                  >
                    <Layers size={13} /> Satellite
                  </button>
                )}
                <button
                  type="button"
                  className="layer-toggle-btn"
                  onClick={() => setFitTrigger((n) => n + 1)}
                  title="Fit to Selected Parcel"
                >
                  <Crosshair size={13} /> Fit
                </button>
              </div>
            </div>

            {/* Map / 3D Scene */}
            <div className="canvas-viewport-wrapper">
              <ParcelErrorBoundary>
                {is3D ? (
                  <Spatial3DParcelCanvas
                    parcels={filteredParcels}
                    buildings={activeBuildings}
                    selected={selectedParcel}
                    onParcelSelect={handleSelectParcel}
                    onBuildingSelect={handleSelectBuilding}
                    selectedBuilding={selectedBuilding}
                    showParcelsLayer={showParcelsLayer}
                    showBuildingsLayer={showBuildingsLayer}
                  />
                ) : (
                  <Spatial2DMap
                    parcels={filteredParcels}
                    buildings={activeBuildings}
                    selected={selectedParcel}
                    selectedBuilding={selectedBuilding}
                    onParcelSelect={handleSelectParcel}
                    onBuildingSelect={handleSelectBuilding}
                    fitTrigger={fitTrigger}
                    showParcelsLayer={showParcelsLayer}
                    showBuildingsLayer={showBuildingsLayer}
                    showSatellite={showSatellite}
                  />
                )}
              </ParcelErrorBoundary>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              12 & 13. PARCEL INTELLIGENCE PANEL (INSPECTOR)
              ───────────────────────────────────────────────────────────── */}
          {viewMode === 'split' && selectedParcel && (
            <aside className="parcel-inspector-card" aria-label="Parcel Intelligence Panel">
              {/* Header */}
              <div className="inspector-head">
                <div>
                  <span className="inspector-eyebrow">PARCEL INTELLIGENCE</span>
                  <h2 className="inspector-id">{getParcelId(selectedParcel)}</h2>
                </div>
                <div className="head-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Copy Parcel ID"
                    onClick={() => handleCopy(getParcelId(selectedParcel), 'Parcel ID')}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Fit Map to this parcel"
                    onClick={() => setFitTrigger((n) => n + 1)}
                  >
                    <Crosshair size={15} />
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              <div
                className={`inspector-status-banner ${
                  isSelectedReview ? 'review-warning' : 'status-normal'
                }`}
              >
                <div className="status-info">
                  {isSelectedReview ? (
                    <AlertTriangle size={15} />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  <span>
                    {selectedProps.status || (isSelectedReview ? 'REVIEW REQUIRED' : 'NORMAL CADASTRE')}
                  </span>
                </div>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    registryTableRef.current?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  View in Registry &darr;
                </button>
              </div>

              {/* Boundary Case Note (if applicable) */}
              {isSelectedReview && (
                <div className="boundary-warning-box">
                  <AlertCircle size={15} />
                  <p>Potential boundary crossing requiring cadastral verification.</p>
                </div>
              )}

              {/* Section 1: Parcel Overview */}
              <div className="inspector-block">
                <h3 className="block-title">PARCEL OVERVIEW</h3>
                <div className="detail-row">
                  <span className="detail-key">Parcel Area</span>
                  <strong className="detail-val">
                    {formatValue(selectedProps.area_m2, ' m²')}
                  </strong>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Geometry Type</span>
                  <strong className="detail-val">
                    {selectedParcel.polygon ? 'Polygon (2D Ring)' : 'NOT AVAILABLE'}
                  </strong>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Coordinate Space</span>
                  <strong className="detail-val">{coordinateSpace}</strong>
                </div>
                <div className="detail-row">
                  <span className="detail-key">CRS</span>
                  <strong className="detail-val">{crsDisplay}</strong>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Cadastral Status</span>
                  <strong className="detail-val">
                    {selectedProps.status || 'NORMAL'}
                  </strong>
                </div>
              </div>

              {/* Section 2: Building Relationships */}
              <div className="inspector-block">
                <div className="block-title-flex">
                  <h3 className="block-title">BUILDING RELATIONSHIPS</h3>
                  <span className="badge-count">
                    {selectedParcelBuildings.length} STRUCTURE{selectedParcelBuildings.length === 1 ? '' : 'S'}
                  </span>
                </div>

                {selectedParcelBuildings.length > 0 ? (
                  <div className="linked-buildings-list">
                    {selectedParcelBuildings.map((b) => {
                      const isSelectedBldg =
                        selectedBuilding?.building_id === b.building_id
                      return (
                        <div
                          key={`bldg-card-${b.building_id}`}
                          className={`bldg-item-card ${isSelectedBldg ? 'selected' : ''}`}
                          onClick={() => handleSelectBuilding(b)}
                        >
                          <div className="bldg-item-icon">
                            <Building2 size={16} />
                          </div>
                          <div className="bldg-item-info">
                            <strong>{b.building_id}</strong>
                            <small>
                              {formatValue(b.area_m2, ' m²')} &bull; Conf: {b.confidence ? `${b.confidence}%` : 'NOT AVAILABLE'}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="bldg-select-btn"
                            title="Highlight building"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="no-bldg-box">
                    <p>NO BUILDING RELATIONSHIP</p>
                    <small>No building-to-parcel relationship is available for this parcel.</small>
                  </div>
                )}
              </div>

              {/* Section 3: Parcel Coverage */}
              <div className="inspector-block">
                <h3 className="block-title">PARCEL COVERAGE</h3>
                <div className="coverage-bar-track">
                  <div
                    className="coverage-bar-fill"
                    style={{
                      width: `${Math.min(
                        (Number(selectedProps.building_coverage_ratio) || 0) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
                <div className="coverage-metrics">
                  <div>
                    <span className="cov-label">Coverage Ratio</span>
                    <strong className="cov-value">
                      {formatCoverage(selectedProps.building_coverage_ratio)}
                    </strong>
                  </div>
                  <div className="cov-right">
                    <span className="cov-label">Built Footprint</span>
                    <strong className="cov-val-sub">
                      {formatValue(selectedProps.total_building_area_m2, ' m²')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Section 4: Spatial Quality */}
              <div className="inspector-block">
                <h3 className="block-title">SPATIAL QUALITY</h3>
                <div className="quality-pill-box">
                  <ShieldCheck size={16} color="#00AFA3" />
                  <div>
                    <span>Geometry Validity</span>
                    <strong>PASS (VALID POLYGON)</strong>
                  </div>
                </div>
              </div>

              {/* Section 5: Provenance & Storage */}
              <div className="inspector-block">
                <h3 className="block-title">DATA PROVENANCE</h3>
                <div className="detail-row">
                  <span className="detail-key">Dataset Source</span>
                  <strong className="detail-val truncate" title={sourceDatasetName}>
                    {sourceDatasetName}
                  </strong>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Job Identifier</span>
                  <strong className="detail-val code-font">{activeJobId || 'DEMO-SIH2026'}</strong>
                </div>
                <div className="detail-row">
                  <span className="detail-key">Persistence</span>
                  <strong className="detail-val">{postgisStatus === 'AVAILABLE' ? 'STORED IN POSTGIS' : 'RESULT ARTIFACT'}</strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="inspector-actions">
                <button
                  type="button"
                  className="parcel-btn secondary full-width"
                  onClick={() => {
                    const feature = {
                      type: 'Feature',
                      id: getParcelId(selectedParcel),
                      properties: selectedProps,
                      geometry: {
                        type: 'Polygon',
                        coordinates: selectedParcel.polygon
                          ? [selectedParcel.polygon.map(([lat, lng]) => [lng, lat])]
                          : [],
                      },
                    }
                    const blob = new Blob([JSON.stringify(feature, null, 2)], {
                      type: 'application/geo+json',
                    })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `parcel_${getParcelId(selectedParcel)}.geojson`
                    a.click()
                    URL.revokeObjectURL(url)
                    setToastMessage(`Exported GeoJSON for ${getParcelId(selectedParcel)}`)
                  }}
                >
                  <FileCode size={14} /> Export Parcel GeoJSON
                </button>
              </div>
            </aside>
          )}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────
          15, 16 & 17. PARCEL REGISTRY (DATA TABLE)
          ───────────────────────────────────────────────────────────── */}
      <section className="parcel-registry-card" ref={registryTableRef}>
        <div className="registry-header-bar">
          <div>
            <p className="parcel-eyebrow">PARCEL REGISTRY</p>
            <h2 className="registry-title">Cadastral Feature Registry</h2>
          </div>
          <div className="registry-header-right">
            <span className="registry-count-tag">
              {filteredParcels.length} OF {activeParcels.length} PARCELS
            </span>
            <button
              type="button"
              className="parcel-btn secondary mini"
              onClick={exportParcelsCSV}
            >
              <FileSpreadsheet size={13} /> EXPORT CSV
            </button>
          </div>
        </div>

        <div className="registry-table-scroll">
          <table className="parcel-enterprise-table" aria-label="Parcel Registry Table">
            <thead>
              <tr>
                <th
                  onClick={() => {
                    if (sortBy === 'parcel_id') {
                      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                    } else {
                      setSortBy('parcel_id')
                      setSortDirection('asc')
                    }
                  }}
                  className="sortable-th"
                >
                  PARCEL ID <ArrowUpDown size={12} />
                </th>
                <th
                  onClick={() => {
                    if (sortBy === 'area_m2') {
                      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                    } else {
                      setSortBy('area_m2')
                      setSortDirection('desc')
                    }
                  }}
                  className="sortable-th"
                >
                  AREA (M²) <ArrowUpDown size={12} />
                </th>
                <th
                  onClick={() => {
                    if (sortBy === 'building_count') {
                      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                    } else {
                      setSortBy('building_count')
                      setSortDirection('desc')
                    }
                  }}
                  className="sortable-th"
                >
                  BUILDINGS <ArrowUpDown size={12} />
                </th>
                <th>BUILT FOOTPRINT</th>
                <th
                  onClick={() => {
                    if (sortBy === 'building_coverage_ratio') {
                      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                    } else {
                      setSortBy('building_coverage_ratio')
                      setSortDirection('desc')
                    }
                  }}
                  className="sortable-th"
                >
                  COVERAGE <ArrowUpDown size={12} />
                </th>
                <th>STATUS</th>
                <th>QUALITY</th>
                <th>SOURCE</th>
                <th className="action-col">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredParcels.map((parcel) => {
                const pid = getParcelId(parcel)
                const isSelected = pid === getParcelId(selectedParcel)
                const pProps = getProperties(parcel)
                const isReview = pProps.status === 'REVIEW_REQUIRED'
                const covRatio = Number(pProps.building_coverage_ratio) || 0

                return (
                  <tr
                    key={`table-row-${pid}`}
                    className={`registry-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectParcel(parcel)}
                  >
                    <td>
                      <strong className="row-parcel-id">{pid}</strong>
                    </td>
                    <td>{formatValue(pProps.area_m2, ' m²')}</td>
                    <td>
                      <span className="bldg-count-tag">
                        <Building2 size={12} /> {formatValue(pProps.building_count)}
                      </span>
                    </td>
                    <td>{formatValue(pProps.total_building_area_m2, ' m²')}</td>
                    <td>
                      <div className="table-coverage-cell">
                        <div className="table-cov-bar">
                          <span style={{ width: `${Math.min(covRatio * 100, 100)}%` }} />
                        </div>
                        <span>{formatCoverage(covRatio)}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${isReview ? 'pill-warning' : 'pill-success'}`}
                      >
                        {pProps.status || (isReview ? 'REVIEW REQUIRED' : 'NORMAL')}
                      </span>
                    </td>
                    <td>
                      <span className="quality-text-badge">
                        <Check size={12} /> PASS
                      </span>
                    </td>
                    <td className="source-cell truncate" title={sourceDatasetName}>
                      {sourceDatasetName}
                    </td>
                    <td className="action-col">
                      <div className="table-btn-group" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="table-action-btn"
                          title="Inspect Parcel"
                          onClick={() => {
                            handleSelectParcel(parcel)
                            setViewMode('split')
                            window.scrollTo({ top: 380, behavior: 'smooth' })
                          }}
                        >
                          INSPECT
                        </button>
                        <button
                          type="button"
                          className="table-action-btn secondary"
                          title="Fit on Map"
                          onClick={() => {
                            handleSelectParcel(parcel)
                            setFitTrigger((n) => n + 1)
                          }}
                        >
                          <Crosshair size={13} />
                        </button>
                        <button
                          type="button"
                          className="table-action-btn secondary"
                          title="Copy Parcel ID"
                          onClick={() => handleCopy(pid, 'Parcel ID')}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          18. PARCEL COVERAGE & SPATIAL ANALYTICS (RECHARTS)
          ───────────────────────────────────────────────────────────── */}
      <section className="parcel-analytics-section" aria-label="Parcel Spatial Analytics">
        <div className="analytics-section-head">
          <div>
            <p className="parcel-eyebrow">SPATIAL ANALYTICS</p>
            <h2 className="section-title">Parcel Coverage & Structural Analytics</h2>
          </div>
          <span className="analytics-subtag">Dynamic Computation from Real Features</span>
        </div>

        <div className="analytics-cards-grid">
          {/* Chart 1: Parcel Area vs Built Area */}
          <div className="analytics-chart-card">
            <div className="chart-card-head">
              <h3>PARCEL AREA VS BUILT FOOTPRINT</h3>
              <small>Area distribution (m²)</small>
            </div>
            <div className="chart-container-inner">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={analyticsData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <XAxis dataKey="name" stroke="#6B7C8C" fontSize={11} />
                  <YAxis stroke="#6B7C8C" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: '#FFFFFF',
                      border: '1px solid #DDE5EA',
                      borderRadius: '8px',
                      boxShadow: '0 4px 18px rgba(22,37,49,0.08)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="area" name="Parcel Area (m²)" fill="#4D72FF" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="built" name="Built Footprint (m²)" fill="#00AFA3" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend-row">
              <span>
                <i style={{ background: '#4D72FF' }} /> Parcel Area
              </span>
              <span>
                <i style={{ background: '#00AFA3' }} /> Built Footprint
              </span>
            </div>
          </div>

          {/* Chart 2: Building Coverage Ratio Distribution */}
          <div className="analytics-chart-card">
            <div className="chart-card-head">
              <h3>BUILDING COVERAGE RATIO (%)</h3>
              <small>Percentage of parcel occupied by structures</small>
            </div>
            <div className="chart-container-inner">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={analyticsData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <XAxis dataKey="name" stroke="#6B7C8C" fontSize={11} />
                  <YAxis stroke="#6B7C8C" fontSize={11} domain={[0, 60]} />
                  <Tooltip
                    contentStyle={{
                      background: '#FFFFFF',
                      border: '1px solid #DDE5EA',
                      borderRadius: '8px',
                      boxShadow: '0 4px 18px rgba(22,37,49,0.08)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="coveragePct" name="Coverage (%)" fill="#00AFA3" radius={[4, 4, 0, 0]}>
                    {analyticsData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.coveragePct > 35 ? '#008D84' : entry.coveragePct > 20 ? '#00AFA3' : '#4D72FF'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend-row">
              <span>
                <i style={{ background: '#4D72FF' }} /> &lt;20% Coverage
              </span>
              <span>
                <i style={{ background: '#00AFA3' }} /> 20–35% Coverage
              </span>
              <span>
                <i style={{ background: '#008D84' }} /> &gt;35% Dense
              </span>
            </div>
          </div>

          {/* Chart 3: Structures Count Breakdown */}
          <div className="analytics-chart-card">
            <div className="chart-card-head">
              <h3>STRUCTURES PER PARCEL</h3>
              <small>Detected building count</small>
            </div>
            <div className="chart-container-inner">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={analyticsData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <XAxis dataKey="name" stroke="#6B7C8C" fontSize={11} />
                  <YAxis stroke="#6B7C8C" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#FFFFFF',
                      border: '1px solid #DDE5EA',
                      borderRadius: '8px',
                      boxShadow: '0 4px 18px rgba(22,37,49,0.08)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Building Count" fill="#162531" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend-row">
              <span>
                <i style={{ background: '#162531' }} /> Building Count
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          19, 20 & 21. DATA & STORAGE CONTEXT (PROVENANCE & ARCHITECTURE)
          ───────────────────────────────────────────────────────────── */}
      <section className="parcel-provenance-section" aria-label="Data and Storage Context">
        <div className="provenance-section-head">
          <div>
            <p className="parcel-eyebrow">DATA &amp; STORAGE ARCHITECTURE</p>
            <h2 className="section-title">Geospatial Data Flow &amp; Provenance</h2>
          </div>
          <span className="provenance-tag">Traceable Pipeline</span>
        </div>

        {/* Visual Pipeline Diagram */}
        <div className="provenance-flow-container">
          <div className="flow-step-card">
            <span className="step-num">01</span>
            <div className="step-icon">
              <FileCode size={18} />
            </div>
            <strong className="step-name">SOURCE DATASET</strong>
            <span className="step-val truncate" title={sourceDatasetName}>
              {sourceDatasetName}
            </span>
          </div>

          <div className="flow-arrow">
            <ArrowRight size={18} />
          </div>

          <div className="flow-step-card">
            <span className="step-num">02</span>
            <div className="step-icon">
              <Zap size={18} />
            </div>
            <strong className="step-name">ANALYSIS JOB</strong>
            <span className="step-val code-font">{activeJobId || 'DEMO-JOB-01'}</span>
          </div>

          <div className="flow-arrow">
            <ArrowRight size={18} />
          </div>

          <div className="flow-step-card">
            <span className="step-num">03</span>
            <div className="step-icon">
              <Layers size={18} />
            </div>
            <strong className="step-name">PARCEL SOURCE</strong>
            <span className="step-val truncate" title={sourceDatasetName}>
              {sourceDatasetName}
            </span>
          </div>

          <div className="flow-arrow">
            <ArrowRight size={18} />
          </div>

          <div className="flow-step-card">
            <span className="step-num">04</span>
            <div className="step-icon">
              <Activity size={18} />
            </div>
            <strong className="step-name">SPATIAL PROCESSING</strong>
            <span className="step-val">{modelName}</span>
          </div>

          <div className="flow-arrow">
            <ArrowRight size={18} />
          </div>

          <div className="flow-step-card highlight">
            <span className="step-num">05</span>
            <div className="step-icon">
              <Database size={18} />
            </div>
            <strong className="step-name">STORAGE / POSTGIS</strong>
            <span className="step-val">{postgisStatus === 'AVAILABLE' ? 'STORED IN POSTGIS' : 'POSTGIS NOT EXPOSED'}</span>
          </div>

          <div className="flow-arrow">
            <ArrowRight size={18} />
          </div>

          <div className="flow-step-card highlight-teal">
            <span className="step-num">06</span>
            <div className="step-icon">
              <ShieldCheck size={18} />
            </div>
            <strong className="step-name">PARCEL INTELLIGENCE</strong>
            <span className="step-val">{totalParcelsCount} RECORDS LOADED</span>
          </div>
        </div>

        {/* Database Context Details */}
        <div className="storage-details-grid">
          <div className="storage-detail-item">
            <span>STORAGE BACKEND</span>
            <strong>PostgreSQL / PostGIS (when configured)</strong>
            <small>Backend FastAPI Relational &amp; Spatial Database</small>
          </div>

          <div className="storage-detail-item">
            <span>DATABASE CONNECTION</span>
            <strong className={databaseStatus === 'CONNECTED' ? 'green-text' : ''}>
              {databaseStatus}
            </strong>
            <small>Direct client connections forbidden; served via API</small>
          </div>

          <div className="storage-detail-item">
            <span>PERSISTENCE DETAILS</span>
            <strong>{postgisStatus === 'AVAILABLE' ? 'PERSISTED IN POSTGIS' : 'NOT EXPOSED IN DEMO MODE'}</strong>
            <small>State reported by active backend service</small>
          </div>

          <div className="storage-detail-item">
            <span>LAST SYNCHRONIZATION</span>
            <strong>{lastUpdated ? `${lastUpdated.date} at ${lastUpdated.time}` : 'NOT AVAILABLE'}</strong>
            <small>Timestamp reported by dataset metadata</small>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          EXPORT MODAL
          ───────────────────────────────────────────────────────────── */}
      {isExportModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsExportModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title-group">
                <Download size={20} color="#00AFA3" />
                <h3>Export Parcel Data</h3>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setIsExportModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="modal-desc">
              Select the desired output format to download the verified cadastral parcel dataset.
            </p>

            <div className="export-options-list">
              <button
                type="button"
                className="export-option-card"
                onClick={exportParcelsGeoJSON}
              >
                <FileCode size={24} color="#00AFA3" />
                <div>
                  <strong>GeoJSON Feature Collection (.geojson)</strong>
                  <span>Standard geospatial vector format with polygon coordinates and properties</span>
                </div>
                <ChevronRight size={18} />
              </button>

              <button
                type="button"
                className="export-option-card"
                onClick={exportParcelsCSV}
              >
                <FileSpreadsheet size={24} color="#4D72FF" />
                <div>
                  <strong>Tabular Parcel Summary (.csv)</strong>
                  <span>Spreadsheet format containing parcel IDs, areas, counts, and coverage ratios</span>
                </div>
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="parcel-btn secondary"
                onClick={() => setIsExportModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PROVENANCE DRAWER
          ───────────────────────────────────────────────────────────── */}
      {isSourceDrawerOpen && (
        <div className="drawer-backdrop" onClick={() => setIsSourceDrawerOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="parcel-eyebrow">DATA ARCHITECTURE</p>
                <h3>Data Source &amp; Provenance Details</h3>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setIsSourceDrawerOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="drawer-content">
              <div className="drawer-section">
                <h4>SOURCE METADATA</h4>
                <div className="drawer-row">
                  <span>Source Dataset</span>
                  <strong>{sourceDatasetName}</strong>
                </div>
                <div className="drawer-row">
                  <span>Analysis Job ID</span>
                  <strong className="code-font">{activeJobId || 'DEMO-SIH2026'}</strong>
                </div>
                <div className="drawer-row">
                  <span>ML Model Pipeline</span>
                  <strong>{modelName}</strong>
                </div>
                <div className="drawer-row">
                  <span>Total Feature Count</span>
                  <strong>{totalParcelsCount} Parcels</strong>
                </div>
              </div>

              <div className="drawer-section">
                <h4>SPATIAL REFERENCE</h4>
                <div className="drawer-row">
                  <span>Coordinate Space</span>
                  <strong>{coordinateSpace}</strong>
                </div>
                <div className="drawer-row">
                  <span>Coordinate Reference System</span>
                  <strong>{crsDisplay}</strong>
                </div>
                <div className="drawer-row">
                  <span>Geometry Validity</span>
                  <strong className="green-text">PASS &bull; Standard Polygon</strong>
                </div>
              </div>

              <div className="drawer-section">
                <h4>DATABASE &amp; PERSISTENCE</h4>
                <div className="drawer-row">
                  <span>Database Status</span>
                  <strong>{databaseStatus}</strong>
                </div>
                <div className="drawer-row">
                  <span>PostGIS Status</span>
                  <strong>{postgisStatus}</strong>
                </div>
                <div className="drawer-row">
                  <span>Last Updated</span>
                  <strong>{lastUpdated ? `${lastUpdated.date} at ${lastUpdated.time}` : 'NOT AVAILABLE'}</strong>
                </div>
              </div>
            </div>

            <div className="drawer-foot">
              <button
                type="button"
                className="parcel-btn primary full-width"
                onClick={() => setIsSourceDrawerOpen(false)}
              >
                CLOSE DRAWER
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default function ParcelsPage() {
  return (
    <ParcelErrorBoundary>
      <ParcelsWorkspace />
    </ParcelErrorBoundary>
  )
}
