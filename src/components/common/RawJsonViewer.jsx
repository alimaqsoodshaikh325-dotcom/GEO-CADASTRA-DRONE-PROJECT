export default function RawJsonViewer({ data, label = 'Raw payload' }) {
  return (
    <details className="panel" style={{ marginTop: '18px' }}>
      <summary>{label}</summary>
      <pre style={{ overflowX: 'auto', marginTop: '14px' }}>{JSON.stringify(data, null, 2)}</pre>
    </details>
  )
}
