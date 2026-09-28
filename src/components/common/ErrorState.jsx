import { AlertTriangle } from 'lucide-react'

export default function ErrorState({ title = 'Unable to load data', message, description, onRetry, retryLabel = 'Retry' }) {
  return (
    <section className="error-state" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>{title}</strong>
        <p>{message || description || 'The backend did not return the requested data.'}</p>
        {onRetry && <button className="btn" onClick={onRetry}>{retryLabel}</button>}
      </div>
    </section>
  )
}
