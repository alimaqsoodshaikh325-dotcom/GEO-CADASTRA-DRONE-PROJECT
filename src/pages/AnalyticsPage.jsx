import { useDemo } from '../hooks/useDemo'
import { demoData } from '../data/demoData'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { AreaChart, AlertTriangle, Presentation } from 'lucide-react'

export default function AnalyticsPage() {
  const { isDemo, analysisActive } = useDemo()

  const hasData = isDemo && analysisActive

  // Data preparation from demo data
  const areaData = demoData.buildings.map(b => ({
    name: b.building_id,
    'Area (m²)': b.area_m2,
    'Perimeter (m)': b.perimeter_m
  }))

  const confidenceData = demoData.buildings.map(b => ({
    name: b.building_id,
    'Confidence (%)': b.confidence
  }))

  const parcelCoverageData = demoData.parcels.map(p => ({
    name: p.parcel_id,
    'Coverage (%)': parseFloat((p.building_coverage_ratio * 100).toFixed(1)),
    'Buildings': p.building_count
  }))

  return (
    <div className="analytics-view animate-fade-in">
      <div className="page-header">
        <p className="eyebrow">Insights Workspace</p>
        <h1 className="page-title">Spatial Analytics</h1>
        <p className="page-subtitle">
          Explore spatial relationships, statistical distributions, and density indicators.
        </p>
      </div>

      {hasData ? (
        <div className="analytics-content animate-fade-in">
          {/* Top row: Summary widgets */}
          <div className="analytics-summary-row">
            <div className="summary-widget glass-panel">
              <span className="widget-label">Total Mapped Footprint Area</span>
              <strong className="widget-value">1,045.2 m²</strong>
              <p className="widget-desc">Sum of all segmented structures</p>
            </div>
            <div className="summary-widget glass-panel">
              <span className="widget-label">Average Struct Area</span>
              <strong className="widget-value">209.0 m²</strong>
              <p className="widget-desc">Total Area divided by 5 structures</p>
            </div>
            <div className="summary-widget glass-panel">
              <span className="widget-label">Density Ratio</span>
              <strong className="widget-value">29.8%</strong>
              <p className="widget-desc">Calculated across cadastral sectors</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="charts-grid">
            {/* Chart 1: Area Distribution */}
            <div className="chart-card glass-panel">
              <h3>Building Area & Perimeter</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#ecf8ff' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Area (m²)" fill="#56e9ff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Confidence level */}
            <div className="chart-card glass-panel">
              <h3>Detection Confidence Distribution</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={confidenceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" domain={[70, 100]} style={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#ecf8ff' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Confidence (%)" stroke="#a984ff" strokeWidth={3} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Coverage Ratio */}
            <div className="chart-card glass-panel grid-col-2">
              <h3>Building Coverage Ratio per Cadastral Parcel</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={parcelCoverageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#ecf8ff' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Coverage (%)" fill="#60ebff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Buildings" fill="#a984ff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="analytics-empty-state glass-panel">
          <AlertTriangle size={48} className="muted-icon" />
          <h2>No Analysis Data Available</h2>
          <p>
            Spatial distribution charts, coverage indicators, and area density summaries will load once an aerial image has been analyzed.
          </p>
          <span className="light-desc">Go to the AI Analysis tab to process drone imagery.</span>
        </div>
      )}
    </div>
  )
}
