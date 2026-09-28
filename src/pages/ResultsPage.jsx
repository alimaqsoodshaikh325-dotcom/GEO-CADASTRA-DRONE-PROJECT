import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileCode,
  FileText,
  Filter,
  Grid,
  LandPlot,
  Layers,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { api } from '../services/api'
import './ResultsPage.css'

const statusName = (value) => String(value || 'UNKNOWN').toUpperCase()

const displayVal = (value, fallback = '—') => {
  if (value === null || value === undefined || value === '') return fallback
  return value
}

const formatShortId = (jobId) => {
  if (!jobId) return '—'
  const clean = jobId.replace(/^job_/, '')
  return `#${clean.slice(0, 8).toUpperCase()}`
}

const formatDateTime = (isoString) => {
  if (!isoString) return null
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return null
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  } catch {
    return null
  }
}

/* ══════════════════════════════════════════════════════════════
   Inspector Modal: Result Details
   ══════════════════════════════════════════════════════════════ */
function ResultDetail({ result, buildings, parcels, onClose, navigate }) {
  if (!result) return null
  const summary = result.summary || {}
  const geographic = buildings.length > 0 && buildings.every((item) => item.properties?.coordinate_space !== 'pixel')

  const createdDt = formatDateTime(result.created_at)
  const completedDt = formatDateTime(result.completed_at)

  const metadata = [
    { label: 'Input Dataset', value: displayVal(result.input_filename, 'Not specified') },
    { label: 'Model Employed', value: displayVal(result.model_name, 'Pending') },
    { label: 'Analysis Status', value: statusName(result.status) },
    { label: 'Created Time', value: createdDt ? `${createdDt.date} at ${createdDt.time}` : '—' },
    { label: 'Completion Time', value: completedDt ? `${completedDt.date} at ${completedDt.time}` : '—' },
    { label: 'Building Footprints', value: summary.building_count != null ? `${summary.building_count} detected` : '—' },
    { label: 'Parcels Evaluated', value: summary.parcel_count != null ? `${summary.parcel_count} associated` : '—' },
    { label: 'Coordinate Reference', value: geographic ? 'Geographic (CRS Preserved)' : buildings.length ? 'Pixel Coordinate Space' : '—' },
    { label: 'Consensus Quality', value: displayVal(summary.processing_status, 'Standard') },
    { label: 'PostGIS Synchronized', value: summary.empty_result === false ? 'Synchronized' : 'Standalone' },
  ]

  return (
    <div className="geo-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="geo-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="geo-modal-header">
          <div className="geo-modal-title-area">
            <span className="geo-modal-eyebrow">Analysis Inspection</span>
            <h2 id="result-detail-title" className="geo-modal-title" title={result.job_id}>
              {formatShortId(result.job_id)} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748B' }}>({result.job_id})</span>
            </h2>
          </div>
          <button className="geo-modal-close" aria-label="Close result details" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="geo-modal-body">
          <div className="geo-inspector-grid">
            {metadata.map((item) => (
              <div className="geo-inspector-cell" key={item.label}>
                <span className="geo-inspector-label">{item.label}</span>
                <span className="geo-inspector-value">{item.value}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="geo-modal-section-title">Persisted Artifacts & Outputs</div>
            {result.output_files?.length ? (
              <ul className="geo-file-list">
                {result.output_files.map((file) => (
                  <li key={file} className="geo-file-item">
                    <FileCode size={14} style={{ color: '#00B8B0', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', padding: '6px 0' }}>
                No standalone output files reported by engine.
              </div>
            )}
          </div>

          {result.warnings?.length > 0 && (
            <div className="geo-error-card" style={{ background: '#FFFBEB', borderColor: '#FDE68A', borderLeftColor: '#D97706', color: '#92400E' }}>
              <div className="geo-error-info">
                <AlertTriangle size={18} style={{ color: '#D97706' }} />
                <span>{result.warnings.join('; ')}</span>
              </div>
            </div>
          )}
        </div>

        <div className="geo-modal-footer">
          <button className="btn-geo-subtle" onClick={() => navigate(`/results/${result.job_id}`)}>
            <ExternalLink size={14} /> Open Full Result
          </button>
          <button className="btn-geo-subtle" onClick={() => navigate('/parcels')} disabled={!parcels?.length && !summary.parcel_count}>
            <Grid size={14} /> View Parcels
          </button>
          <button
            className="btn-new-analysis"
            style={{ height: 38, fontSize: 13 }}
            onClick={() => navigate(`/review?job=${encodeURIComponent(result.job_id)}`)}
            disabled={!buildings.length && !summary.building_count}
          >
            <ShieldAlert size={14} /> Review Consensus
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Main Page: Spatial Extraction Results
   ══════════════════════════════════════════════════════════════ */
export default function ResultsPage() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const [history, setHistory] = useState([])
  const [summary, setSummary] = useState(null)
  const [review, setReview] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailBuildings, setDetailBuildings] = useState([])
  const [detailParcels, setDetailParcels] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [sortOption, setSortOption] = useState('LATEST') // 'LATEST' | 'OLDEST' | 'BUILDINGS'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [historyResult, summaryResult, reviewResult] = await Promise.allSettled([
        api.getHistory(),
        api.getDashboardSummary(),
        api.getReviewQueue(),
      ])

      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value?.history || [])
      } else {
        setError(historyResult.reason?.message || 'Unable to load extraction results.')
      }

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value)
      }

      if (reviewResult.status === 'fulfilled') {
        setReview(reviewResult.value)
      }
    } catch (err) {
      setError(err.message || 'Unable to load extraction results.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // If a jobId param is present in the route, render the single job view
  if (jobId) {
    return <ResultJobPage jobId={jobId} navigate={navigate} />
  }

  // Active reviews list for matching
  const pendingReviews = useMemo(() => {
    return (review?.reviews || []).filter((item) => !['RESOLVED', 'REJECTED'].includes(item.status))
  }, [review])

  const pendingReviewJobIds = useMemo(() => {
    return new Set(pendingReviews.map((item) => item.job_id))
  }, [pendingReviews])

  // Filtered & sorted results
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    let items = history.filter((job) => {
      const status = statusName(job.status)
      const hasReviewReq = pendingReviewJobIds.has(job.job_id)

      let filterMatch = false
      if (filter === 'ALL') {
        filterMatch = true
      } else if (filter === 'REVIEW REQUIRED') {
        filterMatch = hasReviewReq
      } else {
        filterMatch = status === filter
      }

      if (!filterMatch) return false

      if (!term) return true
      const searchContent = [
        job.job_id,
        job.input_filename,
        job.model_name,
        job.status,
      ].filter(Boolean).join(' ').toLowerCase()

      return searchContent.includes(term)
    })

    // Apply sorting
    if (sortOption === 'LATEST') {
      items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    } else if (sortOption === 'OLDEST') {
      items.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    } else if (sortOption === 'BUILDINGS') {
      items.sort((a, b) => (b.building_count || 0) - (a.building_count || 0))
    }

    return items
  }, [history, search, filter, pendingReviewJobIds, sortOption])

  // Inspector modal trigger
  const openDetail = async (job) => {
    try {
      const [result, buildingData, parcelData] = await Promise.all([
        api.getResults(job.job_id),
        api.getBuildings(job.job_id).catch(() => ({ buildings: [] })),
        api.getParcels(job.job_id).catch(() => ({ parcels: [] })),
      ])
      setDetail({ ...job, ...result })
      setDetailBuildings(buildingData.buildings || [])
      setDetailParcels(parcelData.parcels || [])
    } catch (requestError) {
      setError(requestError.message || 'Unable to load result details.')
    }
  }

  // Dynamic KPI calculations directly from live backend aggregate
  const completedCount = summary?.completed_jobs ?? history.filter((j) => statusName(j.status) === 'COMPLETED').length
  const buildingsCount = summary?.total_buildings_detected ?? 0
  const parcelsCount = summary?.total_parcels_processed ?? 0
  const reviewCount = review ? pendingReviews.length : (pendingReviewJobIds.size || 0)

  const kpis = [
    {
      id: 'COMPLETED',
      label: 'Completed Analyses',
      val: completedCount,
      icon: CheckCircle2,
      color: 'teal',
      onClick: () => setFilter('COMPLETED'),
    },
    {
      id: 'BUILDINGS',
      label: 'Buildings Extracted',
      val: buildingsCount,
      icon: Building2,
      color: 'blue',
      onClick: () => setFilter('COMPLETED'),
    },
    {
      id: 'PARCELS',
      label: 'Parcels Analysed',
      val: parcelsCount,
      icon: LandPlot,
      color: 'indigo',
      onClick: () => setFilter('COMPLETED'),
    },
    {
      id: 'REVIEW',
      label: 'Review Required',
      val: reviewCount,
      icon: ShieldAlert,
      color: 'amber',
      onClick: () => {
        if (reviewCount > 0) {
          setFilter('REVIEW REQUIRED')
        } else {
          navigate('/review')
        }
      },
    },
  ]

  const cycleSort = () => {
    if (sortOption === 'LATEST') setSortOption('OLDEST')
    else if (sortOption === 'OLDEST') setSortOption('BUILDINGS')
    else setSortOption('LATEST')
  }

  const sortLabel = sortOption === 'LATEST' ? 'Sort: Latest ↓' : sortOption === 'OLDEST' ? 'Sort: Oldest ↑' : 'Sort: Buildings ↓'

  return (
    <div className="geo-results-workspace">
      {/* ── 1. Page Header ── */}
      <header className="geo-results-header">
        <div className="geo-results-header-left">
          <p className="geo-eyebrow">
            <span className="geo-eyebrow-dot" /> EXTRACTION RESULTS
          </p>
          <h1 className="geo-main-title">Spatial Extraction Results</h1>
          <p className="geo-main-description">
            Review building footprints, spatial measurements, parcel relationships, and quality results from completed analyses.
          </p>
        </div>

        <div className="geo-results-header-actions">
          <button className="btn-geo-subtle" onClick={load} title="Refresh analysis history" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'geo-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button className="btn-geo-subtle" onClick={() => navigate('/map')} title="Open interactive map explorer">
            <MapIcon size={14} />
            <span>Map Explorer</span>
          </button>
          <button className="btn-new-analysis" onClick={() => navigate('/analysis')}>
            <Plus size={16} />
            <span>New Analysis</span>
          </button>
        </div>
      </header>

      {/* ── 2. KPI Summary Cards ── */}
      {loading && !summary ? (
        <div className="geo-kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="geo-skeleton geo-skeleton-kpi" />
          ))}
        </div>
      ) : (
        <section className="geo-kpi-grid" aria-label="Analysis summary metrics">
          {kpis.map((kpi) => {
            const Icon = kpi.icon
            const isActive = (filter === kpi.id) || (kpi.id === 'REVIEW' && filter === 'REVIEW REQUIRED')
            return (
              <div
                key={kpi.label}
                className={`geo-kpi-card ${isActive ? 'active-kpi' : ''}`}
                onClick={kpi.onClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') kpi.onClick() }}
              >
                <div className="geo-kpi-top">
                  <div className={`geo-kpi-icon-wrap ${kpi.color}`}>
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                  <span className="geo-kpi-tag">Dynamic</span>
                </div>
                <div className="geo-kpi-content">
                  <div className="geo-kpi-number">{typeof kpi.val === 'number' ? kpi.val.toLocaleString() : displayVal(kpi.val, '0')}</div>
                  <div className="geo-kpi-label">{kpi.label}</div>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="geo-error-card" role="alert">
          <div className="geo-error-info">
            <AlertTriangle size={18} />
            <div>
              <span className="geo-error-title">Unable to load extraction results.</span>
              <span style={{ marginLeft: 8, opacity: 0.9 }}>Please check the connection and try again.</span>
            </div>
          </div>
          <button className="geo-error-retry-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {/* ── 3. Search + Filter Toolbar ── */}
      <div className="geo-toolbar">
        <div className="geo-toolbar-left">
          <div className="geo-search-box">
            <Search size={15} />
            <input
              type="text"
              className="geo-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs, buildings, parcels..."
              aria-label="Search jobs, buildings, parcels"
            />
            {search && (
              <button
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#94A3B8' }}
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="geo-filter-group" role="group" aria-label="Filter analyses by status">
            {['ALL', 'COMPLETED', 'RUNNING', 'FAILED', 'REVIEW REQUIRED'].map((item) => {
              const labelMap = {
                'ALL': 'All',
                'COMPLETED': 'Completed',
                'RUNNING': 'Running',
                'FAILED': 'Failed',
                'REVIEW REQUIRED': 'Review Required',
              }
              const isActive = filter === item
              return (
                <button
                  key={item}
                  className={`geo-filter-pill ${isActive ? 'active' : ''}`}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {labelMap[item] || item}
                  {item === 'REVIEW REQUIRED' && reviewCount > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, opacity: 0.85 }}>({reviewCount})</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="geo-toolbar-right">
          <button className="geo-sort-control" onClick={cycleSort} title="Toggle sort order" type="button">
            <ArrowUpDown size={13} style={{ color: '#00B8B0' }} />
            <span>{sortLabel}</span>
          </button>
        </div>
      </div>

      {/* ── 4. Results Table ── */}
      {loading && history.length === 0 ? (
        <div className="geo-table-card">
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <div className="geo-skeleton" style={{ height: 20, width: 220 }} />
          </div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="geo-skeleton-row">
              <div className="geo-skeleton" style={{ height: 24, width: 85 }} />
              <div className="geo-skeleton" style={{ height: 16, width: 150 }} />
              <div className="geo-skeleton" style={{ height: 20, width: 110 }} />
              <div className="geo-skeleton" style={{ height: 22, width: 90, borderRadius: 999 }} />
              <div className="geo-skeleton" style={{ height: 16, width: 50 }} />
              <div className="geo-skeleton" style={{ height: 16, width: 50 }} />
              <div className="geo-skeleton" style={{ height: 24, width: 100 }} />
              <div className="geo-skeleton" style={{ height: 28, width: 95, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="geo-empty-state">
          <div className="geo-empty-icon">
            <Building2 size={24} />
          </div>
          {history.length > 0 ? (
            <>
              <h3 className="geo-empty-title">No extraction results found</h3>
              <p className="geo-empty-desc">
                No analyses matched your current filter criteria or search query. Try clearing the search or resetting filters.
              </p>
              <button
                className="btn-geo-subtle"
                onClick={() => {
                  setSearch('')
                  setFilter('ALL')
                }}
              >
                Reset filters
              </button>
            </>
          ) : (
            <>
              <h3 className="geo-empty-title">No analyses yet</h3>
              <p className="geo-empty-desc">
                Start your first spatial extraction analysis to generate building footprints, spatial measurements, and parcel relationships.
              </p>
              <button className="btn-new-analysis" onClick={() => navigate('/analysis')}>
                <Plus size={16} />
                <span>New Analysis</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="geo-table-card">
          <div className="geo-table-scroll-wrap">
            <table className="geo-enterprise-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>JOB</th>
                  <th>INPUT</th>
                  <th>MODEL</th>
                  <th style={{ width: 140 }}>STATUS</th>
                  <th style={{ width: 100 }}>BUILDINGS</th>
                  <th style={{ width: 100 }}>PARCELS</th>
                  <th style={{ width: 130 }}>CREATED</th>
                  <th style={{ width: 130, textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job) => {
                  const status = statusName(job.status)
                  const hasReviewReq = pendingReviewJobIds.has(job.job_id)
                  const created = formatDateTime(job.created_at)
                  const shortId = formatShortId(job.job_id)

                  // Determine status pill presentation
                  let statusClass = 'status-completed'
                  let statusLabel = 'Completed'

                  if (status === 'RUNNING') {
                    statusClass = 'status-running'
                    statusLabel = 'Running'
                  } else if (status === 'FAILED') {
                    statusClass = 'status-failed'
                    statusLabel = 'Failed'
                  } else if (hasReviewReq || status === 'REVIEW REQUIRED') {
                    statusClass = 'status-review'
                    statusLabel = 'Review Required'
                  }

                  return (
                    <tr key={job.job_id} className="geo-table-row">
                      {/* 1. JOB */}
                      <td>
                        <span className="geo-job-id" title={job.job_id}>
                          {shortId}
                        </span>
                      </td>

                      {/* 2. INPUT */}
                      <td>
                        <div className="geo-cell-input" title={job.input_filename || 'Not available'}>
                          {job.input_filename ? (
                            job.input_filename
                          ) : (
                            <span className="geo-cell-muted">Not available</span>
                          )}
                        </div>
                      </td>

                      {/* 3. MODEL */}
                      <td>
                        {job.model_name ? (
                          <span className="geo-model-badge">
                            <Layers size={12} style={{ color: '#00B8B0' }} />
                            <span>{job.model_name}</span>
                          </span>
                        ) : (
                          <span className="geo-cell-muted">Pending</span>
                        )}
                      </td>

                      {/* 4. STATUS */}
                      <td>
                        <span className={`geo-status-pill ${statusClass}`}>
                          <span className="geo-status-dot" />
                          <span>{statusLabel}</span>
                        </span>
                      </td>

                      {/* 5. BUILDINGS */}
                      <td>
                        <span className="geo-metric-val">
                          {job.building_count != null ? job.building_count.toLocaleString() : '0'}
                        </span>
                        <span className="geo-metric-sub">bldgs</span>
                      </td>

                      {/* 6. PARCELS */}
                      <td>
                        <span className="geo-metric-val">
                          {job.parcel_count != null ? job.parcel_count.toLocaleString() : '0'}
                        </span>
                        <span className="geo-metric-sub">prcls</span>
                      </td>

                      {/* 7. CREATED */}
                      <td>
                        {created ? (
                          <div className="geo-datetime">
                            <span className="geo-date">{created.date}</span>
                            <span className="geo-time">{created.time}</span>
                          </div>
                        ) : (
                          <span className="geo-cell-muted">—</span>
                        )}
                      </td>

                      {/* 8. ACTION */}
                      <td style={{ textAlign: 'right' }}>
                        {status === 'COMPLETED' ? (
                          hasReviewReq ? (
                            <button
                              className="geo-btn-action action-review"
                              onClick={() => navigate(`/review?job=${encodeURIComponent(job.job_id)}`)}
                              title="Verify spatial exceptions"
                            >
                              <span>Review</span>
                              <ChevronRight size={13} />
                            </button>
                          ) : (
                            <button
                              className="geo-btn-action"
                              onClick={() => openDetail(job)}
                              title="Inspect extracted geometries"
                            >
                              <span>View results</span>
                              <ArrowRight size={13} />
                            </button>
                          )
                        ) : status === 'RUNNING' ? (
                          <button
                            className="geo-btn-action"
                            onClick={() => navigate(`/processing/${job.job_id}`)}
                            title="Inspect live execution progress"
                          >
                            <span>View progress</span>
                            <ArrowRight size={13} />
                          </button>
                        ) : (
                          <button
                            className="geo-btn-action"
                            onClick={() => navigate(`/processing/${job.job_id}`)}
                            title="Inspect job execution status"
                          >
                            <span>Open job</span>
                            <ArrowRight size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="geo-table-footer">
            <div>
              Showing <strong>{filtered.length}</strong> of <strong>{history.length}</strong> spatial analysis jobs
            </div>
            <div className="geo-footer-meta">
              <span>EPSG:3035 / WGS 84</span>
              <span>•</span>
              <span>GeoCadastra Cadastral Engine</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Result Detail Modal ── */}
      {detail && (
        <ResultDetail
          result={detail}
          buildings={detailBuildings}
          parcels={detailParcels}
          onClose={() => setDetail(null)}
          navigate={navigate}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Single Job View: /results/:jobId
   ══════════════════════════════════════════════════════════════ */
function ResultJobPage({ jobId, navigate }) {
  const [result, setResult] = useState(null)
  const [buildings, setBuildings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getResults(jobId), api.getBuildings(jobId)])
      .then(([next, buildingData]) => {
        setResult(next)
        setBuildings(buildingData.buildings || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [jobId])

  if (loading) {
    return (
      <div className="geo-results-workspace">
        <div className="geo-table-card" style={{ padding: 32 }}>
          <div className="geo-skeleton" style={{ height: 28, width: 240, marginBottom: 16 }} />
          <div className="geo-skeleton" style={{ height: 16, width: 400 }} />
        </div>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="geo-results-workspace">
        <div className="geo-empty-state">
          <div className="geo-empty-icon" style={{ color: '#DC2626', backgroundColor: '#FEE2E2' }}>
            <AlertTriangle size={24} />
          </div>
          <h3 className="geo-empty-title">Unable to load result</h3>
          <p className="geo-empty-desc">{error || 'The requested analysis result could not be found or returned by the server.'}</p>
          <button className="btn-new-analysis" onClick={() => navigate('/results')}>
            Back to Results
          </button>
        </div>
      </div>
    )
  }

  const geographic = buildings.length > 0 && buildings.every((item) => item.properties?.coordinate_space !== 'pixel')
  const shortId = formatShortId(jobId)

  return (
    <div className="geo-results-workspace">
      <header className="geo-results-header">
        <div className="geo-results-header-left">
          <p className="geo-eyebrow">
            <span className="geo-eyebrow-dot" /> ANALYSIS RECORD {shortId}
          </p>
          <h1 className="geo-main-title">Spatial Extraction Results</h1>
          <p className="geo-main-description">
            {result.input_filename || 'Source imagery dataset processed through cadastral inference pipeline.'}
          </p>
        </div>

        <div className="geo-results-header-actions">
          <button className="btn-geo-subtle" onClick={() => navigate('/results')}>
            ← All Results
          </button>
          <button className="btn-geo-subtle" onClick={() => navigate('/map')}>
            <MapIcon size={14} /> Map Explorer
          </button>
          <button className="btn-new-analysis" onClick={() => navigate(`/review?job=${encodeURIComponent(jobId)}`)}>
            <ShieldAlert size={14} /> Review Center
          </button>
        </div>
      </header>

      <section className="geo-kpi-grid">
        <div className="geo-kpi-card">
          <div className="geo-kpi-top">
            <div className="geo-kpi-icon-wrap blue">
              <Building2 size={18} />
            </div>
            <span className="geo-kpi-tag">Detected</span>
          </div>
          <div className="geo-kpi-content">
            <div className="geo-kpi-number">{result.summary?.building_count ?? buildings.length}</div>
            <div className="geo-kpi-label">Buildings Extracted</div>
          </div>
        </div>

        <div className="geo-kpi-card">
          <div className="geo-kpi-top">
            <div className="geo-kpi-icon-wrap indigo">
              <LandPlot size={18} />
            </div>
            <span className="geo-kpi-tag">Assigned</span>
          </div>
          <div className="geo-kpi-content">
            <div className="geo-kpi-number">{result.summary?.parcel_count ?? '0'}</div>
            <div className="geo-kpi-label">Parcels Evaluated</div>
          </div>
        </div>

        <div className="geo-kpi-card">
          <div className="geo-kpi-top">
            <div className="geo-kpi-icon-wrap teal">
              <CheckCircle2 size={18} />
            </div>
            <span className="geo-kpi-tag">State</span>
          </div>
          <div className="geo-kpi-content">
            <div className="geo-kpi-number" style={{ fontSize: 20 }}>{statusName(result.status)}</div>
            <div className="geo-kpi-label">Execution Status</div>
          </div>
        </div>

        <div className="geo-kpi-card">
          <div className="geo-kpi-top">
            <div className="geo-kpi-icon-wrap amber">
              <Layers size={18} />
            </div>
            <span className="geo-kpi-tag">CRS</span>
          </div>
          <div className="geo-kpi-content">
            <div className="geo-kpi-number" style={{ fontSize: 17 }}>
              {geographic ? 'GEOGRAPHIC' : buildings.length ? 'PIXEL SPACE' : 'UNASSIGNED'}
            </div>
            <div className="geo-kpi-label">Coordinate Geometry</div>
          </div>
        </div>
      </section>

      <div className="geo-table-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#17212B' }}>Persisted Outputs</h3>
        <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
          {result.output_files?.length ? result.output_files.join(', ') : 'No standalone output files reported.'}
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: '#94A3B8' }}>
          CRS: {geographic ? 'Reported geographic features (EPSG:3035 / WGS 84 consensus).' : 'Pixel-space output without CRS.'}
        </p>
      </div>
    </div>
  )
}
