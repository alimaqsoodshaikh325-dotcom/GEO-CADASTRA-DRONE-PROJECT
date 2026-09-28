import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Map as MapIcon,
  MapPin,
  MapPinOff,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { useJob } from '../hooks/useJob'
import { api } from '../services/api'
import './ReviewPage.css'

const reviewCategories = [
  { id: 'ALL', label: 'ALL' },
  { id: 'LOW_CONFIDENCE', label: 'LOW CONFIDENCE' },
  { id: 'BOUNDARY_CROSSING', label: 'BOUNDARY CROSSING' },
  { id: 'MULTI_PARCEL', label: 'MULTI-PARCEL' },
  { id: 'UNASSIGNED', label: 'UNASSIGNED' },
  { id: 'GEOMETRY_ERROR', label: 'GEOMETRY ERROR' },
  { id: 'REVIEW_REQUIRED', label: 'REVIEW REQUIRED' },
]

const priorityRules = {
  BOUNDARY_CROSSING: 'HIGH',
  GEOMETRY_ERROR: 'HIGH',
  REVIEW_REQUIRED: 'MEDIUM',
  UNASSIGNED: 'MEDIUM',
  MULTI_PARCEL: 'MEDIUM',
  LOW_CONFIDENCE: 'MEDIUM',
}

const reviewerGuidance = {
  BOUNDARY_CROSSING: 'Inspect building edge against the parcel boundary and confirm whether overlap is real or a clipping artifact.',
  LOW_CONFIDENCE: 'Verify whether the low confidence reflects canopy shadow, image noise, or a genuine boundary ambiguity.',
  MULTI_PARCEL: 'Check whether the structure crosses parcel ownership boundaries or should be split into parcel-specific components.',
  UNASSIGNED: 'Confirm whether the building is missing a parcel inference due to a spatial mismatch or a parcel data gap.',
  GEOMETRY_ERROR: 'Check the geometry validity and look for malformed rings, self-intersections, or invalid topology.',
  REVIEW_REQUIRED: 'Review the flagged structure against parcel and footprint geometry before accepting or rejecting the result.',
}

const typeLabelMap = {
  BOUNDARY_CROSSING: 'BOUNDARY CROSSING',
  LOW_CONFIDENCE: 'LOW CONFIDENCE',
  MULTI_PARCEL: 'MULTI-PARCEL',
  UNASSIGNED: 'UNASSIGNED',
  GEOMETRY_ERROR: 'GEOMETRY ERROR',
  REVIEW_REQUIRED: 'REVIEW REQUIRED',
}

const getBadgeClass = (type) => {
  const norm = String(type || '').toUpperCase()
  if (norm.includes('BOUNDARY') || norm.includes('CROSS')) return 'boundary'
  if (norm.includes('CONFIDENCE') || norm.includes('LOW')) return 'confidence'
  if (norm.includes('MULTI') || norm.includes('PARCEL')) return 'multi'
  if (norm.includes('UNASSIGNED') || norm.includes('NO_PARCEL')) return 'unassigned'
  if (norm.includes('GEOMETRY') || norm.includes('ERROR') || norm.includes('INVALID')) return 'geometry'
  if (norm.includes('RESOLVED') || norm.includes('APPROVED')) return 'resolved'
  return 'review'
}

const formatShortId = (jobId) => {
  if (!jobId) return '—'
  const clean = jobId.replace(/^job_/, '')
  return `#${clean.slice(0, 8).toUpperCase()}`
}

