import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileCode,
  FileText,
  FolderOpen,
  Info,
  Layers,
  LoaderCircle,
  MapPinned,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../services/api'
import { useJob } from '../hooks/useJob'
import './ProcessingPage.css'

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
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      full: d.toLocaleString(),
    }
  } catch {
    return null
  }
}

const calculateDuration = (startIso, endIso) => {
  if (!startIso || !endIso) return null
  try {
    const start = new Date(startIso).getTime()
    const end = new Date(endIso).getTime()
    if (isNaN(start) || isNaN(end) || end < start) return null
    const diffMs = end - start
    const sec = Math.floor(diffMs / 1000)
    if (sec < 60) return `${(diffMs / 1000).toFixed(1)}s`
    const min = Math.floor(sec / 60)
    const remSec = sec % 60
    return `${min}m ${remSec}s`
  } catch {
    return null
  }
}

const getFileTypeBadge = (filename) => {
  const ext = (filename || '').split('.').pop().toLowerCase()
  if (['geojson', 'json'].includes(ext)) return { label: 'VECTOR', color: 'blue' }
  if (['csv'].includes(ext)) return { label: 'TABULAR', color: 'indigo' }
  if (['png', 'jpg', 'jpeg', 'tif', 'tiff'].includes(ext)) return { label: 'RASTER', color: 'amber' }
  if (['txt'].includes(ext)) return { label: 'REPORT', color: 'teal' }
  return { label: 'ARTIFACT', color: 'gray' }
}

/* ══════════════════════════════════════════════════════════════
   Output Drawer Component
   ══════════════════════════════════════════════════════════════ */
