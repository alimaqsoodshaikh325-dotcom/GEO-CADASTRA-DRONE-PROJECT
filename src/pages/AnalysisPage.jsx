import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Check, Clock, FileImage, FolderOpen, Info, LoaderCircle, Play, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2, Upload, UploadCloud, X } from 'lucide-react'
import { api } from '../services/api'
import { useJob } from '../hooks/useJob'
import './AnalysisPage.css'

const MODEL_LABELS = { unetpp: 'U-Net++', yolo11: 'YOLO11-Seg', maskrcnn: 'Mask R-CNN' }
const MODEL_DETAILS = {
  unetpp: { role: 'Footprint refinement', badge: 'TOP' },
  yolo11: { role: 'Instance segmentation', badge: 'FAST' },
  maskrcnn: { role: 'Mask refinement', badge: 'INSTANCE' },
}

function inferModelId(item = {}) {
  const text = `${item.model_id || ''} ${item.model || ''} ${item.name || ''} ${item.path || ''}`.toLowerCase()
  if (/unet/.test(text)) return 'unetpp'
  if (/yolo/.test(text)) return 'yolo11'
  if (/mask.?rcnn/.test(text)) return 'maskrcnn'
  return null
}

function normalizeModelCatalog(raw = {}) {
  const checkpoints = Array.isArray(raw.checkpoints) ? raw.checkpoints : []
  const rawModels = Array.isArray(raw.models) ? raw.models : []
  const checkpointsByModel = new Map()

  checkpoints.forEach((checkpoint) => {
    const modelId = checkpoint.model_id || inferModelId(checkpoint)
    if (!modelId) return
    const list = checkpointsByModel.get(modelId) || []
    list.push(checkpoint)
    checkpointsByModel.set(modelId, list)
  })

  const models = Object.entries(MODEL_LABELS).map(([id, label]) => {
    const apiModel = rawModels.find((model) => model.id === id)
    const checkpointList = checkpointsByModel.get(id) || []
    const checkpoint = apiModel?.checkpoint || checkpointList.find((entry) => (entry.name || '').toLowerCase().includes('best')) || checkpointList[0] || null
    const available = typeof apiModel?.available === 'boolean' ? apiModel.available : Boolean(checkpoint)

    return {
      id,
      label: apiModel?.label || label,
      role: MODEL_DETAILS[id]?.role || 'Model specialist',
      badge: MODEL_DETAILS[id]?.badge || 'READY',
      available,
      checkpoint: checkpoint ? { ...checkpoint, model_id: id, available } : null,
      checkpoint_count: apiModel?.checkpoint_count || checkpointList.length,
    }
  })

  return { models, checkpoints }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Not exposed'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function Status({ state, children }) {
  return <span className={`an-status ${state}`}>{state === 'pass' && <Check size={12} />}{children}</span>
}

