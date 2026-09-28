import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  BrainCircuit,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Cpu,
  HardDrive,
  Info,
  LayoutGrid,
  Layers,
  List,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react'
import { api } from '../services/api'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import './ModelsPage.css'

const MODEL_IDS = ['unetpp', 'yolo11', 'maskrcnn']

const MODEL_LABELS = {
  unetpp: 'U-Net++',
  yolo11: 'YOLO11-Seg',
  maskrcnn: 'Mask R-CNN',
}

const MODEL_ROLES = {
  unetpp: 'High-precision segmentation for complex building footprints and dense urban structure.',
  yolo11: 'Fast instance segmentation optimized for aerial detection and footprint extraction.',
  maskrcnn: 'Instance-aware building segmentation for detailed geometric extraction and parcel relation analysis.',
}

const MODEL_PRIMARY_ROLES = {
  unetpp: 'FOOTPRINT REFINEMENT',
  yolo11: 'RAPID SCREENING',
  maskrcnn: 'INSTANCE BENCHMARK',
}

const MODEL_ARCHITECTURES = {
  unetpp: {
    name: 'Nested Dense Skip-Path Architecture',
    backbone: 'ResNet34 / VGG encoder with dense skip pathways',
    type: 'Semantic Pixel Segmentation',
    loss: 'Binary Cross-Entropy + Dice Loss',
    inputSize: '512×512 sliding window',
  },
  yolo11: {
    name: 'Single-Stage Anchor-Free Instance Segmentation',
    backbone: 'Modified CSPDarknet with C3k2 and SPPF blocks',
    type: 'Real-time Instance Segmentation',
    loss: 'CIoU + DFL + Box / Mask Loss',
    inputSize: '640×640 native aerial tiles',
  },
  maskrcnn: {
    name: 'Two-Stage Region-Based Convolutional Network',
    backbone: 'ResNet-50 with Feature Pyramid Network (FPN)',
    type: 'Region Proposal + Mask RoIAlign',
    loss: 'Multi-task Classification, Box, Mask Loss',
    inputSize: 'Variable aerial patches (FPN)',
  },
}

const MODEL_MATCHERS = {
  unetpp: /unet|u_net/i,
  yolo11: /yolo/i,
  maskrcnn: /mask.?rcnn/i,
}

const METRIC_TOOLTIPS = {
  iou: 'Intersection over Union (IoU): Overlap ratio between predicted building pixels and ground truth annotations.',
  dice: 'Dice Similarity Coefficient: Harmonic mean of precision and recall for pixel-level building overlap.',
  precision: 'Precision: Proportion of predicted building pixels that genuinely match ground truth.',
  recall: 'Recall: Proportion of all actual building pixels successfully captured by the model.',
  f1: 'F1 Score: Balanced metric measuring precision and recall trade-off on aerial footprints.',
  latency: 'Inference Latency: Measured elapsed execution time per image during Tile 8 evaluation.',
  parameters: 'Total Trainable Parameters: Model weight count reflecting computational capacity and memory footprint.',
  checkpoint: 'Checkpoint Size: Serialized model weights stored on disk for live pipeline inference.',
}

function MetricTooltip({ label, tooltipKey }) {
  const [show, setShow] = useState(false)
  const tip = METRIC_TOOLTIPS[tooltipKey] || ''

  return (
    <span
      className="tooltip-container"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
      role="tooltip"
      aria-label={tip}
    >
      <span className="metric-label-with-tip">
        {label}
        <Info size={11} style={{ opacity: 0.7 }} />
      </span>
      {show && tip && <span className="tooltip-box">{tip}</span>}
    </span>
  )
}