function OutputDrawer({ jobId, files, onClose, navigate }) {
  const [downloading, setDownloading] = useState(null)
  const [previewContent, setPreviewContent] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const handleDownload = async (filename) => {
    setDownloading(filename)
    try {
      await api.downloadArtifact(jobId, filename)
    } catch (err) {
      alert(`Download failed: ${err.message}`)
    } finally {
      setDownloading(null)
    }
  }

  const handleInspect = async (filename) => {
    setPreviewFile(filename)
    setPreviewLoading(true)
    setPreviewError('')
    setPreviewContent(null)
    try {
      const ext = filename.split('.').pop().toLowerCase()
      if (['png', 'jpg', 'jpeg'].includes(ext)) {
        setPreviewContent({ type: 'image', url: api.getArtifactUrl(jobId, filename) })
      } else {
        const text = await api.getJobArtifactText(jobId, filename)
        setPreviewContent({ type: 'text', text })
      }
    } catch (err) {
      setPreviewError(err.message || 'Unable to inspect artifact content.')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="proc-drawer-backdrop" role="presentation" onClick={onClose}>
      <div className="proc-drawer-dialog" role="dialog" aria-modal="true" aria-labelledby="proc-drawer-title" onClick={(e) => e.stopPropagation()}>
        <div className="proc-drawer-header">
          <div>
            <span className="proc-drawer-eyebrow">Artifact Inventory</span>
            <h2 id="proc-drawer-title" className="proc-drawer-title">
              Generated Artifacts ({files.length})
            </h2>
          </div>
          <button className="proc-icon-btn" aria-label="Close output drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="proc-drawer-body">
          {previewFile ? (
            <div className="proc-artifact-inspect-box">
              <div className="proc-inspect-header">
                <span className="proc-inspect-title">{previewFile}</span>
                <button className="btn-geo-subtle small" onClick={() => setPreviewFile(null)}>
                  ← Back to List
                </button>
              </div>
              {previewLoading ? (
                <div className="proc-loading-box">
                  <LoaderCircle className="proc-spin" size={20} /> Inspecting artifact...
                </div>
              ) : previewError ? (
                <div className="proc-error-banner">
                  <AlertTriangle size={16} /> {previewError}
                </div>
              ) : previewContent?.type === 'image' ? (
                <div className="proc-inspect-media">
                  <img src={previewContent.url} alt={previewFile} />
                </div>
              ) : (
                <pre className="proc-inspect-code">{previewContent?.text?.slice(0, 8000) || 'Empty file'}</pre>
              )}
            </div>
          ) : (
            <ul className="proc-drawer-file-list">
              {files.map((file) => {
                const badge = getFileTypeBadge(file)
                const isDownloading = downloading === file
                const isGeoJson = file.toLowerCase().endsWith('.geojson')

                return (
                  <li key={file} className="proc-drawer-file-item">
                    <div className="proc-file-info">
                      <span className={`proc-file-type-badge ${badge.color}`}>{badge.label}</span>
                      <span className="proc-file-name" title={file}>
                        {file}
                      </span>
                    </div>
                    <div className="proc-file-actions">
                      <button className="btn-geo-subtle small" onClick={() => handleInspect(file)} title="Inspect artifact content">
                        <Eye size={13} /> View
                      </button>
                      <button className="btn-geo-subtle small" onClick={() => handleDownload(file)} disabled={isDownloading} title="Download artifact">
                        {isDownloading ? <LoaderCircle className="proc-spin" size={13} /> : <Download size={13} />} Download
                      </button>
                      {isGeoJson && (
                        <button className="btn-geo-subtle small" onClick={() => navigate('/map')} title="Open in Map Explorer">
                          <MapPinned size={13} /> Map
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="proc-drawer-footer">
          <button className="btn-geo-subtle" onClick={onClose}>
            Close
          </button>
          <button className="btn-new-analysis" onClick={() => navigate(`/results/${jobId}`)}>
            <ExternalLink size={14} /> Full Workstation View
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Error Drawer Component
   ══════════════════════════════════════════════════════════════ */
function ErrorDrawer({ jobId, message, onClose }) {
  const [copied, setCopied] = useState(false)

  const copyError = () => {
    navigator.clipboard.writeText(`Job ID: ${jobId}\nError: ${message}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="proc-drawer-backdrop" role="presentation" onClick={onClose}>
      <div className="proc-drawer-dialog" role="dialog" aria-modal="true" aria-labelledby="proc-err-title" onClick={(e) => e.stopPropagation()}>
        <div className="proc-drawer-header">
          <div>
            <span className="proc-drawer-eyebrow" style={{ color: '#DC2626' }}>
              Execution Failure
            </span>
            <h2 id="proc-err-title" className="proc-drawer-title">
              Technical Error Details
            </h2>
          </div>
          <button className="proc-icon-btn" aria-label="Close error drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="proc-drawer-body">
          <div className="proc-error-banner" style={{ marginBottom: 16 }}>
            <AlertTriangle size={18} />
            <div>
              <strong>Processing Execution Interrupted</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.9 }}>
                The engine encountered an issue during analysis execution.
              </p>
            </div>
          </div>

          <div className="proc-tech-grid">
            <div className="proc-tech-cell">
              <span className="proc-tech-label">Job ID</span>
              <span className="proc-tech-val code">{jobId}</span>
            </div>
            <div className="proc-tech-cell">
              <span className="proc-tech-label">Failure Domain</span>
              <span className="proc-tech-val">GeoAI Engine Pipeline</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <span className="proc-tech-label" style={{ marginBottom: 8, display: 'block' }}>
              Raw Exception Output
            </span>
            <pre className="proc-inspect-code" style={{ background: '#FFF5F5', borderColor: '#FECACA', color: '#991B1B' }}>
              {message || 'No additional error output returned by backend.'}
            </pre>
          </div>
        </div>

        <div className="proc-drawer-footer">
          <button className="btn-geo-subtle" onClick={copyError}>
            {copied ? <Check size={14} color="#16A34A" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy Exception Log'}
          </button>
          <button className="btn-geo-subtle" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Main Page: Processing Workstation (/processing/:jobId)
   ══════════════════════════════════════════════════════════════ */
export default function ProcessingPage() {
  const navigate = useNavigate()
  const { jobId: routeJobId } = useParams()
  const { setJobId } = useJob()
  const jobId = routeJobId || window.location.pathname.split('/').pop()

  const [job, setJob] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [outputDrawerOpen, setOutputDrawerOpen] = useState(false)
  const [errorDrawerOpen, setErrorDrawerOpen] = useState(false)
  const [techOpen, setTechOpen] = useState(false)

  useEffect(() => {
    let timer
    let active = true

    const load = async () => {
      try {
        const next = await api.getJobStatus(jobId)
        if (!active) return
        setJob(next)
        setJobId(jobId)

        if (next.status === 'completed') {
          try {
            const completedResult = await api.getResults(jobId)
            if (active) setResult(completedResult)
          } catch {
            // Result payload optional until fully indexed
          }
        } else if (next.status !== 'failed') {
          timer = window.setTimeout(load, 2000)
        }
      } catch (e) {
        if (active) setError(e.message)
      }
    }

    load()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [jobId, setJobId])

  // Derive execution status
  const status = (job?.status || 'CONNECTING').toUpperCase()
  const isCompleted = status === 'COMPLETED'
  const isFailed = status === 'FAILED'
  const isRunning = status === 'RUNNING' || status === 'QUEUED' || status === 'CONNECTING'

  const createdDt = formatDateTime(job?.created_at)
  const completedDt = formatDateTime(job?.completed_at)
  const duration = calculateDuration(job?.created_at, job?.completed_at)

  const progressVal = job?.progress != null ? job.progress : isCompleted ? 100 : isFailed ? 100 : 0
  const shortId = formatShortId(jobId)

  const inputFilename = job?.payload?.input_filename || result?.input_filename || 'Source Imagery Dataset'
  const modelName = job?.payload?.model || result?.model_name || 'U-Net++ / YOLO11-Seg'

  // Standard output artifact list & status matching
  const standardArtifacts = [
    { key: 'final_buildings.geojson', label: 'FINAL BUILDINGS', type: 'Vector' },
    { key: 'predictions.geojson', label: 'PREDICTIONS', type: 'Vector' },
    { key: 'building_measurements.csv', label: 'BUILDING MEASUREMENTS', type: 'Tabular' },
    { key: 'building_parcel_association.csv', label: 'BUILDING-PARCEL ASSOCIATION', type: 'Tabular' },
    { key: 'parcel_statistics.csv', label: 'PARCEL STATISTICS', type: 'Tabular' },
    { key: 'spatial_consensus.csv', label: 'SPATIAL CONSENSUS', type: 'Tabular' },
    { key: 'final_report.txt', label: 'FINAL REPORT', type: 'Report' },
    { key: 'visualizations', label: 'VISUALIZATIONS', type: 'Raster' },
  ]

  const artifactCheck = useMemo(() => {
    const files = result?.output_files || []
    return standardArtifacts.map((art) => {
      const exists = files.some((f) => f.toLowerCase().includes(art.key.toLowerCase()))
      let artStatus = 'NOT AVAILABLE'
      if (exists) artStatus = 'AVAILABLE'
      else if (isCompleted) artStatus = 'MISSING'
      else if (isRunning) artStatus = 'PENDING'
      else if (isFailed) artStatus = 'FAILED'

      return { ...art, status: artStatus }
    })
  }, [result?.output_files, isCompleted, isRunning, isFailed])

  // Technical Pipeline Stages
  const pipelineStages = useMemo(() => {
    if (isCompleted) {
      return [
        { name: 'INPUT', status: 'PASS' },
        { name: 'MODEL', status: 'PASS' },
        { name: 'INFERENCE', status: 'PASS' },
        { name: 'GIS', status: 'PASS' },
        { name: 'OUTPUTS', status: 'PASS' },
        { name: 'PERSISTENCE', status: 'PASS' },
        { name: 'RESULT', status: 'PASS' },
      ]
    }
    if (isFailed) {
      return [
        { name: 'INPUT', status: 'PASS' },
        { name: 'MODEL', status: 'PASS' },
        { name: 'INFERENCE', status: 'FAILED' },
        { name: 'GIS', status: 'NOT EXPOSED BY SERVER' },
        { name: 'OUTPUTS', status: 'NOT AVAILABLE' },
        { name: 'PERSISTENCE', status: 'NOT EXPOSED BY SERVER' },
        { name: 'RESULT', status: 'FAILED' },
      ]
    }
    // Running stage evaluation
    return [
      { name: 'INPUT', status: 'PASS' },
      { name: 'MODEL', status: 'PASS' },
      { name: 'INFERENCE', status: 'RUNNING' },
      { name: 'GIS', status: 'STATUS NOT EXPOSED BY SERVER' },
      { name: 'OUTPUTS', status: 'STATUS NOT EXPOSED BY SERVER' },
      { name: 'PERSISTENCE', status: 'STATUS NOT EXPOSED BY SERVER' },
      { name: 'RESULT', status: 'STATUS NOT EXPOSED BY SERVER' },
    ]
  }, [isCompleted, isFailed])

  return (
    <div className="proc-workspace">
      {/* ── 1. Page Header with Compact Breadcrumb Context Indicator ── */}
      <header className="proc-page-header">
        <div className="proc-header-left">
          <div className="proc-breadcrumb-strip">
            <span className="proc-bc-item" onClick={() => navigate('/analysis')}>NEW ANALYSIS</span>
            <span className="proc-bc-sep">→</span>
            <span className="proc-bc-item active">PROCESSING JOB</span>
            <span className="proc-bc-sep">→</span>
            <span className="proc-bc-item code">JOB {shortId}</span>
          </div>
          <h1 className="proc-main-title">{inputFilename}</h1>
          <div className="proc-job-meta-strip">
            <span className="proc-meta-badge">JOB {shortId}</span>
            <span className="proc-meta-divider">•</span>
            <span className="proc-meta-full-id" title={jobId}>
              {jobId}
            </span>
          </div>
        </div>

        <div className="proc-header-actions">
          <button className="btn-geo-subtle" onClick={() => navigate('/analysis')}>
            ← Back to Analysis
          </button>
          <button className="btn-geo-subtle" onClick={() => navigate('/map')}>
            <MapPinned size={14} /> Map Explorer
          </button>
        </div>
      </header>

      {/* ── Error Banner ── */}
      {error && (
        <div className="proc-error-banner" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Unable to connect to status endpoint.</strong>
            <p style={{ margin: '2px 0 0', opacity: 0.9 }}>{error}</p>
          </div>
        </div>
      )}

      {/* ── 2. Job Status & Progress Banner ── */}
      <section className={`proc-status-card ${status.toLowerCase()}`}>
        <div className="proc-status-card-header">
          <div className="proc-status-card-title">
            {isCompleted ? (
              <CheckCircle2 size={24} style={{ color: '#16A34A' }} />
            ) : isFailed ? (
              <AlertTriangle size={24} style={{ color: '#DC2626' }} />
            ) : (
              <LoaderCircle size={24} className="proc-spin" style={{ color: '#00B8B0' }} />
            )}
            <div>
              <h2 className="proc-card-heading">
                {isCompleted ? 'PROCESSING COMPLETE' : isFailed ? 'PROCESSING FAILED' : 'PROCESSING ANALYSIS'}
              </h2>
              <p className="proc-card-subheading">
                {isCompleted
                  ? 'Your GeoAI analysis has finished and the generated outputs are ready for inspection.'
                  : isFailed
                  ? 'Processing encountered an execution error and halted.'
                  : job?.message || 'Executing raster inference and GIS spatial consensus pipeline...'}
              </p>
            </div>
          </div>

          <span className={`proc-status-pill ${status.toLowerCase()}`}>
            <span className="proc-status-dot" />
            <span>{status}</span>
          </span>
        </div>

        {/* Smooth Progress Bar */}
        <div className="proc-progress-wrapper">
          <div className="proc-progress-bar-bg">
            <div
              className={`proc-progress-bar-fill ${status.toLowerCase()}`}
              style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }}
            />
          </div>
          <div className="proc-progress-labels">
            <span>
              Progress: <strong>{progressVal}%</strong>
            </span>
            <span>{job?.progress != null ? `Backend Reported: ${job.progress}%` : 'Standard Execution'}</span>
          </div>
        </div>

        {/* Failed Error Highlight */}
        {isFailed && (
          <div className="proc-failed-notice">
            <div className="proc-failed-notice-text">
              <strong>ERROR SUMMARY</strong>
              <p>{job?.message || 'Processing failed during model or GIS execution.'}</p>
            </div>
            <button className="btn-geo-subtle small" onClick={() => setErrorDrawerOpen(true)}>
              <Terminal size={13} /> View Technical Error
            </button>
          </div>
        )}
      </section>

      {/* ── 3. Pipeline Timeline ── */}
      <section className="proc-section-card">
        <div className="proc-section-header">
          <span className="proc-section-eyebrow">PIPELINE EXECUTION TRACE</span>
          <h3 className="proc-section-title">Technical Pipeline Timeline</h3>
        </div>

        <div className="proc-timeline-track">
          {pipelineStages.map((stage, idx) => {
            const isPass = stage.status === 'PASS'
            const isRun = stage.status === 'RUNNING'
            const isFail = stage.status === 'FAILED'

            return (
              <div key={stage.name} className="proc-timeline-step">
                <div className={`proc-timeline-node ${stage.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {isPass ? <Check size={14} /> : isFail ? <X size={14} /> : isRun ? <LoaderCircle size={14} className="proc-spin" /> : <span className="proc-node-num">{idx + 1}</span>}
                </div>
                <div className="proc-timeline-info">
                  <span className="proc-step-name">{stage.name}</span>
                  <span className={`proc-step-status-tag ${stage.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {stage.status}
                  </span>
                </div>
                {idx < pipelineStages.length - 1 && <div className="proc-timeline-connector" />}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Two Column Details Grid ── */}
      <div className="proc-two-col-grid">
        {/* ── 4. Processing Summary ── */}
        <section className="proc-section-card">
          <div className="proc-section-header">
            <span className="proc-section-eyebrow">ANALYSIS SPECIFICATIONS</span>
            <h3 className="proc-section-title">Processing Summary</h3>
          </div>

          <div className="proc-info-grid">
            <div className="proc-info-cell">
              <span className="proc-info-label">Input Filename</span>
              <span className="proc-info-val" title={inputFilename}>
                {inputFilename}
              </span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Model Selected</span>
              <span className="proc-info-val">{modelName}</span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Checkpoint Path</span>
              <span className="proc-info-val code" title={job?.payload?.model || 'NOT EXPOSED BY SERVER'}>
                {job?.payload?.model ? job.payload.model.split('/').pop() : 'NOT EXPOSED BY SERVER'}
              </span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Execution Status</span>
              <span className="proc-info-val">{status}</span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Created Time</span>
              <span className="proc-info-val">{createdDt ? `${createdDt.date} ${createdDt.time}` : 'NOT AVAILABLE'}</span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Completion Time</span>
              <span className="proc-info-val">{completedDt ? `${completedDt.date} ${completedDt.time}` : 'PENDING'}</span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Total Duration</span>
              <span className="proc-info-val">{duration || (isCompleted ? 'Completed' : 'Processing...')}</span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Buildings Detected</span>
              <span className="proc-info-val">
                {result?.summary?.building_count != null
                  ? result.summary.building_count.toLocaleString()
                  : job?.payload?.valid_detections != null
                  ? job.payload.valid_detections
                  : isCompleted
                  ? '0'
                  : 'PENDING'}
              </span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">Coordinate Space</span>
              <span className="proc-info-val">
                {result?.summary?.georeferenced === true
                  ? 'Raster Coordinate Space'
                  : result?.summary?.georeferenced === false
                  ? 'Pixel Coordinate Space'
                  : 'NOT EXPOSED BY SERVER'}
              </span>
            </div>

            <div className="proc-info-cell">
              <span className="proc-info-label">CRS Reference</span>
              <span className="proc-info-val">
                {result?.summary?.georeferenced === true ? 'EPSG Preserved (WGS 84)' : 'Pixel Space (No CRS)'}
              </span>
            </div>
          </div>
        </section>

        {/* ── 5. Output Artifact Validation ── */}
        <section className="proc-section-card">
          <div className="proc-section-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div>
                <span className="proc-section-eyebrow">ARTIFACT VERIFICATION</span>
                <h3 className="proc-section-title">Output Validation</h3>
              </div>
              {result?.output_files?.length > 0 && (
                <button className="btn-geo-subtle small" onClick={() => setOutputDrawerOpen(true)}>
                  <FolderOpen size={13} /> View Outputs ({result.output_files.length})
                </button>
              )}
            </div>
          </div>

          <div className="proc-artifact-table-wrap">
            <table className="proc-artifact-table">
              <thead>
                <tr>
                  <th>ARTIFACT</th>
                  <th>TYPE</th>
                  <th style={{ textAlign: 'right' }}>AVAILABILITY</th>
                </tr>
              </thead>
              <tbody>
                {artifactCheck.map((art) => {
                  const isAvail = art.status === 'AVAILABLE'
                  const isPend = art.status === 'PENDING'
                  const isFail = art.status === 'FAILED' || art.status === 'MISSING'

                  return (
                    <tr key={art.key}>
                      <td className="proc-art-name">{art.label}</td>
                      <td>
                        <span className="proc-art-type-tag">{art.type}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`proc-art-status ${art.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          <span className="proc-status-dot" />
                          <span>{art.status}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── 6. Persistence Status ── */}
      <section className="proc-section-card">
        <div className="proc-section-header">
          <span className="proc-section-eyebrow">POSTGIS & STORAGE INTEGRATION</span>
          <h3 className="proc-section-title">Result Persistence</h3>
        </div>

        <div className="proc-persistence-grid">
          <div className="proc-persist-cell">
            <span className="proc-persist-label">DATABASE RECORD</span>
            <span className="proc-persist-val">
              {job ? <span className="proc-tag pass">RECORD CREATED</span> : <span className="proc-tag warn">NOT EXPOSED BY SERVER</span>}
            </span>
          </div>

          <div className="proc-persist-cell">
            <span className="proc-persist-label">POSTGIS SYNCHRONIZATION</span>
            <span className="proc-persist-val">
              {result?.summary?.empty_result === false ? (
                <span className="proc-tag pass">POSTGIS SYNCHRONIZED</span>
              ) : isCompleted ? (
                <span className="proc-tag pass">STANDALONE GIS RECORD</span>
              ) : (
                <span className="proc-tag warn">NOT EXPOSED BY SERVER</span>
              )}
            </span>
          </div>

          <div className="proc-persist-cell">
            <span className="proc-persist-label">OUTPUT STORAGE</span>
            <span className="proc-persist-val">
              {result?.output_files?.length ? (
                <span className="proc-tag pass">PERSISTED IN STORAGE</span>
              ) : (
                <span className="proc-tag warn">NOT EXPOSED BY SERVER</span>
              )}
            </span>
          </div>

          <div className="proc-persist-cell">
            <span className="proc-persist-label">RESULT RECORD</span>
            <span className="proc-persist-val">
              {isCompleted ? <span className="proc-tag pass">READY FOR INSPECTION</span> : <span className="proc-tag warn">PENDING</span>}
            </span>
          </div>
        </div>
      </section>

      {/* ── 7. Technical Details (Collapsible) ── */}
      <section className="proc-section-card">
        <button
          className="proc-collapsible-trigger"
          onClick={() => setTechOpen(!techOpen)}
          aria-expanded={techOpen}
        >
          <div className="proc-collapsible-left">
            <Terminal size={16} style={{ color: '#00B8B0' }} />
            <span>Technical Details & Metadata</span>
          </div>
          <ChevronRight size={16} className={`proc-chevron ${techOpen ? 'open' : ''}`} />
        </button>

        {techOpen && (
          <div className="proc-collapsible-content">
            <div className="proc-tech-grid">
              <div className="proc-tech-cell">
                <span className="proc-tech-label">Full Job ID</span>
                <span className="proc-tech-val code">{jobId}</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Input Filename</span>
                <span className="proc-tech-val">{inputFilename}</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Model Checkpoint</span>
                <span className="proc-tech-val code">{job?.payload?.model || 'NOT EXPOSED BY SERVER'}</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Progress Percentage</span>
                <span className="proc-tech-val">{progressVal}%</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Execution Status</span>
                <span className="proc-tech-val">{status}</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Created Timestamp</span>
                <span className="proc-tech-val">{job?.created_at || 'NOT EXPOSED BY SERVER'}</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Completed Timestamp</span>
                <span className="proc-tech-val">{job?.completed_at || 'NOT EXPOSED BY SERVER'}</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Output Directory</span>
                <span className="proc-tech-val code">{result?.summary?.output_dir || 'NOT EXPOSED BY SERVER'}</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Artifact Count</span>
                <span className="proc-tech-val">{result?.output_files?.length || 0} persisted files</span>
              </div>

              <div className="proc-tech-cell">
                <span className="proc-tech-label">Coordinate Geometry</span>
                <span className="proc-tech-val">
                  {result?.summary?.georeferenced === true ? 'Raster (EPSG Preserved)' : 'Pixel Coordinate Space'}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 8. Action Bar (Footer) ── */}
      <footer className="proc-action-bar">
        <div className="proc-action-bar-left">
          <button className="btn-geo-subtle" onClick={() => navigate('/analysis')}>
            ← Back to Analysis
          </button>
        </div>

        <div className="proc-action-bar-right">
          {isCompleted && (
            <>
              <button className="btn-geo-subtle" onClick={() => setOutputDrawerOpen(true)} disabled={!result?.output_files?.length}>
                <FolderOpen size={14} /> Open Outputs ({result?.output_files?.length || 0})
              </button>
              <button className="btn-geo-subtle" onClick={() => navigate('/map')}>
                <MapPinned size={14} /> Open Map
              </button>
              <button className="btn-new-analysis" onClick={() => navigate(`/results/${jobId}`)}>
                <CheckCircle2 size={16} /> View Results
              </button>
            </>
          )}

          {isFailed && (
            <>
              <button className="btn-geo-subtle" onClick={() => setErrorDrawerOpen(true)}>
                <Terminal size={14} /> View Error Output
              </button>
              <button className="btn-new-analysis" onClick={() => navigate('/analysis')}>
                <RotateCcw size={14} /> Retry Analysis
              </button>
            </>
          )}

          {isRunning && (
            <button className="btn-geo-subtle" onClick={() => navigate('/map')}>
              <MapPinned size={14} /> Map Explorer
            </button>
          )}
        </div>
      </footer>

      {/* ── Output Drawer Modal ── */}
      {outputDrawerOpen && (
        <OutputDrawer
          jobId={jobId}
          files={result?.output_files || []}
          onClose={() => setOutputDrawerOpen(false)}
          navigate={navigate}
        />
      )}

      {/* ── Error Drawer Modal ── */}
      {errorDrawerOpen && (
        <ErrorDrawer
          jobId={jobId}
          message={job?.message || 'Processing halted.'}
          onClose={() => setErrorDrawerOpen(false)}
        />
      )}
    </div>
  )
}