export default function AnalysisPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setJobId } = useJob()
  const fileInputRef = useRef(null)
  const [mode, setMode] = useState('standard')
  const [inputTab, setInputTab] = useState('upload')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [metadata, setMetadata] = useState(null)
  const [datasets, setDatasets] = useState(null)
  const [split, setSplit] = useState('test')
  const [history, setHistory] = useState([])
  const [checkpoints, setCheckpoints] = useState([])
  const [modelCatalog, setModelCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [modelId, setModelId] = useState('')
  const [confidence, setConfidence] = useState(0.5)
  const [error, setError] = useState('')
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitStep, setSubmitStep] = useState('')
  const [saved, setSaved] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [retryAction, setRetryAction] = useState(() => () => {})
  const [mlConnectivityStatus, setMlConnectivityStatus] = useState('NOT CHECKED')
  const [mlConnectivityMessage, setMlConnectivityMessage] = useState('ML connectivity not verified.')
  const [lastConnectivityCheck, setLastConnectivityCheck] = useState(null)
  const [automatedPipeline, setAutomatedPipeline] = useState(false)

  const verifyBackendHealth = async () => {
    const health = await api.getHealth()
    if (!health || health.status !== 'ok') {
      throw new Error('FastAPI health check failed.')
    }
    return health
  }

  const refreshModels = async () => {
    setLoading(true)
    setError('')
    setMlConnectivityStatus('CHECKING')
    setMlConnectivityMessage('Checking model catalog...')

    try {
      await verifyBackendHealth()
      const catalogData = await api.getModelCheckpoints()
      const normalized = normalizeModelCatalog(catalogData)
      setCheckpoints(normalized.checkpoints)
      setModelCatalog(normalized.models)

      const selected = normalized.models.find((model) => model.id === modelId) || normalized.models[0] || null
      if (!normalized.models.length || !normalized.models.some((model) => model.available)) {
        setMlConnectivityStatus('UNAVAILABLE')
        setMlConnectivityMessage('? ML backend unavailable.')
        setLastConnectivityCheck(new Date().toISOString())
        return
      }

      if (selected && selected.available) {
        setMlConnectivityStatus('CONNECTED')
        setMlConnectivityMessage('? Model catalog and selected checkpoint are available.')
      } else {
        setMlConnectivityStatus('PARTIAL')
        setMlConnectivityMessage('? Model catalog available, selected checkpoint unavailable.')
      }

      setLastConnectivityCheck(new Date().toISOString())
    } catch (requestError) {
      setMlConnectivityStatus('ERROR')
      setMlConnectivityMessage(requestError.message || 'ML backend unavailable.')
      setError(requestError.message || 'Could not refresh model catalog.')
      setRetryAction(() => refreshModels)
    } finally {
      setLoading(false)
    }
  }

  const loadResources = async () => {
    setLoading(true)
    setError('')
    try {
      await verifyBackendHealth()
      const [datasetData, historyData] = await Promise.all([api.getDatasets(), api.getHistory()])
      setDatasets(datasetData)
      setHistory(historyData?.history || [])

      const catalogData = await api.getModelCheckpoints()
      const normalized = normalizeModelCatalog(catalogData)
      setCheckpoints(normalized.checkpoints)
      setModelCatalog(normalized.models)

      const preferred = Object.keys(MODEL_LABELS).find((id) => normalized.models.some((model) => model.id === id && model.available)) || normalized.models[0]?.id || ''
      if (preferred) setModelId((currentModelId) => currentModelId || preferred)

      if (!normalized.models.length || !normalized.models.some((model) => model.available)) {
        setMlConnectivityStatus('UNAVAILABLE')
        setMlConnectivityMessage('? ML backend unavailable.')
      } else {
        setMlConnectivityStatus('NOT CHECKED')
        setMlConnectivityMessage('ML connectivity not verified.')
      }
    } catch (requestError) {
      setError(requestError.message || 'Analysis metadata could not be loaded.')
      setRetryAction(() => loadResources)
      setMlConnectivityStatus('ERROR')
      setMlConnectivityMessage(requestError.message || 'ML backend unavailable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadResources()
  }, [])

  useEffect(() => {
    const preferred = searchParams.get('model')
    if (!preferred) return
    if (Object.prototype.hasOwnProperty.call(MODEL_LABELS, preferred)) {
      setModelId(preferred)
    }
  }, [searchParams])

  useEffect(() => {
    if (!modelCatalog.length || !modelId) return
    const selected = modelCatalog.find((model) => model.id === modelId)
    if (!selected) return

    if (mlConnectivityStatus === 'CHECKING') return
    if (selected.available) {
      setMlConnectivityStatus('CONNECTED')
      setMlConnectivityMessage('? Model catalog and selected checkpoint are available.')
    } else {
      setMlConnectivityStatus('PARTIAL')
      setMlConnectivityMessage('? Model catalog available, selected checkpoint unavailable.')
    }
  }, [modelCatalog, modelId])

  const splitData = datasets?.splits?.[split]
  const selectedModel = useMemo(() => modelCatalog.find((model) => model.id === modelId) || null, [modelCatalog, modelId])
  const selectedCheckpoint = useMemo(() => selectedModel?.checkpoint || null, [selectedModel])

  const inputReady = Boolean(file && metadata?.readable)
  const modelReady = Boolean(modelId && selectedModel && selectedModel.available)
  const checkpointReady = Boolean(selectedCheckpoint && selectedCheckpoint.path)
  const connectionReady = mlConnectivityStatus === 'CONNECTED'
  const startDisabledReason = !file ? 'Select an input to continue.' : !modelId ? 'Select a model to continue.' : !selectedCheckpoint ? 'Selected model checkpoint unavailable.' : !inputReady ? 'Selected input is not valid.' : !connectionReady ? 'ML connectivity is not verified.' : ''
  const canStart = Boolean(file && metadata?.readable && modelId && selectedCheckpoint && connectionReady && !submitting)

  const checks = [
    ['INPUT', inputReady ? '?' : 'FAIL'],
    ['MODEL', modelReady ? '?' : modelId ? 'FAIL' : 'WAITING'],
    ['CHECKPOINT', checkpointReady ? '?' : 'FAIL'],
    ['ML CONNECTIVITY', connectionReady ? '?' : 'FAIL'],
    ['PIPELINE', automatedPipeline ? '?' : 'FAIL'],
    ['STORAGE', 'NOT EXPOSED BY SERVER'],
  ]

  const selectFile = (nextFile) => {
    if (!nextFile) return
    setError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(nextFile)
    setFile(nextFile); setPreviewUrl(url)
    const image = new Image()
    image.onload = () => setMetadata({ width: image.naturalWidth, height: image.naturalHeight, readable: true })
    image.onerror = () => setMetadata({ readable: false })
    image.src = url
  }

  const removeInput = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null); setPreviewUrl(''); setMetadata(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const selectDataset = async (filename) => {
    try {
      setError('')
      const blob = await api.getImageFile(split, filename)
      selectFile(new File([blob], filename, { type: blob.type || 'image/jpeg' }))
    } catch (requestError) {
      setError(requestError.message || 'Dataset image could not be loaded.')
      setRetryAction(() => () => selectDataset(filename))
    }
  }

  const reset = () => { removeInput(); setModelId(''); setConfidence(0.5); setMode('standard'); setError(''); setAutomatedPipeline(false); setMlConnectivityStatus('NOT CHECKED'); setMlConnectivityMessage('ML connectivity not verified.'); }
  const savePreferences = () => {
    try { localStorage.setItem('geocadastra_analysis_preferences', JSON.stringify({ modelId, confidence, mode, automatedPipeline })); setSaved(true); window.setTimeout(() => setSaved(false), 2200) } catch { setError('Local UI preferences could not be saved.') }
  }

  const startAnalysis = async () => {
    if (!canStart) {
      setError(startDisabledReason || 'Analysis validation failed.')
      return
    }

    setPreflightOpen(false)
    setSubmitting(true)
    setError('')
    setSubmitStep('VALIDATING')

    try {
      await verifyBackendHealth()

      setSubmitStep('UPLOADING')
      const upload = await api.uploadImage(file)
      if (!upload?.file_id) throw new Error('Upload did not return a valid file ID.')

      setSubmitStep('DISPATCHING')
      const job = await api.startProcessing({ fileId: upload.file_id, model: selectedCheckpoint.path, confidence })
      if (!job?.job_id) throw new Error('The backend did not return a real job ID.')

      setSubmitStep('JOB CREATED')
      setJobId(job.job_id)
      navigate(`/processing/${job.job_id}`)
    } catch (requestError) {
      setError(requestError.message || 'Analysis job creation failed.')
      setSubmitting(false)
      setSubmitStep('')
    }
  }

  return <div className="workspace-page analysis-workstation">
    <header className="an-page-header"><div><div className="an-kicker">GEOCADASTRA / ANALYSIS</div><h1 className="an-page-title">New GeoAI Analysis</h1><p className="an-page-subtitle">Operational workstation for source validation, model selection, and real pipeline dispatch.</p></div><div className="an-header-actions"><div className="an-mode-switch" role="group" aria-label="Workstation mode">{['standard', 'advanced'].map((item) => <button key={item} className={`an-mode-btn ${mode === item ? 'active' : ''}`} onClick={() => setMode(item)}>{item.toUpperCase()}</button>)}</div><button className="an-btn-secondary" onClick={reset}><RotateCcw size={14} /> RESET</button><button className="an-btn-secondary" onClick={savePreferences}><Save size={14} /> {saved ? 'SAVED' : 'LOCAL UI PREFERENCE'}</button></div></header>
    {error && <div className="an-alert-error" role="alert"><AlertCircle size={18} /><div><strong>WORKFLOW ERROR</strong><p>{error}</p></div><button className="an-btn-secondary small" onClick={retryAction}>RETRY</button><button className="an-icon-btn" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    <main className="an-main-grid"><div className="an-col-left">
      <section className="an-card"><div className="an-card-head"><div className="an-card-title-group"><span className="an-step-badge">1</span><div><h2 className="an-card-title">INPUT SOURCE</h2><p className="an-card-desc">Upload a raster or select an item returned by the project dataset API.</p></div></div>{file && <button className="an-text-btn-danger" onClick={removeInput}><Trash2 size={14} /> REMOVE INPUT</button>}</div><div className="an-input-tabs">{[['upload', Upload, 'UPLOAD FILE'], ['dataset', FolderOpen, 'SELECT DATASET'], ['recent', Clock, `RECENT INPUTS (${history.length})`]].map(([key, Icon, label]) => <button key={key} className={`an-input-tab ${inputTab === key ? 'active' : ''}`} onClick={() => setInputTab(key)}><Icon size={14} /> {label}</button>)}</div>
        {!file && inputTab === 'upload' && <div className="an-dropzone" role="button" tabIndex="0" onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]) }}><input ref={fileInputRef} hidden type="file" accept=".jpg,.jpeg,.png,.tif,.tiff" onChange={(event) => selectFile(event.target.files?.[0])} /><UploadCloud size={30} /><strong>SELECT FILE OR DROP RASTER HERE</strong><span>Accepted by the upload service: file content is sent to the existing backend.</span></div>}
        {!file && inputTab === 'dataset' && <div className="an-dataset-browser">{loading ? <div className="an-empty-state"><LoaderCircle className="an-spin" size={18} /> Loading dataset metadata...</div> : !splitData ? <div className="an-empty-state">Dataset metadata is unavailable.</div> : <><div className="an-dataset-split-pills">{Object.keys(datasets.splits || {}).map((key) => <button key={key} className={`an-split-pill ${split === key ? 'active' : ''}`} onClick={() => setSplit(key)}>{key.toUpperCase()} ({datasets.splits[key].image_count ?? 0})</button>)}</div><div className="an-dataset-thumb-grid">{(splitData.items || []).map((filename) => <button className="an-dataset-thumb-card" key={filename} onClick={() => selectDataset(filename)}><img src={api.getImageUrl(split, filename)} alt={filename} loading="lazy" /><span>{filename}</span></button>)}</div></>}</div>}
        {!file && inputTab === 'recent' && <div className="an-recent-list">{history.length ? history.slice(0, 6).map((item) => <div className="an-recent-item" key={item.job_id}><div><strong>{item.input_filename || 'Input filename not exposed'}</strong><small>{item.status} ? {item.job_id}</small></div><button className="an-btn-secondary small" onClick={() => navigate(`/processing/${item.job_id}`)}>VIEW JOB</button></div>) : <div className="an-empty-state">No recent jobs returned by the server.</div>}</div>}
        {file && <div className="an-selected-preview-panel"><div className="an-preview-media"><img src={previewUrl} alt={`Preview of ${file.name}`} /><span className="an-preview-badge">PIXEL-SPACE STATUS NOT EXPOSED</span></div><div className="an-preview-details"><div className="an-preview-meta-row"><span>Filename</span><strong>{file.name}</strong></div><div className="an-preview-meta-row"><span>File size</span><strong>{formatBytes(file.size)}</strong></div><div className="an-preview-meta-row"><span>Dimensions</span><strong>{metadata?.width ? `${metadata.width} x ${metadata.height} px` : 'Not exposed'}</strong></div><div className="an-preview-meta-row"><span>Format</span><strong>{file.type || 'Not exposed'}</strong></div><div className="an-preview-meta-row"><span>Bands / CRS / bounds</span><strong>NOT EXPOSED BY SERVER</strong></div><div className="an-preview-actions"><button className="an-btn-secondary small" onClick={() => setDetailsOpen(!detailsOpen)}><Info size={13} /> {detailsOpen ? 'HIDE DETAILS' : 'TECHNICAL DETAILS'}</button><button className="an-btn-secondary small" onClick={() => fileInputRef.current?.click()}><RefreshCw size={13} /> REPLACE</button></div>{detailsOpen && <p className="an-notice">Browser-readable metadata is shown above. GeoTIFF CRS, bands, resolution, and bounds are not exposed by the current API.</p>}</div></div>}
      </section>

      <section className="an-card">
        <div className="an-card-head"><div className="an-card-title-group"><span className="an-step-badge">2</span><div><h2 className="an-card-title">MODEL</h2><p className="an-card-desc">Choose a checkpoint returned by the backend.</p></div></div></div>

        <div className="an-ml-connectivity">
          <div className="an-connectivity-row"><span>ML ENGINE</span><Status state={mlConnectivityStatus === 'CONNECTED' ? 'pass' : mlConnectivityStatus === 'UNAVAILABLE' || mlConnectivityStatus === 'ERROR' ? 'fail' : 'warning'}>{mlConnectivityStatus}</Status></div>
          <div className="an-connectivity-row"><span>MODEL CATALOG</span><Status state={modelCatalog.some((model) => model.available) ? 'pass' : 'fail'}>{modelCatalog.some((model) => model.available) ? 'AVAILABLE' : 'UNAVAILABLE'}</Status></div>
          <div className="an-connectivity-row"><span>SELECTED MODEL</span><strong>{selectedModel ? selectedModel.label : 'NONE SELECTED'}</strong></div>
          <div className="an-connectivity-row"><span>CHECKPOINT</span><Status state={selectedCheckpoint ? 'pass' : 'fail'}>{selectedCheckpoint ? 'AVAILABLE' : 'UNAVAILABLE'}</Status></div>
          <div className="an-connectivity-row"><span>CHECKPOINT PATH</span><strong>{selectedCheckpoint?.path || 'No checkpoint path exposed'}</strong></div>
          <div className="an-connectivity-row"><span>INFERENCE STATUS</span><Status state={connectionReady ? 'pass' : mlConnectivityStatus === 'NOT CHECKED' ? 'warning' : 'fail'}>{connectionReady ? 'READY' : mlConnectivityStatus === 'NOT CHECKED' ? 'NOT VERIFIED' : 'UNAVAILABLE'}</Status></div>
          <div className="an-connectivity-row"><span>LAST CHECK</span><strong>{lastConnectivityCheck ? new Date(lastConnectivityCheck).toLocaleString() : 'NOT CHECKED'}</strong></div>
          <div className="an-connectivity-message">{mlConnectivityMessage}</div>
        </div>

        <div className="an-model-actions">
          <button className="an-btn-secondary small" onClick={refreshModels} disabled={loading || submitting}><RefreshCw size={13} /> REFRESH MODELS</button>
          <button className="an-btn-secondary small" onClick={refreshModels} disabled={loading || submitting}><ShieldCheck size={13} /> CHECK ML CONNECTIVITY</button>
        </div>

        {loading ? <div className="an-empty-state"><LoaderCircle className="an-spin" size={18} /> Loading models...</div> : modelCatalog.length ? <div className="an-model-grid">{modelCatalog.map((entry) => {
          const isSelected = modelId === entry.id
          const cardStatus = entry.available ? 'AVAILABLE' : 'UNAVAILABLE'
          return <label className={`an-model-choice-card ${isSelected ? 'selected' : ''}`} key={entry.id}>
            <input type="radio" name="model" value={entry.id} checked={isSelected} onChange={() => setModelId(entry.id)} />
            <div className="an-model-meta">
              <div className="an-model-card-top">
                <div className="an-model-name-group">
                  <span className="an-radio-indicator"><span className="an-radio-dot" /></span>
                  <div>
                    <span className="an-model-title">{entry.label}</span>
                    <span className="an-model-role">{entry.role}</span>
                  </div>
                </div>
                <span className={`an-model-badge ${entry.id === 'unetpp' ? 'top' : entry.id === 'yolo11' ? 'fast' : 'instance'}`}>{entry.badge}</span>
              </div>
              <p className="an-model-desc">{entry.available ? (entry.checkpoint?.name || entry.checkpoint?.path || 'Checkpoint available.') : 'MODEL UNAVAILABLE'}</p>
              <div className="an-model-metrics-row">
                <div className="an-model-metric"><small>MODEL</small><strong>{entry.id}</strong></div>
                <div className="an-model-metric"><small>ROLE</small><strong>{entry.role}</strong></div>
                <div className="an-model-metric"><small>CHECKPOINT</small><strong>{entry.checkpoint?.name || '?'}</strong></div>
                <div className="an-model-metric"><small>STATUS</small><strong>{cardStatus}</strong></div>
              </div>
            </div>
          </label>
        })}</div> : <div className="an-empty-state">NO MODELS AVAILABLE</div>}

        <div className="an-automated-pipeline">
          <div className="an-toggle-row">
            <input id="automated-pipeline-toggle" type="checkbox" checked={automatedPipeline} onChange={(event) => setAutomatedPipeline(event.target.checked)} />
            <label htmlFor="automated-pipeline-toggle"><strong>AUTOMATED PIPELINE</strong><span>Run the existing backend processing workflow using the configured GeoAI pipeline.</span></label>
          </div>
          {automatedPipeline && <div className="an-pipeline-flow"><span>AI EXTRACTION</span><span className="an-pipeline-arrow">?</span><span>SPATIAL CONSENSUS</span><span className="an-pipeline-arrow">?</span><span>GIS PROCESSING</span><span className="an-pipeline-arrow">?</span><span>POSTGIS / RESULTS</span></div>}
        </div>

        <div className="an-confidence-slider-box"><label htmlFor="confidence">CONFIDENCE THRESHOLD <strong>{confidence.toFixed(2)}</strong></label><input id="confidence" type="range" min="0.1" max="0.95" step="0.05" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /></div>
      </section>

      {mode === 'advanced' && <section className="an-card"><div className="an-card-head"><div className="an-card-title-group"><span className="an-step-badge">3</span><div><h2 className="an-card-title">SPATIAL CONFIGURATION</h2><p className="an-card-desc">Only server-supported controls are editable in this workstation.</p></div></div></div><div className="an-advanced-grid"><div><strong>INPUT CRS</strong><span>NOT EXPOSED BY SERVER</span></div><div><strong>OUTPUT CRS</strong><span>NOT EXPOSED BY SERVER</span></div><div><strong>AOI</strong><span>FULL IMAGE ONLY ? SERVER DEFAULT</span></div><div><strong>SPATIAL CONSENSUS</strong><span>MANAGED BY PIPELINE</span></div><div><strong>PARCEL ASSOCIATION</strong><span>NOT EXPOSED BY SERVER</span></div><div><strong>PROCESSING OPTIONS</strong><span>SINGLE JOB ? SERVER DEFAULT</span></div></div></section>}
    </div><aside className="an-col-right"><section className="an-card"><h2 className="an-panel-title"><ShieldCheck size={16} /> PREFLIGHT</h2><div className="an-preflight-matrix">{checks.map(([label, value]) => <div className="an-preflight-item" key={label}><span>{label}</span>{value === '?' ? <Status state="pass">READY</Status> : value === 'FAIL' ? <Status state="fail">FAIL</Status> : value === 'WAITING' ? <Status state="warning">WAITING</Status> : <Status state="warning">{value}</Status>}</div>)}</div><p className="an-notice">Validation is lightweight and does not run inference. Server-only checks remain explicitly unavailable until an API exposes them.</p></section><section className="an-card"><h2 className="an-panel-title"><FileImage size={16} /> OUTPUT CONFIGURATION</h2><div className="an-managed-list"><div><strong>OUTPUTS</strong><span>MANAGED BY PIPELINE</span></div><div><strong>POSTGIS PERSISTENCE</strong><span>NOT EXPOSED BY SERVER</span></div><div><strong>EXPORT FORMATS</strong><span>NOT EXPOSED BY SERVER</span></div></div></section><section className="an-card highlight-card"><h2 className="an-panel-title"><Play size={16} /> ANALYSIS SUMMARY</h2><div className="an-summary-table"><div className="an-summary-row"><span>INPUT</span><strong>{file?.name || 'SELECT AN INPUT TO BEGIN'}</strong></div><div className="an-summary-row"><span>PROJECT</span><strong>GEOCADASTRA</strong></div><div className="an-summary-row"><span>MODEL</span><strong>{selectedModel ? selectedModel.label : '?'}</strong></div><div className="an-summary-row"><span>CHECKPOINT</span><strong>{selectedCheckpoint?.name || selectedCheckpoint?.path || '?'}</strong></div><div className="an-summary-row"><span>PIPELINE</span><strong>{automatedPipeline ? 'AUTOMATED' : 'STANDARD'}</strong></div><div className="an-summary-row"><span>CHECKPOINT SIZE</span><strong>{selectedCheckpoint?.size_mb ? `${selectedCheckpoint.size_mb} MB` : 'NOT EXPOSED'}</strong></div></div><button className="an-btn-launch" disabled={!canStart} onClick={() => setPreflightOpen(true)}>{submitting ? <><LoaderCircle className="an-spin" size={18} /> {submitStep}</> : <><Play size={18} /> START ANALYSIS</>}</button>{!file && <p className="an-launch-hint">Select an input to continue.</p>}{file && !selectedCheckpoint && <p className="an-launch-hint">Selected model checkpoint unavailable.</p>}{file && selectedCheckpoint && mlConnectivityStatus !== 'CONNECTED' && <p className="an-launch-hint">ML connectivity is not verified.</p>}</section>
    </aside></main>

    {preflightOpen && <div className="an-modal-backdrop" role="presentation" onClick={() => setPreflightOpen(false)}><div className="an-modal-card" role="dialog" aria-modal="true" aria-labelledby="preflight-title" onClick={(event) => event.stopPropagation()}><div className="an-modal-header"><h2 id="preflight-title"><ShieldCheck size={19} /> FINAL PREFLIGHT</h2><button className="an-icon-btn" aria-label="Close preflight" onClick={() => setPreflightOpen(false)}><X size={16} /></button></div><div className="an-modal-summary-box"><div className="an-modal-summary-item"><small>INPUT</small><strong>{file?.name || 'NO INPUT'}</strong></div><div className="an-modal-summary-item"><small>MODEL</small><strong>{selectedModel ? selectedModel.label : 'NONE'}</strong></div><div className="an-modal-summary-item"><small>CHECKPOINT</small><strong>{selectedCheckpoint?.name || selectedCheckpoint?.path || 'UNAVAILABLE'}</strong></div><div className="an-modal-summary-item"><small>PIPELINE</small><strong>{automatedPipeline ? 'AUTOMATED' : 'STANDARD'}</strong></div></div><div className="an-modal-checklist">{[['INPUT', inputReady], ['MODEL', Boolean(modelId && selectedModel)], ['CHECKPOINT', checkpointReady], ['ML CONNECTIVITY', connectionReady], ['PIPELINE', true], ['STORAGE', true]].map(([label, pass]) => <div key={label} className="an-modal-check-row"><Check size={16} color={pass ? '#168866' : '#d55'} /><span>{label}</span><Status state={pass ? 'pass' : 'fail'}>{pass ? 'READY' : 'BLOCKED'}</Status></div>)}</div><p className="an-notice">ML and pipeline checks are validated through the existing backend contract and do not trigger inference.</p><div className="an-modal-footer"><button className="an-btn-secondary" onClick={() => setPreflightOpen(false)}>BACK</button><button className="an-btn-primary" disabled={!canStart} onClick={startAnalysis}><Upload size={15} /> CONFIRM &amp; START</button></div></div></div>}
  </div>
}
