const BACKEND_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
const BASE_URL = import.meta.env.DEV ? '' : BACKEND_URL

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

function networkError(path, error) {
  const reason = error instanceof Error && error.message ? ` ${error.message}` : ''
  return new ApiError(
    `Backend request to ${path} failed before an HTTP response was received (network or CORS failure).${reason}`,
    0,
  )
}

function createAbortError() {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || createAbortError())
      return
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason || createAbortError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

async function fetchWithTransientRetry(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const retryable = ['GET', 'HEAD', 'OPTIONS'].includes(method)
  let attempt = 0

  while (true) {
    try {
      return await fetch(url, options)
    } catch (error) {
      if (!retryable || attempt > 0 || error?.name === 'AbortError') throw error
      attempt += 1
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
}

function responseError(response, body) {
  const detail = body?.detail || body?.message
  if (response.status === 401) return new ApiError(`Authentication required.${detail ? ` ${detail}` : ''}`, response.status)
  if (response.status === 403) return new ApiError(`Request forbidden.${detail ? ` ${detail}` : ''}`, response.status)
  if (response.status === 404) return new ApiError(`API endpoint not found.${detail ? ` ${detail}` : ''}`, response.status)
  if (response.status >= 500) return new ApiError(`FastAPI returned a server error.${detail ? ` ${detail}` : ''}`, response.status)
  return new ApiError(detail || `API request failed (HTTP ${response.status}).`, response.status)
}

async function request(path, options = {}) {
  let response
  try { response = await fetchWithTransientRetry(`${BASE_URL}${path}`, options) }
  catch (error) { throw networkError(path, error) }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw responseError(response, body)
  return body
}

async function requestBlob(path, options = {}, maxRetries = 1) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, options)
      if (!response.ok) throw responseError(response, await response.json().catch(() => null))
      return await response.blob()
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) throw error
      if (error instanceof ApiError) throw error
      if (!(error instanceof TypeError)) throw error
      if (attempt >= maxRetries) throw networkError(path, error)
      await waitForRetry(300 * (2 ** attempt), options.signal)
    }
  }
}

export const api = {
  baseUrl: BASE_URL,
  getAssistantStatus: () => request('/api/assistant/status'),
  createAssistantConversation: () => request('/api/assistant/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }),
  sendAssistantMessage: async ({ message, conversation_id, context }) => {
    const response = await fetch(`${BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversation_id, context }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      const detail = payload?.message || payload?.detail || 'Gemini Assistant is not configured yet.'
      throw new ApiError(detail, response.status, payload?.code || 'GEMINI_API_ERROR')
    }

    return response.json()
  },
  getHealth: () => request('/health'),
  getHistory: () => request('/api/history'),
  getDashboardSummary: () => request('/api/dashboard/summary'),
  getPostgisStatus: () => request('/api/postgis/status'),
  getDatasets: () => request('/api/demo/datasets'),
  getAllDatasets: () => request('/api/demo/datasets/all'),
  getDatasetRegistry: () => request('/api/datasets/registry'),
  validateDataset: () => request('/api/datasets/validate', { method: 'POST' }),
  getDatasetOutputUrl: (modelId, imageStem) => `${BASE_URL}/api/datasets/outputs/${encodeURIComponent(modelId)}/${encodeURIComponent(imageStem)}`,
  getBenchmarkMetrics: () => request('/api/demo/benchmark-metrics'),
  getModelCheckpoints: () => request('/api/models/checkpoints'),
  getImageUrl: (split, filename) => `${BASE_URL}/api/demo/images/${split}/${filename}`,
  getImageFile: (split, filename, options) => requestBlob(`/api/demo/images/${encodeURIComponent(split)}/${encodeURIComponent(filename)}`, options, 2),
  getMaskUrl: (split, filename) => `${BASE_URL}/api/demo/masks/${split}/${filename}`,
  getPredictionUrl: (model, filename) => `${BASE_URL}/api/demo/predictions/${model}/${filename}`,
  getTestImageUrl: (filename) => `${BASE_URL}/api/demo/images/test/${filename}`,
  getTestMaskUrl: (filename) => `${BASE_URL}/api/demo/masks/test/${filename}`,
  getComparisonUrl: (filename) => `${BASE_URL}/api/demo/comparisons/${filename}`,
  uploadImage: (file) => { const data = new FormData(); data.append('file', file); return request('/api/upload', { method: 'POST', body: data }) },
  startProcessing: ({ fileId, model, parcelFile, parcelIdField, confidence }) => {
    const data = new URLSearchParams({ file_id: fileId })
    if (model) data.set('model', model)
    if (typeof parcelFile === 'string' && parcelFile.trim()) data.set('parcel_file', parcelFile)
    if (parcelIdField) data.set('parcel_id_field', parcelIdField)
    if (confidence != null) data.set('confidence', String(confidence))
    return request('/api/process', { method: 'POST', body: data })
  },
  getJobStatus: (jobId) => request(`/api/status/${encodeURIComponent(jobId)}`),
  getResults: (jobId) => request(`/api/results/${encodeURIComponent(jobId)}`),
  getBuildings: (jobId) => request(`/api/buildings/${encodeURIComponent(jobId)}`),
  getParcels: (jobId) => request(`/api/parcels/${encodeURIComponent(jobId)}`),
  getReviewQueue: (jobId) => request(`/api/review${jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''}`),
  updateReview: (reviewId, payload) => request(`/api/review/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  getArtifactUrl: (jobId, filename) => `${BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/files/${encodeURIComponent(filename).replace(/%2F/g, '/')}`,
  getJobArtifactText: async (jobId, filename) => {
    const response = await fetchWithTransientRetry(api.getArtifactUrl(jobId, filename))
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      let detail = 'Artifact could not be loaded from the backend.'
      try {
        const json = JSON.parse(body)
        if (json?.detail) detail = json.detail
      } catch {
        if (body && body.trim()) detail = body.trim()
      }
      throw new ApiError(detail, response.status)
    }
    return response.text()
  },
  validateJobArtifact: (jobId, filename) => request(`/api/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(filename)}/validate`),
  exportJobPackage: async (jobId) => {
    const response = await fetchWithTransientRetry(`${BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/package`)
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ApiError(body?.detail || 'Package export is unavailable for this job.', response.status)
    }
    return response.blob()
  },
  downloadArtifact: async (jobId, filename) => {
    const response = await fetchWithTransientRetry(api.getArtifactUrl(jobId, filename))
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ApiError(body?.detail || 'Artifact download failed.', response.status)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename.split('/').pop()
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
  },
  getProjectAerialPreviewUrl: () => `${BASE_URL}/api/demo/project-aerial/preview`,
  getProjectAerialMetadata: () => request('/api/demo/project-aerial/metadata'),
  getModelCheckpoints: () => request('/api/models/checkpoints'),
  getSamples: () => request('/api/samples'),
  uploadSample: (sampleId) => {
    const data = new URLSearchParams({ sample_id: sampleId })
    return request('/api/upload/sample', { method: 'POST', body: data })
  },
  validateParcelPath: (path, idField = 'ID') => {
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    if (idField) params.set('id_field', idField)
    return request(`/api/parcels/validate?${params.toString()}`)
  },
}