function ReviewMapPreview({ item }) {
  if (!item) {
    return (
      <div style={{ height: '220px', display: 'grid', placeItems: 'center', color: '#6B7C8C', border: '1px solid #DDE5EA', borderRadius: '10px', background: '#F8FBFC', fontSize: 13 }}>
        No geometry available for map inspection.
      </div>
    )
  }

  const building = item.buildingGeometry
  const parcel = item.parcelGeometry

  if (item.evidence?.coordinateSpace && item.evidence.coordinateSpace.toLowerCase().includes('pixel')) {
    return (
      <div style={{ height: '220px', display: 'grid', placeItems: 'center', color: '#6B7C8C', border: '1px solid #DDE5EA', borderRadius: '10px', background: '#F8FBFC', fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
        Pixel-Space Result. Geographic projection coordinates are unavailable for this feature.
      </div>
    )
  }

  if (!building && !parcel) {
    return (
      <div style={{ height: '220px', display: 'grid', placeItems: 'center', color: '#6B7C8C', border: '1px solid #DDE5EA', borderRadius: '10px', background: '#F8FBFC', fontSize: 13, textAlign: 'center', padding: '0 20px' }}>
        No parcel or building geometry was reported for this exception case.
      </div>
    )
  }

  return (
    <div style={{ height: '220px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #DDE5EA' }}>
      <MapContainer center={[20.5937, 78.9629]} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution="OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {parcel && <GeoJSON data={parcel} style={{ color: '#8B5CF6', weight: 2, fillOpacity: 0.14 }} />}
        {building && <GeoJSON data={building} style={{ color: '#00AFA3', weight: 2, fillOpacity: 0.28 }} />}
      </MapContainer>
    </div>
  )
}

export default function ReviewPage() {
  const { jobId } = useJob()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exceptions, setExceptions] = useState([])
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [selectedStatus, setSelectedStatus] = useState('UNREVIEWED')
  const [noteDraft, setNoteDraft] = useState('')
  const [notes, setNotes] = useState([])
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState(searchParams.get('job') || jobId || '')

  const loadReviewQueue = async () => {
    setLoading(true)
    setError('')
    try {
      const history = await api.getHistory()
      const historyJobs = history.history || []
      setJobs(historyJobs)
      const activeJobId = selectedJobId || historyJobs[0]?.job_id || ''
      if (!selectedJobId && activeJobId) setSelectedJobId(activeJobId)
      if (!activeJobId) {
        setExceptions([])
        setSelectedItemId(null)
        setNotes([])
        return
      }
      const reviewData = await api.getReviewQueue(activeJobId)
      const rows = (reviewData.reviews || []).map((item) => ({
        id: item.review_id,
        jobId: item.job_id,
        buildingId: item.building_id,
        parcelId: item.parcel_id || 'NOT AVAILABLE',
        type: item.exception_type,
        typeLabel: typeLabelMap[item.exception_type] || item.exception_type,
        confidence: item.confidence,
        priority: priorityRules[item.exception_type] || 'NOT EXPOSED',
        area: item.area_m2 != null ? `${Number(item.area_m2).toFixed(1)} m²` : 'NOT AVAILABLE',
        createdAt: item.created_at,
        rawReason: item.exception_type,
        buildingGeometry: item.geometry,
        parcelGeometry: null,
        evidence: {
          model: item.model || 'NOT AVAILABLE',
          checkpoint: 'NOT AVAILABLE',
          geometryStatus: item.exception_type,
          coordinateSpace: item.coordinate_space || 'NOT AVAILABLE',
          crs: item.crs || 'EPSG:3035 / WGS 84',
        },
        reviewStatus: item.status,
        recommendation: reviewerGuidance[item.exception_type] || 'Verify the persisted geometry and parcel relationship.',
        notes: item.notes
          ? [{ id: `${item.review_id}-note`, author: item.reviewer_id || 'Reviewer', timestamp: item.updated_at, text: item.notes }]
          : [],
      }))
      setExceptions(rows)
      setSelectedItemId(rows[0]?.id || null)
      setNotes(rows[0]?.notes || [])
    } catch (err) {
      setError(err?.message || 'Unable to load spatial review queue.')
      setExceptions([])
      setSelectedItemId(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReviewQueue()
  }, [jobId, selectedJobId])

  const filteredExceptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return exceptions.filter((item) => {
      const matchesCategory = activeCategory === 'ALL' || item.type === activeCategory
      const matchesPriority = priorityFilter === 'ALL' || item.priority === priorityFilter
      const matchesSearch =
        !term || [item.buildingId, item.parcelId, item.typeLabel, item.jobId].join(' ').toLowerCase().includes(term)
      return matchesCategory && matchesPriority && matchesSearch
    })
  }, [exceptions, searchTerm, activeCategory, priorityFilter])

  const selectedItem = filteredExceptions.find((item) => item.id === selectedItemId) || filteredExceptions[0] || null

  useEffect(() => {
    if (!selectedItem && filteredExceptions.length) {
      setSelectedItemId(filteredExceptions[0].id)
    }
  }, [filteredExceptions, selectedItem])

  const summaryCounts = useMemo(() => {
    return {
      total: exceptions.length,
      lowConfidence: exceptions.filter((item) => item.type === 'LOW_CONFIDENCE').length,
      boundaryCrossing: exceptions.filter((item) => item.type === 'BOUNDARY_CROSSING').length,
      multiParcel: exceptions.filter((item) => item.type === 'MULTI_PARCEL').length,
      unassigned: exceptions.filter((item) => item.type === 'UNASSIGNED').length,
      geometryError: exceptions.filter((item) => item.type === 'GEOMETRY_ERROR').length,
    }
  }, [exceptions])

  const handleDecision = async (nextStatus, decision = nextStatus) => {
    if (!selectedItem) return
    try {
      const saved = await api.updateReview(selectedItem.id, {
        status: nextStatus,
        decision,
        reviewer_id: user?.id || user?.email,
      })
      setExceptions((current) =>
        current.map((item) => (item.id === selectedItem.id ? { ...item, reviewStatus: saved.status } : item))
      )
      setSelectedStatus(saved.status)
      await loadReviewQueue()
    } catch (requestError) {
      setError(requestError.message || 'Decision could not be saved.')
    }
  }

  const saveNote = async () => {
    if (!selectedItem || !noteDraft.trim()) return
    try {
      await api.updateReview(selectedItem.id, {
        notes: noteDraft.trim(),
        reviewer_id: user?.id || user?.email,
      })
      setNoteDraft('')
      await loadReviewQueue()
    } catch (requestError) {
      setError(requestError.message || 'Review note could not be saved.')
    }
  }

  const handleResolve = async () => {
    if (!selectedItem) return
    try {
      await api.updateReview(selectedItem.id, {
        status: 'RESOLVED',
        decision: 'RESOLVED',
        reviewer_id: user?.id || user?.email,
      })
      await loadReviewQueue()
    } catch (requestError) {
      setError(requestError.message || 'Review resolution could not be saved.')
    }
  }

  // Active Job Details
  const activeJob = jobs.find((j) => j.job_id === selectedJobId) || jobs[0]
  const activeJobStatus = String(activeJob?.status || 'UNKNOWN').toUpperCase()
  const activeJobShortId = formatShortId(selectedJobId || activeJob?.job_id)

  const kpis = [
    {
      id: 'ALL',
      label: 'TOTAL EXCEPTIONS',
      val: summaryCounts.total,
      status: 'Review queue',
      icon: ShieldAlert,
      color: 'teal',
    },
    {
      id: 'LOW_CONFIDENCE',
      label: 'LOW CONFIDENCE',
      val: summaryCounts.lowConfidence,
      status: 'Below threshold',
      icon: AlertTriangle,
      color: 'blue',
    },
    {
      id: 'BOUNDARY_CROSSING',
      label: 'BOUNDARY CROSSING',
      val: summaryCounts.boundaryCrossing,
      status: 'Parcel overlap',
      icon: MapIcon,
      color: 'amber',
    },
    {
      id: 'MULTI_PARCEL',
      label: 'MULTI-PARCEL',
      val: summaryCounts.multiParcel,
      status: 'Cross parcel structures',
      icon: FileText,
      color: 'violet',
    },
    {
      id: 'UNASSIGNED',
      label: 'UNASSIGNED',
      val: summaryCounts.unassigned,
      status: 'Parcel not assigned',
      icon: Compass,
      color: 'gray',
    },
    {
      id: 'GEOMETRY_ERROR',
      label: 'GEOMETRY ERROR',
      val: summaryCounts.geometryError,
      status: 'Invalid topology',
      icon: XCircle,
      color: 'red',
    },
  ]

  // Category counts map for segmented filters
  const categoryCounts = useMemo(() => {
    const map = { ALL: exceptions.length }
    reviewCategories.forEach((cat) => {
      if (cat.id !== 'ALL') {
        map[cat.id] = exceptions.filter((item) => item.type === cat.id).length
      }
    })
    return map
  }, [exceptions])

  if (loading) {
    return (
      <div className="rc-page">
        <header className="rc-header">
          <div className="rc-header-left">
            <p className="rc-eyebrow">
              <span className="rc-eyebrow-dot" /> HUMAN-IN-THE-LOOP VERIFICATION
            </p>
            <h1 className="rc-heading">Spatial Review Center</h1>
            <p className="rc-description">
              Inspect automated spatial consensus flags, resolve geometry and parcel exceptions, and record reviewer decisions for downstream GIS verification.
            </p>
          </div>
          <div className="rc-top-actions">
            <button className="rc-btn-secondary" onClick={loadReviewQueue} disabled>
              <RefreshCw size={14} className="geo-spin" />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <div className="rc-kpi-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rc-kpi-card" style={{ height: 110, background: '#FFFFFF' }}>
              <div style={{ height: 16, width: '60%', background: '#F1F5F9', borderRadius: 4 }} />
              <div style={{ height: 32, width: '40%', background: '#F1F5F9', borderRadius: 6 }} />
              <div style={{ height: 12, width: '70%', background: '#F1F5F9', borderRadius: 4 }} />
            </div>
          ))}
        </div>

        <div className="rc-empty-panel">
          <RefreshCw size={24} style={{ color: '#00AFA3', animation: 'spin 1s linear infinite', marginBottom: 16 }} />
          <h3 className="rc-empty-title">Loading Spatial Review Queue...</h3>
          <p className="rc-empty-desc">Fetching consensus records and parcel topology from the cadastral engine.</p>
        </div>
      </div>
    )
  }

  if (error && exceptions.length === 0) {
    return (
      <div className="rc-page">
        <header className="rc-header">
          <div className="rc-header-left">
            <p className="rc-eyebrow">
              <span className="rc-eyebrow-dot" /> HUMAN-IN-THE-LOOP VERIFICATION
            </p>
            <h1 className="rc-heading">Spatial Review Center</h1>
            <p className="rc-description">
              Inspect automated spatial consensus flags, resolve geometry and parcel exceptions, and record reviewer decisions for downstream GIS verification.
            </p>
          </div>
          <div className="rc-top-actions">
            <button className="rc-btn-primary" onClick={loadReviewQueue}>
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
          </div>
        </header>

        <div className="rc-empty-panel" style={{ borderTopColor: '#E74C3C' }}>
          <div className="rc-empty-icon-wrap" style={{ backgroundColor: '#FEF2F2', color: '#E74C3C' }}>
            <AlertTriangle size={24} />
          </div>
          <h3 className="rc-empty-title">Unable to Load Review Queue</h3>
          <p className="rc-empty-desc">{error}</p>
          <div className="rc-empty-actions">
            <button className="rc-btn-primary" onClick={loadReviewQueue}>
              <RefreshCw size={14} /> Retry Connection
            </button>
            <button className="rc-btn-secondary" onClick={() => navigate('/results')}>
              Return to Results
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="rc-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      {/* ── PART 1: PAGE HEADER ── */}
      <header className="rc-header">
        <div className="rc-header-left">
          <p className="rc-eyebrow">
            <span className="rc-eyebrow-dot" /> HUMAN-IN-THE-LOOP VERIFICATION
          </p>
          <h1 className="rc-heading">Spatial Review Center</h1>
          <p className="rc-description">
            Inspect automated spatial consensus flags, resolve geometry and parcel exceptions, and record reviewer decisions for downstream GIS verification.
          </p>
        </div>

        {/* ── PART 2: TOP ACTIONS ── */}
        <div className="rc-top-actions">
          <button
            className="rc-btn-primary"
            onClick={() => navigate(selectedJobId ? `/results/${selectedJobId}` : '/results')}
            disabled={!selectedJobId}
            title="Inspect full results for the currently selected analysis job"
          >
            <ScanSearch size={15} />
            <span>Open Selected Result</span>
          </button>
          <button
            className="rc-btn-secondary"
            onClick={loadReviewQueue}
            title="Refresh review cases from server"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* ── PART 3: CURRENT JOB SELECTOR ── */}
      <div className="rc-analysis-card">
        <div className="rc-analysis-left">
          <span className="rc-analysis-eyebrow">CURRENT ANALYSIS</span>
          <span className="rc-analysis-job-badge" title={selectedJobId}>
            {activeJobShortId}
          </span>
          <span className={`rc-badge ${activeJobStatus === 'COMPLETED' ? 'resolved' : activeJobStatus === 'FAILED' ? 'geometry' : 'confidence'}`}>
            <span className="rc-badge-dot" />
            {activeJobStatus}
          </span>
        </div>

        <div className="rc-job-select-wrap">
          <select
            id="review-job"
            className="rc-job-select"
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
            aria-label="Select analysis job to review"
          >
            <option value="">Select analysis job...</option>
            {jobs.map((job) => (
              <option key={job.job_id} value={job.job_id}>
                {job.job_id} · {job.input_filename || 'Default Dataset'} · {String(job.status || '').toUpperCase()}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="rc-job-select-caret" />
        </div>
      </div>

      {/* ── PART 4 & 5: EXCEPTION SUMMARY (6 KPI Cards) ── */}
      <section className="rc-kpi-grid" aria-label="Exception category metrics">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          const isActive = activeCategory === kpi.id
          return (
            <motion.div
              key={kpi.label}
              className={`rc-kpi-card ${isActive ? 'active-kpi' : ''}`}
              onClick={() => setActiveCategory(kpi.id)}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') setActiveCategory(kpi.id) }}
              title={`Filter by ${kpi.label}`}
            >
              <div className={`rc-kpi-accent-bar ${kpi.color}`} />
              <div className="rc-kpi-top">
                <span className="rc-kpi-label">{kpi.label}</span>
                <div className={`rc-kpi-icon-wrap ${kpi.color}`}>
                  <Icon size={16} strokeWidth={2.2} />
                </div>
              </div>
              <div className="rc-kpi-number">{kpi.val}</div>
              <div className="rc-kpi-note">{kpi.status}</div>
            </motion.div>
          )
        })}
      </section>

      {/* ── PART 8 & 9: SEARCH BAR & SEGMENTED FILTERS ── */}
      <div className="rc-toolbar">
        <div className="rc-search-box">
          <Search size={15} />
          <input
            type="text"
            className="rc-search-input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search building, parcel, exception..."
            aria-label="Search building, parcel, exception"
          />
          {searchTerm && (
            <button
              className="rc-search-clear"
              onClick={() => setSearchTerm('')}
              aria-label="Clear search query"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="rc-filter-group" role="group" aria-label="Exception filters">
          {reviewCategories.map((category) => {
            const isActive = activeCategory === category.id
            const count = categoryCounts[category.id] ?? 0
            return (
              <button
                key={category.id}
                className={`rc-filter-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                <span>{category.label}</span>
                <span className="rc-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── PART 10 & 11: EMPTY STATE PANEL (When 0 exceptions match) ── */}
      {filteredExceptions.length === 0 ? (
        <div className="rc-empty-panel">
          <div className="rc-empty-icon-wrap">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="rc-empty-title">No Spatial Exceptions</h3>
          <p className="rc-empty-desc">
            No spatial exceptions require review for the currently loaded job data. All building footprints either achieved topology consensus or are marked clear.
          </p>

          <div className="rc-empty-summary-strip">
            <div className="rc-empty-summary-item">
              <span className="rc-empty-summary-label">BOUNDARY CROSSING</span>
              <span className="rc-empty-summary-val">{summaryCounts.boundaryCrossing}</span>
            </div>
            <div className="rc-empty-summary-item">
              <span className="rc-empty-summary-label">MULTI-PARCEL</span>
              <span className="rc-empty-summary-val">{summaryCounts.multiParcel}</span>
            </div>
            <div className="rc-empty-summary-item">
              <span className="rc-empty-summary-label">LOW CONFIDENCE</span>
              <span className="rc-empty-summary-val">{summaryCounts.lowConfidence}</span>
            </div>
            <div className="rc-empty-summary-item">
              <span className="rc-empty-summary-label">GEOMETRY ERROR</span>
              <span className="rc-empty-summary-val">{summaryCounts.geometryError}</span>
            </div>
          </div>

          <div className="rc-empty-actions">
            <button className="rc-btn-primary" onClick={() => navigate('/results')}>
              <ScanSearch size={15} />
              <span>Open Spatial Results</span>
            </button>
            <button className="rc-btn-secondary" onClick={loadReviewQueue}>
              <RefreshCw size={14} />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── PART 6, 7 & 12: MAIN REVIEW WORKSPACE (2 Columns) ── */
        <div className="rc-workspace-grid">
          {/* LEFT: Exception Queue (60–65%) */}
          <div className="rc-queue-card">
            <div className="rc-queue-header">
              <div className="rc-queue-title-area">
                <span className="rc-queue-eyebrow">EXCEPTION QUEUE</span>
                <h3 className="rc-queue-title">
                  <ShieldAlert size={15} style={{ color: '#D99A00' }} />
                  Pending Spatial Exceptions ({filteredExceptions.length})
                </h3>
              </div>
            </div>

            <div className="rc-queue-list">
              {filteredExceptions.map((item) => {
                const isSelected = selectedItem?.id === item.id
                const badgeClass = getBadgeClass(item.type)
                const confPercent = item.confidence != null ? `${(item.confidence * 100).toFixed(0)}%` : 'N/A'

                return (
                  <div
                    key={item.id}
                    className={`rc-queue-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedItemId(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelectedItemId(item.id) }}
                  >
                    <div className="rc-queue-row-top">
                      <div className="rc-queue-row-ids">
                        <span className="rc-bldg-id">{item.buildingId}</span>
                        <span className="rc-parcel-id">→ {item.parcelId}</span>
                      </div>
                      <span className={`rc-badge ${badgeClass}`}>
                        <span className="rc-badge-dot" />
                        {item.typeLabel}
                      </span>
                    </div>

                    <div className="rc-queue-row-reason">{item.rawReason}</div>

                    <div className="rc-queue-row-meta">
                      <span>CONF: <strong>{confPercent}</strong></span>
                      <span>AREA: <strong>{item.area}</strong></span>
                      <span>PRIORITY: <strong>{item.priority}</strong></span>
                      {item.reviewStatus && item.reviewStatus !== 'OPEN' && (
                        <span style={{ marginLeft: 'auto', color: '#19A86B' }}>
                          ● {item.reviewStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Review Case Detail (35–40%) */}
          {selectedItem && (
            <div className="rc-detail-card">
              <div className="rc-detail-header">
                <div className="rc-detail-title-area">
                  <span className="rc-detail-eyebrow">BUILDING INSPECTION</span>
                  <h3 className="rc-detail-title">
                    {selectedItem.buildingId} · {selectedItem.parcelId}
                  </h3>
                </div>
                <span className={`rc-badge ${getBadgeClass(selectedItem.reviewStatus || selectedItem.type)}`}>
                  <span className="rc-badge-dot" />
                  {selectedItem.reviewStatus || 'UNREVIEWED'}
                </span>
              </div>

              <div className="rc-detail-body">
                {/* 1. CASE SUMMARY */}
                <div>
                  <div className="rc-section-title">
                    <ShieldAlert size={14} style={{ color: '#00AFA3' }} /> CASE SUMMARY
                  </div>
                  <div className="rc-meta-grid">
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">Flagged Exception</span>
                      <span className="rc-meta-value">{selectedItem.typeLabel}</span>
                    </div>
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">Priority Tier</span>
                      <span className="rc-meta-value">{selectedItem.priority}</span>
                    </div>
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">AI Confidence</span>
                      <span className="rc-meta-value">
                        {selectedItem.confidence != null ? `${(selectedItem.confidence * 100).toFixed(1)}%` : 'NOT AVAILABLE'}
                      </span>
                    </div>
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">Building Area</span>
                      <span className="rc-meta-value">{selectedItem.area}</span>
                    </div>
                  </div>
                </div>

                {/* 2. MAP EVIDENCE */}
                <div>
                  <div className="rc-section-title">
                    <MapIcon size={14} style={{ color: '#00AFA3' }} /> MAP EVIDENCE
                  </div>
                  <ReviewMapPreview item={selectedItem} />
                </div>

                {/* 3. PARCEL & CONSENSUS EVIDENCE */}
                <div>
                  <div className="rc-section-title">
                    <Layers size={14} style={{ color: '#00AFA3' }} /> SPATIAL EVIDENCE & TOPOLOGY
                  </div>
                  <div className="rc-meta-grid">
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">Associated Parcel</span>
                      <span className="rc-meta-value">{selectedItem.parcelId}</span>
                    </div>
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">Segmentation Model</span>
                      <span className="rc-meta-value">{selectedItem.evidence?.model || 'GeoAI Extraction v2'}</span>
                    </div>
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">Geometry Status</span>
                      <span className="rc-meta-value">{selectedItem.evidence?.geometryStatus || 'FLAGGED'}</span>
                    </div>
                    <div className="rc-meta-cell">
                      <span className="rc-meta-label">Coordinate Reference</span>
                      <span className="rc-meta-value">{selectedItem.evidence?.crs || 'EPSG:3035 / WGS 84'}</span>
                    </div>
                  </div>
                </div>

                {/* 4. RECOMMENDED ACTION */}
                <div>
                  <div className="rc-section-title">
                    <ShieldCheck size={14} style={{ color: '#00AFA3' }} /> RECOMMENDED ACTION
                  </div>
                  <div className="rc-guidance-box">
                    {selectedItem.recommendation}
                  </div>
                </div>

                {/* 5. REVIEW ACTIONS */}
                <div>
                  <div className="rc-section-title">
                    <Check size={14} style={{ color: '#00AFA3' }} /> REVIEW ACTIONS
                  </div>
                  <div className="rc-action-stack">
                    <button
                      className="rc-action-btn-primary"
                      onClick={() => handleDecision('RESOLVED', 'APPROVED')}
                      title="Certify that this exception is acceptable and resolve it"
                    >
                      <Check size={15} />
                      <span>Approve / Certify Review</span>
                    </button>
                    <button
                      className="rc-action-btn-warning"
                      onClick={() => handleDecision('IN_REVIEW', 'CORRECTION_REQUIRED')}
                      title="Request boundary re-evaluation or manual edit"
                    >
                      <AlertTriangle size={15} />
                      <span>Request Correction</span>
                    </button>
                    <button
                      className="rc-action-btn-secondary"
                      onClick={() => handleDecision('DEFERRED', 'FIELD_SURVEY_REQUIRED')}
                      title="Flag case for ground truth survey"
                    >
                      <MapPin size={14} />
                      <span>Flag for Field Re-survey</span>
                    </button>
                    <div className="rc-action-row">
                      <button
                        className="rc-action-btn-secondary"
                        style={{ flex: 1 }}
                        onClick={() => navigate(`/results/${selectedItem.jobId}`)}
                      >
                        <ScanSearch size={14} />
                        <span>Open Result Detail</span>
                      </button>
                      <button
                        className="rc-action-btn-secondary"
                        style={{ flex: 1 }}
                        onClick={handleResolve}
                      >
                        <CheckCircle2 size={14} />
                        <span>Mark Resolved</span>
                      </button>
                      <button
                        className="rc-action-btn-secondary"
                        onClick={() => navigate('/map')}
                        title="Inspect in full map viewer"
                      >
                        <Compass size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 6. REVIEW NOTES */}
                <div>
                  <div className="rc-section-title">
                    <FileText size={14} style={{ color: '#00AFA3' }} /> REVIEW NOTES & HISTORY
                  </div>
                  <div className="rc-notes-box">
                    <textarea
                      className="rc-note-textarea"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Add reviewer notes, evidence or follow-up instructions..."
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="rc-btn-primary"
                        style={{ height: 34, fontSize: 12.5 }}
                        onClick={saveNote}
                        disabled={!noteDraft.trim()}
                      >
                        <FileText size={13} />
                        <span>Save Note</span>
                      </button>
                    </div>

                    {notes.length > 0 && (
                      <div className="rc-note-history-list">
                        {notes.map((note) => (
                          <div key={note.id} className="rc-note-item">
                            <div className="rc-note-meta">
                              <span>{note.author}</span>
                              <span>{note.timestamp ? new Date(note.timestamp).toLocaleString() : ''}</span>
                            </div>
                            <div className="rc-note-text">{note.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