export default function ModelsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [benchmark, setBenchmark] = useState(null)
  const [checkpoints, setCheckpoints] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('default')
  const [viewMode, setViewMode] = useState('grid')
  const [selectedId, setSelectedId] = useState('unetpp')
  const [detailOpen, setDetailOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [comparedModelIds, setComparedModelIds] = useState(['unetpp', 'yolo11', 'maskrcnn'])
  const [favoriteModel, setFavoriteModel] = useState(() => {
    try {
      return localStorage.getItem('geocadastra_favorite_model') || ''
    } catch {
      return ''
    }
  })
  const [toastMessage, setToastMessage] = useState('')

  const showToast = useCallback((msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [benchmarkData, checkpointData] = await Promise.all([
        api.getBenchmarkMetrics().catch(() => null),
        api.getModelCheckpoints().catch(() => ({ checkpoints: [] })),
      ])

      const nextCheckpoints = Array.isArray(checkpointData?.checkpoints) ? checkpointData.checkpoints : []
      setCheckpoints(nextCheckpoints)
      setBenchmark(benchmarkData || null)

      const preferred = searchParams.get('model')
      if (preferred && MODEL_MATCHERS[preferred]) {
        setSelectedId(preferred)
      } else {
        const firstMatch = MODEL_IDS.find((id) =>
          nextCheckpoints.some((item) => MODEL_MATCHERS[id].test(`${item.model || ''} ${item.name || ''} ${item.path || ''}`))
        )
        if (firstMatch) setSelectedId(firstMatch)
      }
    } catch (requestError) {
      setError(requestError?.message || 'Model metadata could not be loaded from the backend.')
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (detailOpen) setDetailOpen(false)
        if (compareOpen) setCompareOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detailOpen, compareOpen])

  const toggleFavorite = (id) => {
    const next = favoriteModel === id ? '' : id
    setFavoriteModel(next)
    try {
      localStorage.setItem('geocadastra_favorite_model', next)
    } catch {
      // storage unavailable
    }
    showToast(next ? `Marked ${MODEL_LABELS[id]} as favorite` : 'Favorite removed')
  }

  const copyToClipboard = (text, label) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${label} to clipboard`)
      })
    }
  }

  const models = useMemo(() => {
    const benchmarkModels = benchmark?.models || {}
    const checkpointMap = new Map()

    for (const checkpoint of checkpoints) {
      const label = `${checkpoint.model || ''} ${checkpoint.name || ''} ${checkpoint.path || ''}`.toLowerCase()
      for (const key of MODEL_IDS) {
        if (checkpoint.model_id === key || MODEL_MATCHERS[key].test(label)) {
          checkpointMap.set(key, checkpoint)
          break
        }
      }
    }

    return MODEL_IDS.map((key) => {
      const checkpoint = checkpointMap.get(key)
      const metrics = benchmarkModels[MODEL_LABELS[key]] || benchmarkModels[key] || benchmarkModels[`${key}_metrics`] || {}
      const sizeBytes = checkpoint?.size_bytes != null ? Number(checkpoint.size_bytes) : checkpoint?.size_mb != null ? Number(checkpoint.size_mb) * 1024 * 1024 : NaN
      const sizeMb = Number.isFinite(sizeBytes)
        ? (sizeBytes / (1024 * 1024)).toFixed(2)
        : checkpoint?.size_mb
        ? Number(checkpoint.size_mb).toFixed(2)
        : 'Not exposed'

      const rawIou = metrics.iou != null ? Number(metrics.iou) : null
      const rawDice = metrics.dice != null ? Number(metrics.dice) : null
      const rawPrecision = metrics.precision != null ? Number(metrics.precision) : null
      const rawRecall = metrics.recall != null ? Number(metrics.recall) : null
      const rawF1 = metrics.f1 != null ? Number(metrics.f1) : null
      const rawLatency = metrics.latency_sec != null ? Number(metrics.latency_sec) : metrics.latency != null ? Number(metrics.latency) : null
      const rawParameters = metrics.parameters != null ? Number(metrics.parameters) : null
      const rawSize = Number.isFinite(sizeBytes) ? sizeBytes / (1024 * 1024) : checkpoint?.size_mb != null ? Number(checkpoint.size_mb) : null

      return {
        id: key,
        label: MODEL_LABELS[key],
        status: checkpoint ? 'AVAILABLE' : 'UNAVAILABLE',
        role: MODEL_ROLES[key],
        primaryRole: MODEL_PRIMARY_ROLES[key],
        architecture: MODEL_ARCHITECTURES[key],
        checkpointName: checkpoint?.name || checkpoint?.path || 'Not exposed by server',
        checkpointPath: checkpoint?.path || 'Not exposed by server',
        sizeMb,
        numericSize: rawSize,
        precision: rawPrecision !== null ? rawPrecision.toFixed(4) : 'Not exposed',
        recall: rawRecall !== null ? rawRecall.toFixed(4) : 'Not exposed',
        iou: rawIou !== null ? rawIou.toFixed(4) : 'Not exposed',
        dice: rawDice !== null ? rawDice.toFixed(4) : 'Not exposed',
        f1: rawF1 !== null ? rawF1.toFixed(4) : 'Not exposed',
        latency: rawLatency !== null ? `${rawLatency.toFixed(3)}s` : 'Not exposed',
        latencySec: rawLatency,
        parameters: rawParameters !== null ? rawParameters.toLocaleString() : 'Not exposed',
        parametersCount: rawParameters,
        parametersDisplay: rawParameters !== null ? `${(rawParameters / 1e6).toFixed(2)}M` : 'Not exposed',
        predictedBuildings: metrics.pred_buildings != null ? Number(metrics.pred_buildings).toLocaleString() : 'Not exposed',
        tp: metrics.tp != null ? Number(metrics.tp).toLocaleString() : 'Not exposed',
        fp: metrics.fp != null ? Number(metrics.fp).toLocaleString() : 'Not exposed',
        fn: metrics.fn != null ? Number(metrics.fn).toLocaleString() : 'Not exposed',
        rawMetrics: {
          iou: rawIou,
          dice: rawDice,
          precision: rawPrecision,
          recall: rawRecall,
          f1: rawF1,
          latency: rawLatency,
          parameters: rawParameters,
          sizeMb: rawSize,
        },
      }
    })
  }, [benchmark, checkpoints])

  const summaryStats = useMemo(() => {
    const availableCount = models.filter((m) => m.status === 'AVAILABLE').length
    const totalCount = models.length

    let bestIou = 0
    let bestIouModel = ''
    let bestDice = 0
    let bestDiceModel = ''
    let fastestLatency = Infinity
    let fastestModel = ''

    for (const m of models) {
      if (m.rawMetrics.iou != null && m.rawMetrics.iou > bestIou) {
        bestIou = m.rawMetrics.iou
        bestIouModel = m.label
      }
      if (m.rawMetrics.dice != null && m.rawMetrics.dice > bestDice) {
        bestDice = m.rawMetrics.dice
        bestDiceModel = m.label
      }
      if (m.rawMetrics.latency != null && m.rawMetrics.latency < fastestLatency) {
        fastestLatency = m.rawMetrics.latency
        fastestModel = m.label
      }
    }

    return {
      availableCount,
      totalCount,
      bestIou: bestIou > 0 ? bestIou.toFixed(4) : '—',
      bestIouModel,
      bestDice: bestDice > 0 ? bestDice.toFixed(4) : '—',
      bestDiceModel,
      fastestLatency: fastestLatency !== Infinity ? `${fastestLatency.toFixed(3)}s` : '—',
      fastestModel,
    }
  }, [models])

  const filteredModels = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    let list = models.filter((model) => {
      const matchesSearch =
        !term ||
        [
          model.label,
          model.id,
          model.checkpointName,
          model.role,
          model.primaryRole,
          model.architecture.name,
          model.status,
        ]
          .join(' ')
          .toLowerCase()
          .includes(term)
      const matchesStatus = statusFilter === 'ALL' || model.status === statusFilter
      return matchesSearch && matchesStatus
    })

    if (sortBy === 'iou') {
      list = [...list].sort((a, b) => (b.rawMetrics.iou ?? 0) - (a.rawMetrics.iou ?? 0))
    } else if (sortBy === 'dice') {
      list = [...list].sort((a, b) => (b.rawMetrics.dice ?? 0) - (a.rawMetrics.dice ?? 0))
    } else if (sortBy === 'precision') {
      list = [...list].sort((a, b) => (b.rawMetrics.precision ?? 0) - (a.rawMetrics.precision ?? 0))
    } else if (sortBy === 'recall') {
      list = [...list].sort((a, b) => (b.rawMetrics.recall ?? 0) - (a.rawMetrics.recall ?? 0))
    } else if (sortBy === 'latency') {
      list = [...list].sort((a, b) => (a.rawMetrics.latency ?? 999) - (b.rawMetrics.latency ?? 999))
    } else if (sortBy === 'size') {
      list = [...list].sort((a, b) => (a.numericSize ?? 999) - (b.numericSize ?? 999))
    } else if (sortBy === 'parameters') {
      list = [...list].sort((a, b) => (b.parametersCount ?? 0) - (a.parametersCount ?? 0))
    }

    return list
  }, [models, searchTerm, statusFilter, sortBy])

  const selectedModel = useMemo(() => {
    return models.find((m) => m.id === selectedId) || models[0] || null
  }, [models, selectedId])

  const handleUseInAnalysis = (modelId) => {
    setSelectedId(modelId)
    navigate(`/analysis?model=${modelId}`)
  }

  const toggleComparisonModel = (modelId) => {
    setComparedModelIds((prev) => {
      if (prev.includes(modelId)) {
        if (prev.length <= 2) {
          showToast('Comparison requires at least 2 models.')
          return prev
        }
        return prev.filter((id) => id !== modelId)
      } else {
        if (prev.length >= 3) {
          showToast('Comparison allows up to 3 models simultaneously.')
          return prev
        }
        return [...prev, modelId]
      }
    })
  }

  const comparedModels = useMemo(() => {
    return models.filter((m) => comparedModelIds.includes(m.id))
  }, [models, comparedModelIds])

  const getBestComparisonValue = (metricKey, lowerIsBetter = false) => {
    const valid = comparedModels
      .map((m) => m.rawMetrics[metricKey])
      .filter((v) => v != null && !isNaN(v))
    if (!valid.length) return null
    return lowerIsBetter ? Math.min(...valid) : Math.max(...valid)
  }

  if (loading) {
    return (
      <div className="models-workspace">
        <PageHeader
          eyebrow="AI BENCHMARK & MODEL REGISTRY"
          title="AI Model Intelligence Center"
          subtitle="Loading verified model metadata, segmentation performance, and runtime characteristics..."
        />
        <div className="models-summary-strip">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="summary-card" style={{ opacity: 0.6 }}>
              <div className="summary-card-label">LOADING METRIC…</div>
              <div className="summary-card-value" style={{ fontSize: 20 }}>—</div>
            </div>
          ))}
        </div>
        <div className="models-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="model-card" style={{ height: 440, opacity: 0.6, background: '#FFFFFF' }}>
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ height: 24, width: '60%', background: '#F1F5F9', borderRadius: 6 }} />
                <div style={{ height: 16, width: '40%', background: '#F1F5F9', borderRadius: 4 }} />
                <div style={{ height: 60, width: '100%', background: '#F8FAFC', borderRadius: 8 }} />
                <div style={{ height: 120, width: '100%', background: '#F8FAFC', borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="models-workspace">
        <PageHeader
          eyebrow="AI BENCHMARK & MODEL REGISTRY"
          title="AI Model Intelligence Center"
          subtitle="Compare verified model metadata, segmentation performance, runtime characteristics and analysis readiness."
        />
        <EmptyState
          icon={ShieldAlert}
          title="UNABLE TO LOAD MODEL REGISTRY"
          description={error}
          actionLabel="Retry"
          onAction={loadData}
          actionIcon={RefreshCw}
        />
      </div>
    )
  }

  return (
    <div className="models-workspace">
      {/* ── Top Header ── */}
      <PageHeader
        eyebrow="AI BENCHMARK & MODEL REGISTRY"
        title="AI Model Intelligence Center"
        subtitle="Compare verified model metadata, segmentation performance, runtime characteristics and analysis readiness."
        actions={
          <>
            <button
              className="btn-geo-primary"
              onClick={() => handleUseInAnalysis(selectedModel?.id || 'unetpp')}
              title={`Use ${selectedModel?.label || 'selected model'} in analysis`}
            >
              <BrainCircuit size={16} /> + Use in Analysis
            </button>
            <button
              className="btn-geo-secondary"
              onClick={() => setCompareOpen((prev) => !prev)}
              title="Open benchmark comparison lab"
            >
              <BarChart3 size={16} /> {compareOpen ? 'Hide Comparison' : 'Compare Models'}
            </button>
            <button
              className="btn-geo-ghost"
              onClick={loadData}
              title="Refresh live model registry"
              aria-label="Refresh live model registry"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </>
        }
      />

      {/* ── Top Context Summary Strip ── */}
      <div className="models-context-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="models-context-badge">
            <Sparkles size={12} /> Tile 8 Prototype Benchmark
          </span>
          <span className="models-context-meta">
            <strong>{summaryStats.totalCount} verified architectures</strong>
            <span className="models-context-divider">•</span>
            <span>{benchmark?.number_of_images || 9} held-out test images</span>
            <span className="models-context-divider">•</span>
            <span>2149×1479 resolution</span>
            <span className="models-context-divider">•</span>
            <span>Active consensus pipeline ready</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B7C8C' }}>
          <span>Selected for Analysis:</span>
          <strong style={{ color: '#00AFA3' }}>{selectedModel?.label}</strong>
        </div>
      </div>

      {/* ── Benchmark Summary Strip (Part 2) ── */}
      <div className="models-summary-strip">
        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Models Available</span>
            <Cpu size={18} className="summary-card-icon" />
          </div>
          <div className="summary-card-value">
            {summaryStats.availableCount.toString().padStart(2, '0')}
          </div>
          <div className="summary-card-sub">
            <span>{summaryStats.totalCount} total in catalog</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Best Pixel IoU</span>
            <Layers size={18} className="summary-card-icon" />
          </div>
          <div className="summary-card-value" style={{ color: '#00AFA3' }}>
            {summaryStats.bestIou}
          </div>
          <div className="summary-card-sub">
            <span>{summaryStats.bestIouModel}</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Best Pixel Dice</span>
            <CheckCircle2 size={18} className="summary-card-icon" />
          </div>
          <div className="summary-card-value" style={{ color: '#00AFA3' }}>
            {summaryStats.bestDice}
          </div>
          <div className="summary-card-sub">
            <span>{summaryStats.bestDiceModel}</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Fastest Latency</span>
            <Zap size={18} className="summary-card-icon" />
          </div>
          <div className="summary-card-value" style={{ color: '#4D72FF' }}>
            {summaryStats.fastestLatency}
          </div>
          <div className="summary-card-sub">
            <span>{summaryStats.fastestModel}</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-header">
            <span className="summary-card-label">Total Benchmarked</span>
            <Activity size={18} className="summary-card-icon" />
          </div>
          <div className="summary-card-value">
            {summaryStats.totalCount.toString().padStart(2, '0')}
          </div>
          <div className="summary-card-sub">
            <span>Verified evaluation</span>
          </div>
        </div>
      </div>

      {/* ── Filter & Search Toolbar (Part 3 & 4) ── */}
      <div className="models-toolbar">
        <div className="models-toolbar-left">
          <div className="models-search-wrapper">
            <Search size={15} className="models-search-icon" />
            <input
              type="text"
              className="models-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search model registry, architecture, role..."
              aria-label="Search model registry"
            />
            {searchTerm && (
              <button
                className="models-search-clear"
                onClick={() => setSearchTerm('')}
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="models-toolbar-right">
          {/* Segmented Status Filter */}
          <div className="models-segmented-control" role="group" aria-label="Status filter">
            {['ALL', 'AVAILABLE', 'UNAVAILABLE'].map((opt) => {
              const count =
                opt === 'ALL'
                  ? models.length
                  : models.filter((m) => m.status === opt).length
              return (
                <button
                  key={opt}
                  className={`models-segmented-btn ${statusFilter === opt ? 'active' : ''}`}
                  onClick={() => setStatusFilter(opt)}
                  aria-pressed={statusFilter === opt}
                >
                  <span>{opt}</span>
                  <span className="models-count-pill">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Sort Selector */}
          <div className="models-sort-wrapper">
            <ArrowUpDown size={14} />
            <span>Sort:</span>
            <select
              className="models-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort models by"
            >
              <option value="default">Benchmark (Default)</option>
              <option value="iou">IoU (High to Low)</option>
              <option value="dice">Dice (High to Low)</option>
              <option value="precision">Precision (High to Low)</option>
              <option value="recall">Recall (High to Low)</option>
              <option value="latency">Latency (Fastest First)</option>
              <option value="size">Size (Smallest First)</option>
              <option value="parameters">Parameters (Highest First)</option>
            </select>
          </div>

          {/* View Mode Toggle (Grid / List) */}
          <div className="models-view-switcher" role="group" aria-label="View mode">
            <button
              className={`models-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`models-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Empty State ── */}
      {filteredModels.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="NO MATCHING MODELS"
          description={`No models matched the search "${searchTerm}" with status "${statusFilter}".`}
          actionLabel="Clear Search & Filters"
          onAction={() => {
            setSearchTerm('')
            setStatusFilter('ALL')
          }}
          actionIcon={X}
        />
      ) : viewMode === 'grid' ? (
        /* ── Grid View: Model Cards (Parts 5–12) ── */
        <div className="models-grid">
          {filteredModels.map((model) => {
            const isSelected = selectedModel?.id === model.id
            const isFav = favoriteModel === model.id
            const accentClass =
              model.id === 'unetpp'
                ? 'model-accent-unetpp'
                : model.id === 'yolo11'
                ? 'model-accent-yolo11'
                : 'model-accent-maskrcnn'

            const fillClass =
              model.id === 'unetpp'
                ? 'fill-teal'
                : model.id === 'yolo11'
                ? 'fill-blue'
                : 'fill-violet'

            const qualityDescriptor =
              model.rawMetrics.iou != null
                ? model.rawMetrics.iou >= 0.45
                  ? 'High Accuracy'
                  : model.rawMetrics.iou >= 0.25
                  ? 'Moderate'
                  : 'Screening'
                : 'Verified'

            const speedDescriptor =
              model.rawMetrics.latency != null
                ? model.rawMetrics.latency < 1.0
                  ? 'Fast (<1s)'
                  : model.rawMetrics.latency < 2.0
                  ? 'Standard (1s)'
                  : 'Heavy (15s)'
                : 'Standard'

            const sizeDescriptor =
              model.numericSize != null
                ? model.numericSize < 10
                  ? 'Ultra-light'
                  : model.numericSize < 70
                  ? 'Compact'
                  : 'Heavyweight'
                : 'Standard'

            return (
              <div
                key={model.id}
                className={`model-card ${isSelected ? 'selected' : ''}`}
                tabIndex={0}
                aria-label={`${model.label} model card`}
              >
                {/* Accent stripe */}
                <div className={`model-accent-stripe ${accentClass}`} />

                <div className="model-card-body">
                  {/* Header Area */}
                  <div className="model-card-top">
                    <div className="model-title-group">
                      <div className="model-card-id">
                        <Cpu size={12} /> {model.id}
                        {isFav && <Star size={12} fill="#D99A00" color="#D99A00" title="Favorite Model" />}
                      </div>
                      <h3 className="model-card-title">{model.label}</h3>
                    </div>

                    <div className="model-card-badges">
                      <span
                        className={
                          model.status === 'AVAILABLE'
                            ? 'status-badge-avail'
                            : 'status-badge-unavail'
                        }
                      >
                        {model.status === 'AVAILABLE' ? (
                          <CheckCircle2 size={12} />
                        ) : (
                          <ShieldAlert size={12} />
                        )}
                        {model.status}
                      </span>
                      <span className="role-pill">{model.primaryRole}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="model-card-desc">{model.role}</p>

                  {/* Checkpoint & Storage */}
                  <div className="model-checkpoint-strip">
                    <div className="model-checkpoint-name" title={model.checkpointPath}>
                      <HardDrive size={13} style={{ color: '#00AFA3', flexShrink: 0 }} />
                      <span>{model.checkpointName}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="model-checkpoint-size">
                        {model.sizeMb === 'Not exposed' ? model.sizeMb : `${model.sizeMb} MB`}
                      </span>
                      <button
                        className="btn-geo-icon"
                        style={{ width: 24, height: 24 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          copyToClipboard(model.checkpointPath, 'checkpoint path')
                        }}
                        title="Copy checkpoint path"
                        aria-label="Copy checkpoint path"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Key Metrics Section with Visual Bars (Part 7) */}
                  <div className="model-metrics-section">
                    <div className="metrics-section-title">
                      <span>Tile 8 Benchmark</span>
                      <span style={{ fontSize: 10, color: '#6B7C8C' }}>Pixel Agreement</span>
                    </div>

                    {/* IoU */}
                    <div className="metric-bar-item">
                      <div className="metric-bar-header">
                        <MetricTooltip label="Pixel IoU" tooltipKey="iou" />
                        <span className="metric-number">{model.iou}</span>
                      </div>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${fillClass}`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, ((model.rawMetrics.iou ?? 0) / 0.6) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Dice */}
                    <div className="metric-bar-item">
                      <div className="metric-bar-header">
                        <MetricTooltip label="Pixel Dice" tooltipKey="dice" />
                        <span className="metric-number">{model.dice}</span>
                      </div>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${fillClass}`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, ((model.rawMetrics.dice ?? 0) / 0.75) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Precision */}
                    <div className="metric-bar-item">
                      <div className="metric-bar-header">
                        <MetricTooltip label="Precision" tooltipKey="precision" />
                        <span className="metric-number">{model.precision}</span>
                      </div>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${fillClass}`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, (model.rawMetrics.precision ?? 0) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Recall */}
                    <div className="metric-bar-item">
                      <div className="metric-bar-header">
                        <MetricTooltip label="Recall" tooltipKey="recall" />
                        <span className="metric-number">{model.recall}</span>
                      </div>
                      <div className="metric-track">
                        <div
                          className={`metric-fill ${fillClass}`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, (model.rawMetrics.recall ?? 0) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Secondary Metrics Grid (Part 8) */}
                  <div className="secondary-metrics-grid">
                    <div className="sec-metric-cell">
                      <span className="sec-metric-label">F1 Score</span>
                      <span className="sec-metric-value">{model.f1}</span>
                    </div>
                    <div className="sec-metric-cell">
                      <span className="sec-metric-label">Latency</span>
                      <span className="sec-metric-value">{model.latency}</span>
                    </div>
                    <div className="sec-metric-cell">
                      <span className="sec-metric-label">Params</span>
                      <span className="sec-metric-value">{model.parametersDisplay}</span>
                    </div>
                    <div className="sec-metric-cell">
                      <span className="sec-metric-label">Checkpoint</span>
                      <span className="sec-metric-value">
                        {model.sizeMb === 'Not exposed' ? '—' : `${model.sizeMb}MB`}
                      </span>
                    </div>
                  </div>

                  {/* Performance Profile (Part 9) */}
                  <div className="perf-profile-row">
                    <span className="perf-profile-label">Profile</span>
                    <div className="perf-profile-pills">
                      <span className="perf-pill perf-pill-quality" title="Segmentation quality rating">
                        {qualityDescriptor}
                      </span>
                      <span className="perf-pill perf-pill-speed" title="Inference speed rating">
                        {speedDescriptor}
                      </span>
                      <span className="perf-pill perf-pill-size" title="Model memory weight">
                        {sizeDescriptor}
                      </span>
                    </div>
                  </div>

                  {/* Selected for Analysis Indicator */}
                  {isSelected && (
                    <div className="model-selected-banner">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} /> SELECTED FOR ANALYSIS
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.85 }}>Active Target</span>
                    </div>
                  )}

                  {/* Card Actions (Part 11) */}
                  <div className="model-card-actions">
                    <button
                      className="btn-geo-secondary"
                      onClick={() => {
                        setSelectedId(model.id)
                        setDetailOpen(true)
                      }}
                      title="View detailed architecture, benchmark and runtime specs"
                    >
                      View Details
                    </button>
                    <button
                      className="btn-geo-primary"
                      onClick={() => handleUseInAnalysis(model.id)}
                      title={`Select ${model.label} and proceed to Analysis Studio`}
                    >
                      <BrainCircuit size={15} /> Use in Analysis
                    </button>
                    <button
                      className={`btn-geo-icon ${isFav ? 'active' : ''}`}
                      onClick={() => toggleFavorite(model.id)}
                      title={isFav ? 'Remove favorite' : 'Set as favorite'}
                      aria-label="Toggle favorite"
                    >
                      <Star size={15} fill={isFav ? '#00AFA3' : 'none'} />
                    </button>
                    <button
                      className="btn-geo-icon"
                      onClick={() => {
                        const formatted = `${model.label} Metrics:\nIoU: ${model.iou}\nDice: ${model.dice}\nPrecision: ${model.precision}\nRecall: ${model.recall}\nLatency: ${model.latency}\nParameters: ${model.parameters}`
                        copyToClipboard(formatted, `${model.label} metrics`)
                      }}
                      title="Copy benchmark metrics"
                      aria-label="Copy benchmark metrics"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── List View (Part 31) ── */
        <div className="models-list-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="models-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Primary Role</th>
                  <th>Pixel IoU</th>
                  <th>Pixel Dice</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>Latency</th>
                  <th>Size</th>
                  <th>Parameters</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map((model) => {
                  const isSelected = selectedModel?.id === model.id
                  return (
                    <tr
                      key={model.id}
                      className={isSelected ? 'selected' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedId(model.id)
                        setDetailOpen(true)
                      }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background:
                                model.id === 'unetpp'
                                  ? '#00AFA3'
                                  : model.id === 'yolo11'
                                  ? '#4D72FF'
                                  : '#8B5CF6',
                            }}
                          />
                          <div>
                            <strong style={{ color: '#162531' }}>{model.label}</strong>
                            <div style={{ fontSize: 11, color: '#6B7C8C' }}>{model.id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            model.status === 'AVAILABLE'
                              ? 'status-badge-avail'
                              : 'status-badge-unavail'
                          }
                          style={{ padding: '3px 8px', fontSize: 10.5 }}
                        >
                          {model.status}
                        </span>
                      </td>
                      <td>
                        <span className="role-pill">{model.primaryRole}</span>
                      </td>
                      <td>
                        <strong style={{ color: '#00AFA3' }}>{model.iou}</strong>
                      </td>
                      <td>
                        <strong>{model.dice}</strong>
                      </td>
                      <td>{model.precision}</td>
                      <td>{model.recall}</td>
                      <td>{model.latency}</td>
                      <td>{model.sizeMb === 'Not exposed' ? '—' : `${model.sizeMb} MB`}</td>
                      <td>{model.parametersDisplay}</td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            justifyContent: 'flex-end',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="btn-geo-secondary"
                            style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                            onClick={() => {
                              setSelectedId(model.id)
                              setDetailOpen(true)
                            }}
                          >
                            Details
                          </button>
                          <button
                            className="btn-geo-primary"
                            style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                            onClick={() => handleUseInAnalysis(model.id)}
                          >
                            Use in Analysis
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Benchmark Insights Panel (Part 22) ── */}
      <div className="benchmark-insights-panel">
        <div className="insights-header">
          <Sparkles size={18} style={{ color: '#00AFA3' }} />
          <h4 className="insights-title">Benchmark Insights & Empirical Findings</h4>
        </div>
        <div className="insights-grid">
          <div className="insight-item">
            <div className="insight-icon-wrap">
              <Layers size={16} />
            </div>
            <div className="insight-text">
              <strong>U-Net++</strong> demonstrates the highest mean pixel IoU (
              <strong>0.4804</strong>) and Dice (<strong>0.6409</strong>) in the Tile 8 benchmark,
              making it the optimal choice for fine boundary delineation.
            </div>
          </div>
          <div className="insight-item">
            <div className="insight-icon-wrap" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <Zap size={16} />
            </div>
            <div className="insight-text">
              <strong>YOLO11-Seg</strong> exhibits the lowest measured latency (
              <strong>0.935s/image</strong>) with near-complete building recall (
              <strong>0.9992</strong>), tailored for rapid large-scale tile scanning.
            </div>
          </div>
          <div className="insight-item">
            <div className="insight-icon-wrap" style={{ background: '#FAF5FF', color: '#7C3AED' }}>
              <Compass size={16} />
            </div>
            <div className="insight-text">
              <strong>Mask R-CNN</strong> provides instance-level proposal discrimination across
              <strong> 45.88M parameters</strong>, serving as an instance segmentation baseline for
              cadastral parcels.
            </div>
          </div>
        </div>
      </div>

      {/* ── Model Details Drawer (Parts 13 & 14) ── */}
      {detailOpen && selectedModel && (
        <div
          className="drawer-backdrop"
          onClick={() => setDetailOpen(false)}
          role="presentation"
        >
          <div
            className="drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <div className="drawer-header">
              <div className="drawer-header-left">
                <span className="drawer-eyebrow">MODEL REGISTRY SPECIFICATION</span>
                <h2 id="drawer-title" className="drawer-title">
                  {selectedModel.label}
                </h2>
              </div>
              <button
                className="btn-geo-icon"
                onClick={() => setDetailOpen(false)}
                title="Close details (Esc)"
                aria-label="Close model details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Overview */}
              <div className="drawer-section">
                <h4 className="drawer-section-title">
                  <BrainCircuit size={14} /> Model Overview
                </h4>
                <div className="drawer-info-grid">
                  <div className="drawer-info-box">
                    <span className="drawer-info-label">Identifier</span>
                    <span className="drawer-info-value">{selectedModel.id}</span>
                  </div>
                  <div className="drawer-info-box">
                    <span className="drawer-info-label">Status</span>
                    <span
                      className="drawer-info-value"
                      style={{
                        color: selectedModel.status === 'AVAILABLE' ? '#00AFA3' : '#E74C3C',
                      }}
                    >
                      {selectedModel.status}
                    </span>
                  </div>
                  <div className="drawer-info-box" style={{ gridColumn: 'span 2' }}>
                    <span className="drawer-info-label">Primary Role</span>
                    <span className="drawer-info-value">{selectedModel.primaryRole}</span>
                  </div>
                  <div className="drawer-info-box" style={{ gridColumn: 'span 2' }}>
                    <span className="drawer-info-label">Operational Scope</span>
                    <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.45 }}>
                      {selectedModel.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Architecture */}
              <div className="drawer-section">
                <h4 className="drawer-section-title">
                  <Layers size={14} /> Network Architecture
                </h4>
                <div className="drawer-info-grid">
                  <div className="drawer-info-box" style={{ gridColumn: 'span 2' }}>
                    <span className="drawer-info-label">Architecture Name</span>
                    <span className="drawer-info-value">{selectedModel.architecture.name}</span>
                  </div>
                  <div className="drawer-info-box" style={{ gridColumn: 'span 2' }}>
                    <span className="drawer-info-label">Backbone / Backbone Modules</span>
                    <span className="drawer-info-value">{selectedModel.architecture.backbone}</span>
                  </div>
                  <div className="drawer-info-box">
                    <span className="drawer-info-label">Segmentation Paradigm</span>
                    <span className="drawer-info-value">{selectedModel.architecture.type}</span>
                  </div>
                  <div className="drawer-info-box">
                    <span className="drawer-info-label">Loss Optimization</span>
                    <span className="drawer-info-value">{selectedModel.architecture.loss}</span>
                  </div>
                </div>
              </div>

              {/* Checkpoint & Storage */}
              <div className="drawer-section">
                <h4 className="drawer-section-title">
                  <HardDrive size={14} /> Checkpoint & Storage
                </h4>
                <div className="drawer-info-grid">
                  <div className="drawer-info-box">
                    <span className="drawer-info-label">Weights Filename</span>
                    <span className="drawer-info-value" style={{ fontFamily: 'monospace' }}>
                      {selectedModel.checkpointName}
                    </span>
                  </div>
                  <div className="drawer-info-box">
                    <span className="drawer-info-label">Storage Size</span>
                    <span className="drawer-info-value">
                      {selectedModel.sizeMb === 'Not exposed'
                        ? selectedModel.sizeMb
                        : `${selectedModel.sizeMb} MB`}
                    </span>
                  </div>
                  <div className="drawer-info-box" style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="drawer-info-label">Disk Storage Path</span>
                      <button
                        className="btn-geo-icon"
                        style={{ width: 22, height: 22 }}
                        onClick={() => copyToClipboard(selectedModel.checkpointPath, 'checkpoint path')}
                        title="Copy disk path"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11.5,
                        color: '#475569',
                        wordBreak: 'break-all',
                        marginTop: 4,
                      }}
                    >
                      {selectedModel.checkpointPath}
                    </span>
                  </div>
                </div>
              </div>

              {/* Benchmark Metrics */}
              <div className="drawer-section">
                <h4 className="drawer-section-title">
                  <BarChart3 size={14} /> Tile 8 Benchmark Metrics
                </h4>
                <div className="drawer-info-grid">
                  <div className="drawer-info-box">
                    <MetricTooltip label="Pixel IoU" tooltipKey="iou" />
                    <span className="drawer-info-value" style={{ color: '#00AFA3' }}>
                      {selectedModel.iou}
                    </span>
                  </div>
                  <div className="drawer-info-box">
                    <MetricTooltip label="Pixel Dice" tooltipKey="dice" />
                    <span className="drawer-info-value" style={{ color: '#00AFA3' }}>
                      {selectedModel.dice}
                    </span>
                  </div>
                  <div className="drawer-info-box">
                    <MetricTooltip label="Precision" tooltipKey="precision" />
                    <span className="drawer-info-value">{selectedModel.precision}</span>
                  </div>
                  <div className="drawer-info-box">
                    <MetricTooltip label="Recall" tooltipKey="recall" />
                    <span className="drawer-info-value">{selectedModel.recall}</span>
                  </div>
                  <div className="drawer-info-box">
                    <MetricTooltip label="F1 Score" tooltipKey="f1" />
                    <span className="drawer-info-value">{selectedModel.f1}</span>
                  </div>
                  <div className="drawer-info-box">
                    <MetricTooltip label="Inference Latency" tooltipKey="latency" />
                    <span className="drawer-info-value">{selectedModel.latency}</span>
                  </div>
                  <div className="drawer-info-box">
                    <MetricTooltip label="Parameters" tooltipKey="parameters" />
                    <span className="drawer-info-value">{selectedModel.parameters}</span>
                  </div>
                  <div className="drawer-info-box">
                    <span className="drawer-info-label">Pred Buildings</span>
                    <span className="drawer-info-value">{selectedModel.predictedBuildings}</span>
                  </div>
                </div>
              </div>

              {/* Analysis Readiness (Part 23) */}
              <div className="drawer-section">
                <h4 className="drawer-section-title">
                  <ShieldCheck size={14} /> Analysis Readiness
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="readiness-badge-row">
                    <span>Model Checkpoint File</span>
                    <span
                      className={`readiness-status ${
                        selectedModel.status === 'AVAILABLE' ? 'ready' : 'not-ready'
                      }`}
                    >
                      {selectedModel.status === 'AVAILABLE' ? (
                        <>
                          <CheckCircle2 size={14} /> AVAILABLE
                        </>
                      ) : (
                        <>
                          <ShieldAlert size={14} /> NOT EXPOSED
                        </>
                      )}
                    </span>
                  </div>
                  <div className="readiness-badge-row">
                    <span>Inference Engine Compatibility</span>
                    <span className="readiness-status ready">
                      <CheckCircle2 size={14} /> COMPATIBLE
                    </span>
                  </div>
                  <div className="readiness-badge-row">
                    <span>Cadastral Consensus Pipeline</span>
                    <span className="readiness-status ready">
                      <CheckCircle2 size={14} /> READY FOR DISPATCH
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn-geo-secondary" onClick={() => setDetailOpen(false)}>
                Close
              </button>
              <button
                className="btn-geo-primary"
                onClick={() => handleUseInAnalysis(selectedModel.id)}
              >
                <BrainCircuit size={15} /> Use in Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Model Comparison Workspace Modal (Parts 15, 16, 17) ── */}
      {compareOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setCompareOpen(false)}
          role="presentation"
        >
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="comparison-dialog-title"
          >
            <div className="modal-header">
              <div>
                <span className="drawer-eyebrow">BENCHMARK LAB</span>
                <h3 id="comparison-dialog-title" style={{ margin: '4px 0 0', fontSize: 20, color: '#162531' }}>
                  Multi-Model Benchmark Comparison
                </h3>
              </div>
              <button
                className="btn-geo-icon"
                onClick={() => setCompareOpen(false)}
                title="Close comparison"
                aria-label="Close comparison"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {/* Model selection chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7C8C', textTransform: 'uppercase' }}>
                  Select Models to Compare (2 or 3)
                </span>
                <div className="compare-selector-strip">
                  {models.map((m) => {
                    const isChecked = comparedModelIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        className={`compare-chip ${isChecked ? 'active' : ''}`}
                        onClick={() => toggleComparisonModel(m.id)}
                      >
                        {isChecked ? <Check size={13} /> : null}
                        <span>{m.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Benchmark Context strip */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12.5,
                  color: '#475569',
                }}
              >
                <strong>Evaluation Benchmark:</strong> Tile 8 (geographically held out test set, 9 images).
                Values are verified empirical test results and do not represent fabricated claims.
              </div>

              {/* Side-by-side Table with best value highlights */}
              <div style={{ overflowX: 'auto', border: '1px solid #DDE5EA', borderRadius: 10 }}>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Metric</th>
                      {comparedModels.map((m) => (
                        <th key={m.id} style={{ width: `${78 / comparedModels.length}%` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background:
                                  m.id === 'unetpp'
                                    ? '#00AFA3'
                                    : m.id === 'yolo11'
                                    ? '#4D72FF'
                                    : '#8B5CF6',
                              }}
                            />
                            <span>{m.label}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Pixel IoU', key: 'iou', rawKey: 'iou', lower: false },
                      { label: 'Pixel Dice', key: 'dice', rawKey: 'dice', lower: false },
                      { label: 'Precision', key: 'precision', rawKey: 'precision', lower: false },
                      { label: 'Recall', key: 'recall', rawKey: 'recall', lower: false },
                      { label: 'F1 Score', key: 'f1', rawKey: 'f1', lower: false },
                      { label: 'Latency', key: 'latency', rawKey: 'latency', lower: true },
                      { label: 'Parameters', key: 'parameters', rawKey: 'parameters', lower: false },
                      { label: 'Checkpoint Size', key: 'sizeMb', rawKey: 'sizeMb', lower: true, suffix: ' MB' },
                      { label: 'Predicted Buildings', key: 'predictedBuildings', rawKey: null },
                      { label: 'Pipeline Status', key: 'status', rawKey: null },
                    ].map((row) => {
                      const bestVal = row.rawKey ? getBestComparisonValue(row.rawKey, row.lower) : null
                      return (
                        <tr key={row.label}>
                          <td style={{ fontWeight: 600, color: '#475569' }}>{row.label}</td>
                          {comparedModels.map((m) => {
                            const raw = row.rawKey ? m.rawMetrics[row.rawKey] : null
                            const isBest = bestVal != null && raw != null && raw === bestVal
                            const valDisplay =
                              row.suffix && m[row.key] !== 'Not exposed'
                                ? `${m[row.key]}${row.suffix}`
                                : m[row.key]
                            return (
                              <td key={m.id} className={isBest ? 'best-value' : ''}>
                                {valDisplay}
                                {isBest && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      marginLeft: 6,
                                      background: '#E8F7F5',
                                      color: '#00AFA3',
                                      padding: '2px 5px',
                                      borderRadius: 4,
                                      fontWeight: 700,
                                    }}
                                  >
                                    BEST
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Visual Horizontal Comparative Bars (Part 16) */}
              <div className="compare-visual-section">
                <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: '#162531' }}>
                  Relative Performance Distribution
                </h4>

                {/* IoU Visual Comparison */}
                <div className="compare-metric-row">
                  <div className="compare-metric-header">
                    <span>Pixel IoU (Higher is better)</span>
                    <span style={{ color: '#6B7C8C', fontSize: 11 }}>Tile 8 Test</span>
                  </div>
                  <div className="compare-bars-group">
                    {comparedModels.map((m) => (
                      <div key={m.id} className="compare-bar-track">
                        <div
                          className="compare-bar-fill"
                          style={{
                            width: `${Math.max(12, ((m.rawMetrics.iou ?? 0) / 0.55) * 100)}%`,
                            background:
                              m.id === 'unetpp'
                                ? '#00AFA3'
                                : m.id === 'yolo11'
                                ? '#4D72FF'
                                : '#8B5CF6',
                          }}
                        >
                          {m.label}: {m.iou}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dice Visual Comparison */}
                <div className="compare-metric-row">
                  <div className="compare-metric-header">
                    <span>Pixel Dice Agreement (Higher is better)</span>
                    <span style={{ color: '#6B7C8C', fontSize: 11 }}>Tile 8 Test</span>
                  </div>
                  <div className="compare-bars-group">
                    {comparedModels.map((m) => (
                      <div key={m.id} className="compare-bar-track">
                        <div
                          className="compare-bar-fill"
                          style={{
                            width: `${Math.max(12, ((m.rawMetrics.dice ?? 0) / 0.7) * 100)}%`,
                            background:
                              m.id === 'unetpp'
                                ? '#00AFA3'
                                : m.id === 'yolo11'
                                ? '#4D72FF'
                                : '#8B5CF6',
                          }}
                        >
                          {m.label}: {m.dice}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Latency Visual Comparison */}
                <div className="compare-metric-row">
                  <div className="compare-metric-header">
                    <span>Inference Latency (Lower is faster)</span>
                    <span style={{ color: '#6B7C8C', fontSize: 11 }}>Seconds / Image</span>
                  </div>
                  <div className="compare-bars-group">
                    {comparedModels.map((m) => {
                      const lat = m.rawMetrics.latency ?? 1
                      const widthPercent = Math.min(100, Math.max(10, (lat / 16) * 100))
                      return (
                        <div key={m.id} className="compare-bar-track">
                          <div
                            className="compare-bar-fill"
                            style={{
                              width: `${widthPercent}%`,
                              background:
                                m.id === 'unetpp'
                                  ? '#00AFA3'
                                  : m.id === 'yolo11'
                                  ? '#4D72FF'
                                  : '#8B5CF6',
                            }}
                          >
                            {m.label}: {m.latency}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <span style={{ fontSize: 12, color: '#6B7C8C' }}>
                Tip: Use in Analysis loads the selected model into the cadastral inference studio.
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-geo-secondary" onClick={() => setCompareOpen(false)}>
                  Close
                </button>
                <button
                  className="btn-geo-primary"
                  onClick={() => {
                    setCompareOpen(false)
                    handleUseInAnalysis(selectedModel?.id || 'unetpp')
                  }}
                >
                  <BrainCircuit size={15} /> Use Selected in Analysis
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Feedback Notification ── */}
      {toastMessage && (
        <div className="toast-notice" role="status" aria-live="polite">
          <CheckCircle2 size={16} style={{ color: '#00AFA3' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
