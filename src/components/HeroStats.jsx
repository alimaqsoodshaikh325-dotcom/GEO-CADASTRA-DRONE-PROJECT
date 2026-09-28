const stats = [
  ['Active Model', 'YOLOv11-Seg'],
  ['Detection Layer', 'Building Footprints'],
  ['GIS Outputs', 'GeoJSON + CSV'],
  ['Extraction Pipeline', '8-Stage System']
]

export default function HeroStats() {
  return (
    <div className="hero-stats animate-fade-in">
      {stats.map(([label, value]) => (
        <div className="stat-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}
