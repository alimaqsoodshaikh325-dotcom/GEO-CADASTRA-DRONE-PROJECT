import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clipboard,
  Clock3,
  Database,
  ExternalLink,
  History as HistoryIcon,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import { api } from '../services/api'
import './HistoryPage.css'

const STATUS_FILTERS = ['ALL', 'COMPLETED', 'RUNNING', 'QUEUED', 'FAILED']

function normalizeStatus(value) {
  return String(value || 'NOT AVAILABLE').toUpperCase()
}

function shortJobId(jobId) {
  if (!jobId) return 'JOB-NOT-AVAILABLE'
  return `JOB-${jobId.replace(/^job[-_]?/i, '').slice(0, 8).toUpperCase()}`
}

function formatDate(value) {
  if (!value) return 'NOT AVAILABLE'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'NOT AVAILABLE'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDuration(start, end) {
  if (!start || !end) return 'NOT AVAILABLE'
  const duration = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(duration) || duration < 0) return 'NOT AVAILABLE'
  return `${(duration / 1000).toFixed(1)}s`
}

function StatusPill({ status }) {
  const normalized = normalizeStatus(status)
  return <span className={`history-status history-status-${normalized.toLowerCase()}`}>{normalized}</span>
}

function LoadingState() {
  return (
    <section className="history-loading" aria-label="Loading persisted operations">
      <div className="history-skeleton history-skeleton-title" />
      <div className="history-skeleton history-skeleton-toolbar" />
      <div className="history-skeleton-table">
        {[1, 2, 3, 4].map((row) => <div className="history-skeleton history-skeleton-row" key={row} />)}
      </div>
    </section>
  )
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sort, setSort] = useState('created')
  const [selectedJob, setSelectedJob] = useState(null)
  const [copied, setCopied] = useState(false)
  const [health, setHealth] = useState(null)
  const [postgis, setPostgis] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [historyResult, healthResult, postgisResult] = await Promise.allSettled([
        api.getHistory(),
        api.getHealth(),
        api.getPostgisStatus(),
      ])
      if (historyResult.status === 'rejected') throw historyResult.reason
      const payload = historyResult.value || {}
      const nextJobs = Array.isArray(payload.history) ? payload.history : []
      setJobs(nextJobs)
      setTotal(typeof payload.total === 'number' ? payload.total : nextJobs.length)
      setHealth(healthResult.status === 'fulfilled' ? healthResult.value : null)
      setPostgis(postgisResult.status === 'fulfilled' ? postgisResult.value : null)
    } catch (requestError) {
      setJobs([])
      setTotal(null)
      setError(requestError?.message || 'Unable to retrieve persisted processing records from the backend.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const statuses = useMemo(() => new Set(jobs.map((job) => normalizeStatus(job.status))), [jobs])
  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase()
    return jobs
      .filter((job) => {
        const status = normalizeStatus(job.status)
        const matchesStatus = statusFilter === 'ALL' || status === statusFilter
        const haystack = [
          job.job_id,
          job.input_filename,
          job.model_name,
          job.status,
          job.message,
        ].filter(Boolean).join(' ').toLowerCase()
        return matchesStatus && (!term || haystack.includes(term))
      })
      .sort((left, right) => {
        if (sort === 'status') return normalizeStatus(left.status).localeCompare(normalizeStatus(right.status))
        if (sort === 'model') return String(left.model_name || '').localeCompare(String(right.model_name || ''))
        if (sort === 'input') return String(left.input_filename || '').localeCompare(String(right.input_filename || ''))
        return String(right.created_at || '').localeCompare(String(left.created_at || ''))
      })
  }, [jobs, search, sort, statusFilter])

  const summary = useMemo(() => ({
    total: jobs.length,
    completed: jobs.filter((job) => normalizeStatus(job.status) === 'COMPLETED').length,
    running: jobs.filter((job) => normalizeStatus(job.status) === 'RUNNING').length,
    failed: jobs.filter((job) => normalizeStatus(job.status) === 'FAILED').length,
  }), [jobs])

  const copyJobId = async (jobId) => {
    if (!jobId || !navigator.clipboard) return
    await navigator.clipboard.writeText(jobId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const statusIndicator = (value, fallback) => {
    const status = String(value?.status || '').toLowerCase()
    if (!value) return { label: 'NOT AVAILABLE', tone: 'unavailable' }
    if (status === 'ok' || status === 'connected' || status === 'available') return { label: fallback, tone: 'ok' }
    return { label: String(value.status || 'NOT AVAILABLE').toUpperCase(), tone: 'warn' }
  }

  if (loading) return <div className="workspace-page history-page"><LoadingState /></div>

  if (error) {
    return (
      <div className="workspace-page history-page">
        <PageHeader eyebrow="OPERATION HISTORY" title="Operation History" subtitle="Persisted processing jobs and real analysis activity from the current GeoAI backend." />
        <section className="history-state-panel history-error-panel" role="alert">
          <AlertCircle size={24} />
          <div>
            <h2>OPERATION HISTORY UNAVAILABLE</h2>
            <p>{error}</p>
            <button className="history-primary-button" onClick={load}><RefreshCw size={15} /> RETRY</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="workspace-page history-page">
      <PageHeader
        eyebrow="OPERATION HISTORY"
        title="Operation History"
        subtitle="Persisted processing jobs and real analysis activity from the current GeoAI backend."
        actions={<>
          <button className="history-secondary-button" onClick={load} disabled={loading} aria-label="Refresh operation history">
            <RefreshCw size={15} className={loading ? 'history-spin' : ''} /> {loading ? 'REFRESHING...' : 'REFRESH'}
          </button>
          <button className="history-primary-button" onClick={() => navigate('/analysis')}><PlayCircle size={15} /> NEW ANALYSIS</button>
        </>}
      />

      <section className="history-status-strip" aria-label="Backend status">
        {[
          ['API', statusIndicator(health, 'CONNECTED')],
          ['DATABASE', statusIndicator(health?.database, 'CONNECTED')],
          ['POSTGIS', statusIndicator(postgis, 'AVAILABLE')],
        ].map(([label, indicator]) => (
          <span className="history-system-status" key={label}>
            <i className={`history-status-dot ${indicator.tone}`} /> {label} <strong>{indicator.label}</strong>
          </span>
        ))}
      </section>

      <section className="history-summary-grid" aria-label="Operation summary">
        {[
          ['TOTAL JOBS', summary.total, 'ALL'],
          ['COMPLETED', summary.completed, 'COMPLETED'],
          ['RUNNING', summary.running, 'RUNNING'],
          ['FAILED', summary.failed, 'FAILED'],
        ].map(([label, value, filter]) => (
          <button key={label} className={`history-summary-card ${statusFilter === filter ? 'active' : ''}`} onClick={() => setStatusFilter(filter)}>
            <span>{label}</span><strong>{value}</strong>
          </button>
        ))}
      </section>

      {jobs.length === 0 ? (
        <section className="history-state-panel history-empty-panel">
          <div className="history-empty-icon"><HistoryIcon size={24} /></div>
          <div>
            <p className="history-state-kicker">NO OPERATIONS YET</p>
            <h2>NO OPERATION HISTORY AVAILABLE</h2>
            <p>The backend has not returned any persisted processing records yet.</p>
            <small>Processing records will appear here after the first analysis is persisted.</small>
            <div className="history-state-actions">
              <button className="history-primary-button" onClick={() => navigate('/analysis')}><PlayCircle size={15} /> START NEW ANALYSIS</button>
              <button className="history-secondary-button" onClick={load}><RefreshCw size={15} /> REFRESH</button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="history-toolbar" aria-label="History filters">
            <label className="history-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search jobs, inputs, models..." aria-label="Search operation history" />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  style={{ display:'inline-flex', alignItems:'center', padding:'2px', border:'none', background:'transparent', color:'#8fa4b2', cursor:'pointer', borderRadius:'4px', flexShrink:0 }}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="history-filter-group" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.filter((filter) => filter === 'ALL' || statuses.has(filter)).map((filter) => (
                <button key={filter} className={statusFilter === filter ? 'active' : ''} onClick={() => setStatusFilter(filter)}>{filter}</button>
              ))}
            </div>
            <label className="history-sort">
              <span>SORT</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort operation history">
                <option value="created">Newest first</option>
                <option value="status">Status</option>
                <option value="model">Model</option>
                <option value="input">Input</option>
              </select>
            </label>
          </section>

          {filteredJobs.length === 0 ? (
            <section className="history-no-match"><Search size={20} /><strong>NO MATCHING OPERATIONS</strong><span>Try a different search or status filter.</span></section>
          ) : (
            <section className="history-table-panel">
              <div className="history-table-meta"><span>{filteredJobs.length} shown · {total ?? jobs.length} persisted</span></div>
              <div className="history-table-scroll">
                <table className="history-table">
                  <thead><tr><th>JOB</th><th>INPUT</th><th>MODEL</th><th>STATUS</th><th>BUILDINGS</th><th>PARCELS</th><th>CREATED</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {filteredJobs.map((job) => (
                      <tr key={job.job_id} tabIndex={0} onClick={() => setSelectedJob(job)} onKeyDown={(event) => { if (event.key === 'Enter') setSelectedJob(job) }}>
                        <td><button className="history-job-link" onClick={(event) => { event.stopPropagation(); setSelectedJob(job) }} title={job.job_id}>{shortJobId(job.job_id)} <ArrowRight size={13} /></button></td>
                        <td title={job.input_filename || undefined}>{job.input_filename || 'NOT AVAILABLE'}</td>
                        <td>{job.model_name || 'NOT AVAILABLE'}</td>
                        <td><StatusPill status={job.status} /></td>
                        <td>{job.building_count ?? 'NOT AVAILABLE'}</td>
                        <td>{job.parcel_count ?? 'NOT AVAILABLE'}</td>
                        <td>{formatDate(job.created_at)}</td>
                        <td><button className="history-icon-button" onClick={(event) => { event.stopPropagation(); setSelectedJob(job) }} aria-label={`View ${shortJobId(job.job_id)}`}><ExternalLink size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {selectedJob && (
        <div className="history-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedJob(null) }}>
          <aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-drawer-title">
            <div className="history-drawer-header">
              <div><p className="history-state-kicker">PERSISTED OPERATION</p><h2 id="history-drawer-title">{shortJobId(selectedJob.job_id)}</h2></div>
              <button className="history-icon-button" onClick={() => setSelectedJob(null)} aria-label="Close job details"><X size={18} /></button>
            </div>
            <div className="history-drawer-id"><code>{selectedJob.job_id || 'NOT AVAILABLE'}</code><button onClick={() => copyJobId(selectedJob.job_id)} aria-label="Copy full job ID"><Clipboard size={14} /> {copied ? 'JOB ID COPIED' : 'COPY ID'}</button></div>
            <dl className="history-details">
              <dt>STATUS</dt><dd><StatusPill status={selectedJob.status} /></dd>
              <dt>INPUT</dt><dd>{selectedJob.input_filename || 'NOT AVAILABLE'}</dd>
              <dt>MODEL</dt><dd>{selectedJob.model_name || 'NOT AVAILABLE'}</dd>
              <dt>CREATED</dt><dd>{formatDate(selectedJob.created_at)}</dd>
              <dt>COMPLETED</dt><dd>{formatDate(selectedJob.completed_at)}</dd>
              <dt>DURATION</dt><dd>{formatDuration(selectedJob.created_at, selectedJob.completed_at)}</dd>
              <dt>BUILDINGS</dt><dd>{selectedJob.building_count ?? 'NOT AVAILABLE'}</dd>
              <dt>PARCELS</dt><dd>{selectedJob.parcel_count ?? 'NOT AVAILABLE'}</dd>
              {normalizeStatus(selectedJob.status) === 'FAILED' && <><dt>ERROR</dt><dd className="history-error-text">{selectedJob.message || 'No diagnostic was exposed by the server.'}</dd></>}
            </dl>
            <div className="history-drawer-actions">
              {normalizeStatus(selectedJob.status) === 'COMPLETED' && <button className="history-primary-button" onClick={() => navigate(`/results/${selectedJob.job_id}`)}><CheckCircle2 size={15} /> VIEW RESULTS</button>}
              {['RUNNING', 'QUEUED'].includes(normalizeStatus(selectedJob.status)) && <button className="history-primary-button" onClick={() => navigate(`/processing/${selectedJob.job_id}`)}><LoaderCircle size={15} /> OPEN PROCESSING</button>}
              <button className="history-secondary-button" onClick={() => setSelectedJob(null)}>CLOSE</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
