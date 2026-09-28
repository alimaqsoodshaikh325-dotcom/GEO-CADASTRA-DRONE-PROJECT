import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Compass, Eye, Move, Plus, RotateCcw, Minus } from 'lucide-react'

function polygonRings(feature) {
  const geometry = feature?.geometry
  const rings = geometry?.type === 'Polygon'
    ? geometry.coordinates
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates.flat()
      : []
  return Array.isArray(rings)
    ? rings.filter((ring) =>
        Array.isArray(ring) &&
        ring.length >= 3 &&
        ring.every((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
      )
    : []
}

function featureId(feature) {
  const properties = feature?.properties || {}
  return properties.building_id || properties.parcel_id || feature?.id || null
}

export default function Geospatial3DCanvas({
  features = [],
  selected = null,
  onPick = () => {},
  cameraCommand = null,
}) {
  const [yaw, setYaw] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [interaction, setInteraction] = useState('orbit')
  const dragRef = useRef(null)

  const shapes = useMemo(
    () => features
      .map((feature) => ({ feature, rings: polygonRings(feature) }))
      .filter((shape) => shape.rings.length > 0),
    [features]
  )
  const extent = useMemo(() => {
    const points = shapes.flatMap((shape) => shape.rings.flat())
    if (!points.length) return null
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
  }, [shapes])
  const heightDataAvailable = shapes.some(({ feature }) => {
    const height = feature.properties?.height_m ?? feature.properties?.height
    return height != null && Number.isFinite(Number(height))
  })

  useEffect(() => {
    if (!cameraCommand) return
    if (cameraCommand.type === 'top' || cameraCommand.type === 'reset') {
      setYaw(0)
      setPitch(0)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } else if (cameraCommand.type === 'north') {
      setYaw(0)
    } else if (cameraCommand.type === 'iso') {
      setYaw(-35)
      setPitch(55)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }, [cameraCommand])

  const issuePreset = (type) => {
    if (type === 'top' || type === 'reset') {
      setYaw(0)
      setPitch(0)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } else if (type === 'north') {
      setYaw(0)
    } else if (type === 'iso') {
      setYaw(-35)
      setPitch(55)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }

  const projectPoint = ([x, y]) => {
    if (!extent) return [500, 350]
    const rangeX = Math.max(extent.maxX - extent.minX, 1)
    const rangeY = Math.max(extent.maxY - extent.minY, 1)
    const baseScale = Math.min(760 / rangeX, 460 / rangeY)
    const localX = (x - (extent.minX + extent.maxX) / 2) * baseScale
    const localY = ((extent.minY + extent.maxY) / 2 - y) * baseScale
    const yawRadians = yaw * Math.PI / 180
    const pitchRadians = pitch * Math.PI / 180
    const rotatedX = localX * Math.cos(yawRadians) - localY * Math.sin(yawRadians)
    const rotatedY = localX * Math.sin(yawRadians) + localY * Math.cos(yawRadians)
    return [
      500 + rotatedX * zoom + pan.x,
      350 + rotatedY * Math.cos(pitchRadians) * zoom + pan.y,
    ]
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerMove = (event) => {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    dragRef.current = { x: event.clientX, y: event.clientY }
    if (interaction === 'orbit') {
      setYaw((value) => value + dx * 0.45)
      setPitch((value) => Math.max(0, Math.min(80, value + dy * 0.35)))
    } else {
      setPan((value) => ({ x: value.x + dx, y: value.y + dy }))
    }
  }

  if (!shapes.length) {
    return (
      <div className="map-3d-empty" role="status">
        <Box size={30} />
        <strong>NO MAPPABLE BUILDING GEOMETRY</strong>
        <span>3D view requires valid building polygons returned for the selected job.</span>
      </div>
    )
  }

  return (
    <div className="map-3d-canvas">
      <div className="map-3d-controls" role="toolbar" aria-label="2.5D camera controls">
        <button type="button" onClick={() => issuePreset('top')} aria-label="Top view" title="Top view">
          TOP
        </button>
        <button type="button" onClick={() => issuePreset('north')} aria-label="North up" title="Reset yaw to north">
          <Compass size={12} /> NORTH
        </button>
        <button type="button" onClick={() => issuePreset('iso')} aria-label="Isometric view" title="Isometric camera preset">
          3D ISO
        </button>
        <button type="button" onClick={() => setInteraction('orbit')} aria-pressed={interaction === 'orbit'} aria-label="Orbit camera" title="Drag to orbit">
          <Eye size={12} /> ORBIT
        </button>
        <button type="button" onClick={() => setInteraction('pan')} aria-pressed={interaction === 'pan'} aria-label="Pan camera" title="Drag to pan">
          <Move size={12} /> PAN
        </button>
        <button type="button" onClick={() => setZoom((value) => Math.min(6, value * 1.2))} aria-label="Zoom in" title="Zoom in">
          <Plus size={12} />
        </button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value / 1.2))} aria-label="Zoom out" title="Zoom out">
          <Minus size={12} />
        </button>
        <button type="button" onClick={() => issuePreset('reset')} aria-label="Reset camera" title="Reset camera">
          <RotateCcw size={12} />
        </button>
      </div>

      <div className="map-3d-height-note" role="status">
        {heightDataAvailable
          ? 'HEIGHT VALUES REPORTED · EXTRUSION NOT REPRESENTED'
          : '3D HEIGHT DATA NOT AVAILABLE · 2.5D VISUALIZATION ONLY'}
      </div>

      <svg
        className="map-3d-scene"
        viewBox="0 0 1000 700"
        role="group"
        aria-label="Interactive planar view of actual building geometries"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { dragRef.current = null }}
        onPointerCancel={() => { dragRef.current = null }}
        onWheel={(event) => {
          event.preventDefault()
          setZoom((value) => Math.max(0.25, Math.min(6, value * (event.deltaY < 0 ? 1.12 : 1 / 1.12))))
        }}
      >
        <defs>
          <pattern id="map-3d-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(216,226,232,.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1000" height="700" fill="url(#map-3d-grid)" />
        {shapes.map(({ feature, rings }, index) => {
          const id = featureId(feature)
          const isSelected = id != null && id === featureId(selected)
          const path = rings.map((ring) => ring.map((point, pointIndex) => {
            const [screenX, screenY] = projectPoint(point)
            return `${pointIndex ? 'L' : 'M'} ${screenX} ${screenY}`
          }).join(' ') + ' Z').join(' ')
          return (
            <path
              key={id || index}
              d={path}
              fill={isSelected ? 'rgba(0,199,183,.7)' : 'rgba(0,199,183,.32)'}
              fillRule="evenodd"
              stroke={isSelected ? '#FFFFFF' : '#00C7B7'}
              strokeWidth={isSelected ? 3 : 2}
              tabIndex={0}
              role="button"
              aria-label={`Select building ${id || 'with unavailable ID'}`}
              onClick={() => onPick(feature)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onPick(feature)
                }
              }}
            >
              {id && <title>{`Building ${id}${heightDataAvailable ? '' : ' · height unavailable'}`}</title>}
            </path>
          )
        })}
      </svg>

      <div className="map-3d-camera-readout" aria-live="polite">
        PITCH {pitch.toFixed(0)}° · YAW {yaw.toFixed(0)}° · ZOOM {zoom.toFixed(2)}×
      </div>
    </div>
  )
}
