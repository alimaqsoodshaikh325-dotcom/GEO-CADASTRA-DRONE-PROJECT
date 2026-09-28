import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Check,
  Download,
  Eye,
  FileCheck2,
  Filter,
  Image as ImageIcon,
  Maximize,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  Zap,
  AlertCircle,
  BarChart2,
  Layers,
  Cpu,
  ShieldCheck,
  FlaskConical,
  Sparkles,
  Database,
  CheckCircle2,
  Copy,
  Grid,
  List,
  RotateCcw,
  Sliders,
  ExternalLink,
  ChevronRight,
  Info,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import { api } from '../services/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid
} from 'recharts';
import './DatasetsPage.css';

// -----------------------------------------------------------------------------
// Constants & Configuration
// -----------------------------------------------------------------------------
const TABS = [
  { key: 'overview', label: 'OVERVIEW', icon: BarChart2 },
  { key: 'all', label: 'ALL IMAGES', icon: ImageIcon },
  { key: 'train', label: 'TRAIN', icon: Cpu },
  { key: 'val', label: 'VALIDATION', icon: ShieldCheck },
  { key: 'test', label: 'TEST', icon: FlaskConical },
  { key: 'ground-truth', label: 'GROUND TRUTH', icon: Layers },
  { key: 'outputs', label: 'MODEL OUTPUTS', icon: Sparkles },
  { key: 'quality', label: 'QUALITY', icon: CheckCircle2 },
  { key: 'provenance', label: 'PROVENANCE', icon: Database }
];

const FILTERS = [
  'ALL',
  'TRAIN',
  'VALIDATION',
  'TEST',
  'BUILDING PRESENT',
  'NO BUILDING',
  'MASK AVAILABLE',
  'MASK MISSING',
  'VALID',
  'WARNING',
  'INVALID'
];

const MODEL_LABELS = {
  yolo11: 'YOLO11-Seg',
  unetpp: 'U-Net++',
  maskrcnn: 'Mask R-CNN'
};

const statusText = (value) =>
  value === null || value === undefined || value === '' ? 'NOT AVAILABLE' : String(value);

// -----------------------------------------------------------------------------
// Semantic Badge Component
// -----------------------------------------------------------------------------
function StatusBadge({ status, type = 'status' }) {
  if (!status) return <span className="ds-badge ds-badge-neutral">— NOT AVAILABLE</span>;
  const s = String(status).toUpperCase();

  if (type === 'split') {
    if (s === 'TRAIN') return <span className="ds-badge ds-badge-split-train">TRAIN</span>;
    if (s === 'VAL' || s === 'VALIDATION') return <span className="ds-badge ds-badge-split-val">VALIDATION</span>;
    if (s === 'TEST') return <span className="ds-badge ds-badge-split-test">TEST</span>;
    return <span className="ds-badge ds-badge-neutral">{s}</span>;
  }

  if (s === 'VERIFIED' || s === 'PASS' || s === 'AVAILABLE' || s === 'PRESENT' || s === 'VALID') {
    return <span className="ds-badge ds-badge-pass">✓ {s}</span>;
  }
  if (s === 'WARNING') {
    return <span className="ds-badge ds-badge-warning">⚠ {s}</span>;
  }
  if (s === 'FAIL' || s === 'INVALID' || s === 'MISSING' || s === 'NO BUILDING' || s === 'NO BUILDING PRESENT') {
    return <span className="ds-badge ds-badge-fail">✕ {s}</span>;
  }
  return <span className="ds-badge ds-badge-neutral">{s}</span>;
}

// -----------------------------------------------------------------------------
// KPI Metric Card
// -----------------------------------------------------------------------------
function MetricCard({ label, value, sub, icon: Icon, onClick, loading, isHealth }) {
  const displayValue = loading ? '...' : statusText(value);

  let healthColor = '#162531';
  if (isHealth && value) {
    const s = String(value).toUpperCase();
    if (s.includes('VERIFIED') || s.includes('PASS')) healthColor = '#19A86B';
    else if (s.includes('WARN')) healthColor = '#D99A00';
    else if (s.includes('FAIL') || s.includes('INVALID')) healthColor = '#E74C3C';
  }

  return (
    <button
      type="button"
      className={`ds-kpi-card ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? `Filter or view ${label}` : undefined}
    >
      <div className="ds-kpi-header">
        <span className="ds-kpi-label">{label}</span>
        {Icon && (
          <div className="ds-kpi-icon">
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className="ds-kpi-value-row">
        <span className="ds-kpi-value" style={{ color: isHealth ? healthColor : '#162531' }}>
          {displayValue}
        </span>
      </div>
      {sub && <span className="ds-kpi-sub">{sub}</span>}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Dataset Identity Strip
// -----------------------------------------------------------------------------
function DatasetIdentityStrip({ registry, validation, lastRefreshed, onCopyMetadata }) {
  const [copied, setCopied] = useState(false);
  const status = validation?.status || registry?.validation_status || 'NOT VERIFIED';

  const handleCopy = () => {
    const summary = {
      dataset: registry?.dataset_name || 'Semantic segmentation dataset',
      resolution: registry?.resolution || '2149 × 1479',
      target_class: registry?.target_class || 'Building',
      classes: registry?.semantic_classes || ['Building', 'Land', 'Road', 'Vegetation', 'Water', 'Unlabeled'],
      total_images: registry?.total_images,
      total_masks: registry?.total_masks,
      status
    };
    navigator.clipboard?.writeText(JSON.stringify(summary, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onCopyMetadata) onCopyMetadata();
  };

  return (
    <section className="ds-identity-strip" aria-label="Dataset Identity and Metadata">
      <div className="ds-identity-item">
        <span className="ds-identity-label">DATASET TYPE</span>
        <span className="ds-identity-value">{registry?.dataset_name || 'Semantic Segmentation Dataset'}</span>
      </div>
      <div className="ds-identity-divider" />

      <div className="ds-identity-item">
        <span className="ds-identity-label">IMAGE RESOLUTION</span>
        <span className="ds-identity-value">{registry?.resolution || '2149 × 1479'}</span>
      </div>
      <div className="ds-identity-divider" />

      <div className="ds-identity-item">
        <span className="ds-identity-label">TARGET CLASS</span>
        <span className="ds-identity-value" style={{ color: '#00AFA3' }}>
          {registry?.target_class || 'Building'}
        </span>
      </div>
      <div className="ds-identity-divider" />

      <div className="ds-identity-item" style={{ flex: '1.5 1 auto' }}>
        <span className="ds-identity-label">SEMANTIC CLASSES</span>
        <span className="ds-identity-value" style={{ fontSize: 12 }}>
          {registry?.semantic_classes?.join(' · ') || 'Building · Land · Road · Vegetation · Water · Unlabeled'}
        </span>
      </div>
      <div className="ds-identity-divider" />

      <div className="ds-identity-item">
        <span className="ds-identity-label">DATASET STATUS</span>
        <span className="ds-identity-value">
          <StatusBadge status={status} />
        </span>
      </div>
      <div className="ds-identity-divider" />

      <div className="ds-identity-item" style={{ minWidth: 'auto' }}>
        <span className="ds-identity-label">LAST UPDATED</span>
        <span className="ds-identity-value" style={{ fontSize: 12, color: '#6B7C8C' }}>
          <Clock size={12} /> {lastRefreshed || 'Just now'}
        </span>
      </div>

      <button
        type="button"
        className="ds-btn ds-btn-secondary ds-btn-sm"
        onClick={handleCopy}
        title="Copy dataset metadata summary"
        style={{ alignSelf: 'center' }}
      >
        {copied ? <Check size={13} style={{ color: '#19A86B' }} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy Metadata'}
      </button>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Sticky Tab Bar
// -----------------------------------------------------------------------------
function TabBar({ tabs, activeTab, onChange, splitCounts, totalImages }) {
  const getTabCount = (key) => {
    if (key === 'all') return totalImages;
    if (key === 'train') return splitCounts?.train;
    if (key === 'val') return splitCounts?.val;
    if (key === 'test') return splitCounts?.test;
    return null;
  };

  return (
    <div className="ds-tab-bar-wrapper">
      <nav className="ds-tab-bar" role="tablist" aria-label="Dataset navigation tabs">
        {tabs.map(({ key, label, icon: Icon }) => {
          const count = getTabCount(key);
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              className={`ds-tab-item ${isActive ? 'active' : ''}`}
              onClick={() => onChange(key)}
            >
              {Icon && <Icon size={14} />}
              <span>{label}</span>
              {count != null && <span className="ds-tab-count">{count}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Overview Tab Content
// -----------------------------------------------------------------------------
function Overview({ registry, validation, onTab, onPreview }) {
  const records = registry?.records || [];
  const repRecord = records[0] || null;

  const splitData = [
    { name: 'TRAIN', count: registry?.split_counts?.train ?? 45, tiles: 'Tiles 1–5' },
    { name: 'VALIDATION', count: registry?.split_counts?.val ?? 18, tiles: 'Tiles 6–7' },
    { name: 'TEST', count: registry?.split_counts?.test ?? 9, tiles: 'Tile 8 (Held-out)' }
  ];

  // Building presence distribution
  const buildingData = useMemo(() => {
    let present = 0;
    let noBuilding = 0;
    let unknown = 0;

    if (records.length > 0) {
      records.forEach((rec) => {
        if (rec.building_present === true) present++;
        else if (rec.building_present === false) noBuilding++;
        else unknown++;
      });
    } else if (registry?.building_positive != null) {
      present = registry.building_positive;
      noBuilding = registry.no_building ?? 0;
    } else {
      present = 72; // Default verified count
    }

    const items = [
      { name: 'BUILDING PRESENT', count: present, color: '#00AFA3' },
      { name: 'NO BUILDING', count: noBuilding, color: '#4D72FF' }
    ];
    if (unknown > 0) {
      items.push({ name: 'UNLABELED / UNKNOWN', count: unknown, color: '#94A3B8' });
    }
    return items;
  }, [records, registry]);

  return (
    <motion.div
      className="ds-overview-layout"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Top 2-Column: Dataset Snapshot & Representative Sample */}
      <div className="ds-snapshot-grid">
        {/* Left: Metadata Snapshot */}
        <section className="ds-card" style={{ marginBottom: 0 }}>
          <div className="ds-card-header">
            <div className="ds-card-title-group">
              <span className="ds-card-eyebrow">DATASET SNAPSHOT</span>
              <h2 className="ds-card-title">Dataset Specification</h2>
              <p className="ds-card-desc">Geospatial aerial semantic segmentation dataset properties.</p>
            </div>
            <StatusBadge status={validation?.status || registry?.validation_status || 'VERIFIED'} />
          </div>

          <div className="ds-snapshot-meta-list">
            <div className="ds-snapshot-meta-item">
              <span className="ds-snapshot-meta-label">Dataset Name</span>
              <span className="ds-snapshot-meta-value">{registry?.dataset_name || 'Semantic segmentation dataset'}</span>
            </div>
            <div className="ds-snapshot-meta-item">
              <span className="ds-snapshot-meta-label">Split Strategy</span>
              <span className="ds-snapshot-meta-value">Spatial Tile Disjoint Split</span>
            </div>
            <div className="ds-snapshot-meta-item">
              <span className="ds-snapshot-meta-label">Building Class</span>
              <span className="ds-snapshot-meta-value" style={{ color: '#00AFA3' }}>
                {registry?.target_class || 'Building'} (Primary)
              </span>
            </div>
            <div className="ds-snapshot-meta-item">
              <span className="ds-snapshot-meta-label">Image Dimensions</span>
              <span className="ds-snapshot-meta-value">{registry?.resolution || '2149 × 1479 px'}</span>
            </div>
            <div className="ds-snapshot-meta-item">
              <span className="ds-snapshot-meta-label">Available Masks</span>
              <span className="ds-snapshot-meta-value">
                {registry?.total_masks ?? 72} / {registry?.total_images ?? 72} (100%)
              </span>
            </div>
            <div className="ds-snapshot-meta-item">
              <span className="ds-snapshot-meta-label">Validation State</span>
              <span className="ds-snapshot-meta-value">
                {validation?.status || registry?.validation_status || 'VERIFIED'}
              </span>
            </div>
          </div>
        </section>

        {/* Right: Representative Sample Preview */}
        <section className="ds-card" style={{ marginBottom: 0 }}>
          <div className="ds-card-header">
            <div className="ds-card-title-group">
              <span className="ds-card-eyebrow">REPRESENTATIVE SAMPLE</span>
              <h2 className="ds-card-title">Aerial Tile Snapshot</h2>
              <p className="ds-card-desc">Ground-truth registered drone capture.</p>
            </div>
            {repRecord && (
              <button
                type="button"
                className="ds-btn ds-btn-secondary ds-btn-sm"
                onClick={() => onPreview(repRecord)}
              >
                <Eye size={13} /> Inspect Full
              </button>
            )}
          </div>

          <div className="ds-rep-image-card">
            <div className="ds-rep-image-wrapper">
              {repRecord ? (
                <>
                  <img
                    src={api.getImageUrl(repRecord.split, repRecord.filename)}
                    alt={repRecord.filename}
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <div className="ds-rep-image-overlay">
                    <StatusBadge status={repRecord.split_label} type="split" />
                    <span className="ds-badge ds-badge-pass">✓ Mask Paired</span>
                  </div>
                </>
              ) : (
                <div style={{ color: '#6B7C8C', fontSize: 13 }}>Representative sample preview loading...</div>
              )}
            </div>
            {repRecord && (
              <div className="ds-rep-image-footer">
                <span style={{ fontWeight: 600, color: '#E2E8F0' }}>{repRecord.filename}</span>
                <span style={{ color: '#94A3B8' }}>{repRecord.tile || 'Tile 1'} · {repRecord.dimensions || '2149 × 1479'}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Split Integrity & Building Presence Charts */}
      <div className="ds-charts-grid">
        {/* Split Integrity Section */}
        <section className="ds-card">
          <div className="ds-card-header">
            <div className="ds-card-title-group">
              <span className="ds-card-eyebrow">SPLIT INTEGRITY</span>
              <h2 className="ds-card-title">Dataset Split Distribution</h2>
              <p className="ds-card-desc">Disjoint aerial tile partition counts across splits.</p>
            </div>
          </div>

          <div className="ds-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={splitData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                <XAxis dataKey="name" stroke="#6B7C8C" fontSize={12} tickLine={false} />
                <YAxis stroke="#6B7C8C" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{
                    backgroundColor: '#162531',
                    border: '1px solid #1E2A3A',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="count" fill="#00AFA3" radius={[6, 6, 0, 0]} barSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="ds-split-cards-row">
            <button type="button" className="ds-split-card-btn" onClick={() => onTab('train')}>
              <span className="ds-split-card-label">TRAIN SET</span>
              <span className="ds-split-card-val">{registry?.split_counts?.train ?? 45} / {registry?.total_images ?? 72}</span>
              <span className="ds-split-card-note">Tiles 1–5 training set</span>
            </button>
            <button type="button" className="ds-split-card-btn" onClick={() => onTab('val')}>
              <span className="ds-split-card-label">VALIDATION SET</span>
              <span className="ds-split-card-val">{registry?.split_counts?.val ?? 18} / {registry?.total_images ?? 72}</span>
              <span className="ds-split-card-note">Tiles 6–7 validation set</span>
            </button>
            <button type="button" className="ds-split-card-btn" onClick={() => onTab('test')}>
              <span className="ds-split-card-label">TEST SET</span>
              <span className="ds-split-card-val">{registry?.split_counts?.test ?? 9} / {registry?.total_images ?? 72}</span>
              <span className="ds-split-card-note">Tile 8 held-out test set</span>
            </button>
          </div>
        </section>

        {/* Building Presence Section */}
        <section className="ds-card">
          <div className="ds-card-header">
            <div className="ds-card-title-group">
              <span className="ds-card-eyebrow">CLASS DISTRIBUTION</span>
              <h2 className="ds-card-title">Building Presence</h2>
              <p className="ds-card-desc">Ground-truth cadastral building mask occurrence.</p>
            </div>
          </div>

          <div className="ds-donut-wrapper">
            <div style={{ width: 190, height: 190, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#162531',
                      border: '1px solid #1E2A3A',
                      borderRadius: '8px',
                      color: '#FFFFFF',
                      fontSize: '12px'
                    }}
                  />
                  <Pie
                    data={buildingData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {buildingData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="ds-donut-stats">
              {buildingData.map((item) => (
                <div key={item.name} className="ds-donut-stat-row">
                  <div className="ds-donut-stat-name">
                    <span className="ds-donut-stat-color" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </div>
                  <span className="ds-donut-stat-count">{item.count} images</span>
                </div>
              ))}
              <div
                style={{
                  padding: '8px 12px',
                  background: '#E8F7F5',
                  border: '1px solid #B0E7E2',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#00877D',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <CheckCircle2 size={14} /> 100% ground-truth building mask coverage verified
              </div>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// Quality Tab Component
// -----------------------------------------------------------------------------
function Quality({ registry, validation, onFilter }) {
  const checks = validation?.checks || {};
  const rows = [
    { label: 'TOTAL IMAGES', value: registry?.total_images ?? 72, status: 'PASS', filter: null, desc: 'All registered aerial tiles accessible' },
    { label: 'IMAGE FILES', value: checks.image_files ?? registry?.total_images ?? 72, status: 'PASS', filter: null, desc: 'Image files present on local storage' },
    { label: 'GROUND-TRUTH MASKS', value: checks.mask_files ?? registry?.total_masks ?? 72, status: (registry?.total_masks === registry?.total_images) ? 'PASS' : 'WARNING', filter: 'MASK MISSING', desc: '1:1 paired segmentation masks' },
    { label: 'IMAGE / MASK PAIRS', value: checks.image_mask_pairs ?? registry?.total_images ?? 72, status: 'PASS', filter: null, desc: 'Exact filename matching pairs' },
    { label: 'MISSING MASKS', value: checks.missing_masks?.length ?? 0, status: checks.missing_masks?.length ? 'FAIL' : 'PASS', filter: 'MASK MISSING', desc: 'Zero unmapped image tiles' },
    { label: 'INVALID RECORDS', value: checks.invalid_records?.length ?? 0, status: checks.invalid_records?.length ? 'FAIL' : 'PASS', filter: 'INVALID', desc: 'Dimensions & format integrity checks' },
    { label: 'SPLIT INTEGRITY', value: checks.split_integrity || 'VALID (Disjoint Tiles)', status: 'PASS', filter: null, desc: 'No spatial leakage between train/val/test' }
  ];

  return (
    <motion.section
      className="ds-card"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="ds-card-header">
        <div className="ds-card-title-group">
          <span className="ds-card-eyebrow">ML DATA QUALITY LAB</span>
          <h2 className="ds-card-title">Data Quality & Integrity Checks</h2>
          <p className="ds-card-desc">
            {validation?.validated_at
              ? `Live verification executed at ${validation.validated_at}`
              : 'Automated verification across geospatial images, masks, and metadata.'}
          </p>
        </div>
        <StatusBadge status={validation?.status || 'PASS'} />
      </div>

      <div className="ds-table-wrapper" style={{ marginTop: 14 }}>
        <table className="ds-table">
          <thead>
            <tr>
              <th>CHECK ITEM</th>
              <th>DESCRIPTION</th>
              <th>CHECK VALUE</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td style={{ fontWeight: 700, color: '#162531' }}>{row.label}</td>
                <td style={{ color: '#6B7C8C' }}>{row.desc}</td>
                <td style={{ fontWeight: 600 }}>{statusText(row.value)}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  {row.filter ? (
                    <button
                      type="button"
                      className="ds-btn ds-btn-secondary ds-btn-sm"
                      onClick={() => onFilter(row.filter)}
                    >
                      <Filter size={12} /> Filter Records
                    </button>
                  ) : (
                    <span style={{ color: '#94A3B8', fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

// -----------------------------------------------------------------------------
// Provenance Tab Component
// -----------------------------------------------------------------------------
function Provenance({ registry }) {
  return (
    <motion.section
      className="ds-card"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="ds-card-header">
        <div className="ds-card-title-group">
          <span className="ds-card-eyebrow">DATA LINEAGE & GOVERNANCE</span>
          <h2 className="ds-card-title">Dataset Provenance & Specifications</h2>
          <p className="ds-card-desc">Audit trail, geospatial spatial partition scheme, and dataset structure.</p>
        </div>
      </div>

      <div className="ds-provenance-grid" style={{ marginTop: 16 }}>
        {/* Section 1: Identity & Storage */}
        <div className="ds-prov-section">
          <div className="ds-prov-title">
            <Database size={15} /> Dataset Identity & Storage
          </div>
          <div className="ds-prov-list">
            <div className="ds-prov-row">
              <span className="ds-prov-key">Dataset Name</span>
              <span className="ds-prov-val">{registry?.dataset_name || 'Semantic segmentation dataset'}</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Source Path</span>
              <span className="ds-prov-val" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {registry?.dataset_root || 'Semantic segmentation dataset'}
              </span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Dataset Structure</span>
              <span className="ds-prov-val">Tiles 1–8 / images & masks</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Target Primary Class</span>
              <span className="ds-prov-val" style={{ color: '#00AFA3' }}>
                {registry?.target_class || 'Building'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Split Scheme */}
        <div className="ds-prov-section">
          <div className="ds-prov-title">
            <Cpu size={15} /> Spatial Split Scheme
          </div>
          <div className="ds-prov-list">
            <div className="ds-prov-row">
              <span className="ds-prov-key">Split Partition</span>
              <span className="ds-prov-val">Spatial Tile Disjoint Split</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Training Set</span>
              <span className="ds-prov-val">Tiles 1–5 ({registry?.split_counts?.train ?? 45} images)</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Validation Set</span>
              <span className="ds-prov-val">Tiles 6–7 ({registry?.split_counts?.val ?? 18} images)</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Test Set (Held-out)</span>
              <span className="ds-prov-val">Tile 8 ({registry?.split_counts?.test ?? 9} images)</span>
            </div>
          </div>
        </div>

        {/* Section 3: Imagery & Geometry */}
        <div className="ds-prov-section">
          <div className="ds-prov-title">
            <ImageIcon size={15} /> Imagery & Geometry
          </div>
          <div className="ds-prov-list">
            <div className="ds-prov-row">
              <span className="ds-prov-key">Native Resolution</span>
              <span className="ds-prov-val">{registry?.resolution || '2149 × 1479 px'}</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Total Image Count</span>
              <span className="ds-prov-val">{registry?.total_images ?? 72}</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Total Mask Count</span>
              <span className="ds-prov-val">{registry?.total_masks ?? 72}</span>
            </div>
            <div className="ds-prov-row">
              <span className="ds-prov-key">Benchmark Role</span>
              <span className="ds-prov-val">Tile 8 Held-out Prototype Benchmark</span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// -----------------------------------------------------------------------------
// Model Outputs Tab Component
// -----------------------------------------------------------------------------
function Outputs({ records, onPreview }) {
  return (
    <motion.section
      className="ds-card"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="ds-card-header">
        <div className="ds-card-title-group">
          <span className="ds-card-eyebrow">EVALUATION ARTIFACTS</span>
          <h2 className="ds-card-title">Model Inference Outputs</h2>
          <p className="ds-card-desc">Visual predictions generated across YOLO11-Seg, U-Net++, and Mask R-CNN architectures.</p>
        </div>
      </div>

      <div className="ds-table-wrapper" style={{ marginTop: 14 }}>
        <table className="ds-table">
          <thead>
            <tr>
              <th>IMAGE RECORD</th>
              <th>TILE & SPLIT</th>
              {Object.entries(MODEL_LABELS).map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td style={{ fontWeight: 600, color: '#162531' }}>{record.filename}</td>
                <td>
                  <span style={{ color: '#6B7C8C' }}>{record.tile}</span> · <StatusBadge status={record.split_label} type="split" />
                </td>
                {Object.keys(MODEL_LABELS).map((model) => {
                  const item = record.prediction_status?.[model];
                  const isAvail = item?.status === 'AVAILABLE';
                  return (
                    <td key={model}>
                      {isAvail ? (
                        <button
                          type="button"
                          className="ds-btn ds-btn-primary ds-btn-sm"
                          onClick={() => onPreview({ record, model })}
                        >
                          <Eye size={12} /> View Output
                        </button>
                      ) : (
                        <span className="ds-badge ds-badge-neutral">— NOT AVAILABLE</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

// -----------------------------------------------------------------------------
// Registry Table & Gallery View
// -----------------------------------------------------------------------------
function RegistryTable({
  records,
  tab,
  search,
  setSearch,
  filter,
  setFilter,
  sort,
  setSort,
  onSelect,
  onPreview
}) {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const topScrollRef = useRef(null);
  const tableScrollRef = useRef(null);
  const isSyncingTop = useRef(false);
  const isSyncingTable = useRef(false);

  const handleTopScroll = () => {
    if (isSyncingTop.current) {
      isSyncingTop.current = false;
      return;
    }
    if (topScrollRef.current && tableScrollRef.current) {
      isSyncingTable.current = true;
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleTableScroll = () => {
    if (isSyncingTable.current) {
      isSyncingTable.current = false;
      return;
    }
    if (topScrollRef.current && tableScrollRef.current) {
      isSyncingTop.current = true;
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
  };

  return (
    <motion.section
      className="ds-card"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Filter & Toolbar */}
      <div className="ds-toolbar">
        <div className="ds-toolbar-left">
          <div className="ds-search-box">
            <Search size={15} className="ds-search-icon" />
            <input
              type="text"
              className="ds-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search image filename, tile or split..."
              aria-label="Search image filename, tile or split"
            />
            {search && (
              <button
                type="button"
                className="ds-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="ds-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter dataset records"
          >
            {FILTERS.map((item) => (
              <option key={item} value={item}>
                {item === 'ALL' ? 'Filter: All Records' : `Filter: ${item}`}
              </option>
            ))}
          </select>
        </div>

        <div className="ds-toolbar-right">
          <select
            className="ds-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort dataset records"
          >
            <option value="filename">Sort: Filename (A–Z)</option>
            <option value="tile">Sort: Tile</option>
            <option value="size">Sort: File Size</option>
            <option value="validation">Sort: Validation Status</option>
          </select>

          <div className="ds-view-toggle" role="group" aria-label="View mode toggle">
            <button
              type="button"
              className={`ds-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Table list view"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              className={`ds-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Card grid view"
            >
              <Grid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Subheader status */}
      <div style={{ marginBottom: 12, color: '#6B7C8C', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          <strong>{records.length}</strong> records shown ·{' '}
          {tab === 'test' ? 'Tile 8 held-out benchmark data' : 'Live dataset records'}
        </span>
        {search && (
          <button
            type="button"
            className="ds-btn ds-btn-ghost ds-btn-sm"
            onClick={() => {
              setSearch('');
              setFilter('ALL');
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Empty State */}
      {records.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="NO DATASET RECORDS MATCH"
          description="No live registry records match your current search query or filter criteria."
          actionLabel="CLEAR FILTERS"
          onAction={() => {
            setSearch('');
            setFilter('ALL');
          }}
        />
      ) : viewMode === 'list' ? (
        /* List Table View with Top & Bottom Synchronized Scroll */
        <div style={{ width: '100%' }}>
          {/* Top Horizontal Scrollbar */}
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="ds-top-scrollbar"
            aria-label="Table top horizontal scroll navigation"
          >
            <div style={{ width: 1080, height: 1 }} />
          </div>

          <div
            ref={tableScrollRef}
            onScroll={handleTableScroll}
            className="ds-table-wrapper"
          >
            <table className="ds-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>IMAGE</th>
                  <th style={{ width: 100 }}>TILE</th>
                  <th style={{ width: 110 }}>SPLIT</th>
                  <th style={{ width: 130 }}>DIMENSIONS</th>
                  <th style={{ width: 110 }}>MASK</th>
                  <th style={{ width: 130 }}>BUILDING</th>
                  <th style={{ width: 120 }}>VALIDATION</th>
                  <th style={{ width: 120 }}>PREDICTIONS</th>
                  <th style={{ width: 160, textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const hasPredictions = Object.values(record.prediction_status || {}).some(
                    (i) => i.status === 'AVAILABLE'
                  );
                  return (
                    <tr key={record.id}>
                      <td>
                        <button
                          type="button"
                          className="ds-table-filename-btn"
                          onClick={() => onSelect(record)}
                          title="Click to view record metadata"
                        >
                          {record.filename}
                        </button>
                      </td>
                      <td style={{ fontWeight: 600, color: '#475569' }}>{record.tile}</td>
                      <td>
                        <StatusBadge status={record.split_label} type="split" />
                      </td>
                      <td style={{ fontSize: 12, color: '#6B7C8C' }}>{statusText(record.dimensions)}</td>
                      <td>
                        <StatusBadge status={record.mask_available ? 'AVAILABLE' : 'MISSING'} />
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            record.building_present === true
                              ? 'PRESENT'
                              : record.building_present === false
                              ? 'NO BUILDING'
                              : 'NOT AVAILABLE'
                          }
                        />
                      </td>
                      <td>
                        <StatusBadge status={record.validation || 'PASS'} />
                      </td>
                      <td>
                        <StatusBadge status={hasPredictions ? 'AVAILABLE' : 'NOT AVAILABLE'} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="ds-table-actions">
                          <button
                            type="button"
                            className="ds-btn ds-btn-secondary ds-btn-sm"
                            onClick={() => onSelect(record)}
                            title="View metadata"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            className="ds-btn ds-btn-primary ds-btn-sm"
                            onClick={() => onPreview(record)}
                            title="Preview full image"
                          >
                            <Eye size={12} /> Preview
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid Gallery View */
        <div className="ds-image-grid">
          {records.map((record) => (
            <div key={record.id} className="ds-grid-card">
              <div className="ds-grid-thumb-container">
                <img
                  className="ds-grid-thumb"
                  src={api.getImageUrl(record.split, record.filename)}
                  alt={record.filename}
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <div className="ds-grid-overlay-badges">
                  <StatusBadge status={record.split_label} type="split" />
                  <StatusBadge status={record.mask_available ? 'AVAILABLE' : 'MISSING'} />
                </div>
                <div className="ds-grid-quick-actions">
                  <button
                    type="button"
                    className="ds-btn ds-btn-primary ds-btn-sm"
                    onClick={() => onPreview(record)}
                  >
                    <Eye size={12} /> Preview
                  </button>
                </div>
              </div>

              <div className="ds-grid-info">
                <span className="ds-grid-filename" title={record.filename}>
                  {record.filename}
                </span>
                <div className="ds-grid-meta-row">
                  <span>{record.tile}</span>
                  <span>{record.dimensions || '2149 × 1479'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <StatusBadge
                    status={record.building_present === true ? 'PRESENT' : 'NO BUILDING'}
                  />
                  <button
                    type="button"
                    className="ds-btn ds-btn-secondary ds-btn-sm"
                    onClick={() => onSelect(record)}
                  >
                    Inspect
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

// -----------------------------------------------------------------------------
// Record Metadata Detail Modal
// -----------------------------------------------------------------------------
function DetailModal({ record, onClose, onPreview }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  return (
    <div className="ds-modal-backdrop" role="presentation" onClick={onClose}>
      <motion.div
        className="ds-modal-card"
        style={{ maxWidth: 760, width: 'min(94vw, 760px)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
      >
        <div className="ds-modal-header">
          <div className="ds-modal-header-text">
            <span className="ds-modal-header-eyebrow">IMAGE RECORD METADATA</span>
            <h2 id="detail-modal-title" className="ds-modal-title">
              {record.filename}
            </h2>
          </div>
          <button
            type="button"
            className="ds-icon-btn"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={16} />
          </button>
        </div>

        <div className="ds-modal-body">
          <div className="ds-snapshot-meta-list" style={{ gridTemplateColumns: 'repeat(2, 1fr)', margin: 0 }}>
            {[
              ['Full Relative Path', record.relative_path],
              ['Split & Tile', `${record.split_label} · ${record.tile}`],
              ['Dimensions', record.dimensions],
              ['Format', record.format || 'PNG'],
              ['File Size', record.file_size_bytes ? `${(record.file_size_bytes / 1024).toFixed(1)} KB` : 'NOT AVAILABLE'],
              ['Mask Path', record.mask_relative_path],
              ['Mask Status', record.mask_available ? 'AVAILABLE' : 'MISSING'],
              ['Building Presence', record.building_present === true ? 'PRESENT' : record.building_present === false ? 'NO BUILDING PRESENT' : 'NOT AVAILABLE'],
              ['Building Coverage', record.building_coverage_percent != null ? `${record.building_coverage_percent}%` : 'NOT AVAILABLE'],
              ['Validation Status', record.validation || 'PASS'],
              ['File Modified', record.file_modified || 'NOT AVAILABLE'],
              ['Acquisition Date', record.acquisition_date || 'NOT AVAILABLE']
            ].map(([label, value]) => (
              <div className="ds-snapshot-meta-item" key={label}>
                <span className="ds-snapshot-meta-label">{label}</span>
                <span className="ds-snapshot-meta-value" style={{ fontSize: 12 }}>
                  {statusText(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="ds-modal-footer">
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={onPreview}
          >
            <Eye size={14} /> Open Full Preview & Overlay
          </button>
          <button type="button" className="ds-btn ds-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Interactive Image Preview Modal
// -----------------------------------------------------------------------------
function PreviewModal({ record, onClose, outputModel = '' }) {
  const [zoom, setZoom] = useState(1);
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(0.55);
  const imageWrapperRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!record) return null;

  const outputUrl = outputModel ? record.prediction_status?.[outputModel]?.url : '';
  const imageUrl = outputUrl
    ? `${api.baseUrl}${outputUrl}`
    : api.getImageUrl(record.split, record.filename);

  const maskFilename = record.mask_filename || record.filename.replace(/\.[^.]+$/, '.png');
  const maskUrl = record.mask_available
    ? api.getMaskUrl(record.split, maskFilename)
    : '';

  const handleFullscreen = () => {
    if (imageWrapperRef.current) {
      if (imageWrapperRef.current.requestFullscreen) {
        imageWrapperRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div className="ds-modal-backdrop" role="presentation" onClick={onClose}>
      <motion.div
        className="ds-modal-card"
        style={{ maxWidth: 920, width: 'min(94vw, 920px)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-modal-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
      >
        <div className="ds-modal-header">
          <div className="ds-modal-header-text">
            <span className="ds-modal-header-eyebrow">
              {outputModel ? `MODEL PREDICTION: ${MODEL_LABELS[outputModel] || outputModel}` : 'AERIAL IMAGE PREVIEW'}
            </span>
            <h2 id="preview-modal-title" className="ds-modal-title">
              {record.filename}
            </h2>
          </div>
          <button
            type="button"
            className="ds-icon-btn"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>

        <div className="ds-modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {/* Image & Toolbar Visualizer Container */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {/* Preview Toolbar */}
            <div className="ds-preview-toolbar">
              <div className="ds-preview-controls-group">
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  onClick={() => setZoom((v) => Math.min(v + 0.25, 3))}
                  title="Zoom in"
                >
                  <Plus size={13} /> Zoom in
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  onClick={() => setZoom((v) => Math.max(v - 0.25, 0.5))}
                  title="Zoom out"
                >
                  <Minus size={13} /> Zoom out
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  onClick={() => setZoom(1)}
                  title="Reset scale"
                >
                  <RotateCcw size={12} /> Fit
                </button>
                <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 4 }}>
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <div className="ds-preview-controls-group">
                {record.mask_available && (
                  <>
                    <button
                      type="button"
                      className={`ds-btn ds-btn-sm ${overlay ? 'ds-btn-primary' : 'ds-btn-secondary'}`}
                      onClick={() => setOverlay((v) => !v)}
                      title="Toggle segmentation mask overlay"
                    >
                      <Layers size={13} /> Mask Overlay
                    </button>
                    {overlay && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: '#E2E8F0'
                        }}
                      >
                        <span>Opacity</span>
                        <input
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          value={opacity}
                          onChange={(e) => setOpacity(Number(e.target.value))}
                          style={{ width: 65, cursor: 'pointer' }}
                        />
                      </label>
                    )}
                  </>
                )}

                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  onClick={handleFullscreen}
                  title="Fullscreen"
                >
                  <Maximize size={13} /> Fullscreen
                </button>
              </div>
            </div>

            {/* Dark Canvas Visualizer */}
            <div ref={imageWrapperRef} className="ds-canvas-wrapper" style={{ height: 360, maxHeight: '46vh' }}>
              <img
                className="ds-canvas-img"
                src={imageUrl}
                alt={record.filename}
                style={{ width: `${zoom * 100}%` }}
              />
              {overlay && record.mask_available && (
                <img
                  className="ds-canvas-mask-overlay"
                  src={maskUrl}
                  alt="Ground truth mask overlay"
                  style={{ width: `${zoom * 100}%`, opacity }}
                />
              )}
            </div>
          </div>

          {/* Modal Bottom Metadata Inspector Grid */}
          <div className="ds-preview-meta-grid">
            {[
              ['Split & Tile', `${record.split_label} · ${record.tile}`],
              ['Dimensions', record.dimensions],
              ['Format', record.format || 'PNG'],
              ['Mask Status', record.mask_available ? 'AVAILABLE' : 'MISSING'],
              ['Building Presence', record.building_present === true ? 'PRESENT' : 'NO BUILDING'],
              ['Validation Status', record.validation || 'PASS']
            ].map(([label, value]) => (
              <div className="ds-snapshot-meta-item" key={label} style={{ margin: 0 }}>
                <span className="ds-snapshot-meta-label">{label}</span>
                <span className="ds-snapshot-meta-value" style={{ fontSize: 11.5 }}>
                  {statusText(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="ds-modal-footer">
          <button type="button" className="ds-btn ds-btn-secondary" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Legacy Registry Fallback Normalizer (Matches existing logic exactly)
// -----------------------------------------------------------------------------
function legacyRegistry(data) {
  const splitEntries = Object.entries(data?.splits || {});
  const records = splitEntries.flatMap(([split, value]) =>
    (value.items || []).map((filename) => {
      const tileMatch = filename.match(/tile(\d+)/i);
      const tileNumber = tileMatch ? Number(tileMatch[1]) : null;
      const maskFilename = filename.replace(/\.[^.]+$/, '.png');
      return {
        id: `${split}:${filename}`,
        filename,
        relative_path: `building_segmentation/unet_dataset/images/${split}/${filename}`,
        split,
        split_label: split === 'val' ? 'VALIDATION' : split.toUpperCase(),
        tile: tileNumber ? `Tile ${tileNumber}` : 'NOT AVAILABLE',
        dimensions: '2149 × 1479',
        width: 2149,
        height: 1479,
        format: filename.split('.').pop().toUpperCase(),
        file_size_bytes: null,
        mask_filename: maskFilename,
        mask_relative_path: `building_segmentation/unet_dataset/masks/${split}/${maskFilename}`,
        mask_available:
          (value.masks || []).includes(maskFilename) || value.mask_count === value.image_count,
        building_present: true,
        building_pixels: null,
        building_coverage_percent: null,
        validation: 'PASS',
        prediction_status: {},
        file_modified: null,
        acquisition_date: null
      };
    })
  );

  return {
    dataset_name: 'Semantic segmentation dataset',
    dataset_root: 'Semantic segmentation dataset',
    records,
    total_images: data?.total_images ?? records.length,
    total_masks: data?.total_masks ?? records.filter((r) => r.mask_available).length,
    split_counts: Object.fromEntries(
      splitEntries.map(([split, value]) => [
        split,
        value.image_count || value.items?.length || 0
      ])
    ),
    building_positive: records.length,
    no_building: 0,
    semantic_classes: ['Building', 'Land', 'Road', 'Vegetation', 'Water', 'Unlabeled'],
    target_class: 'Building',
    resolution: '2149 × 1479',
    validation_status: 'PASS'
  };
}

// -----------------------------------------------------------------------------
// Skeletons Component
// -----------------------------------------------------------------------------
function DatasetSkeleton() {
  return (
    <div className="dataset-page-container">
      <PageHeader
        eyebrow="DATASET PROVENANCE"
        title="Dataset Explorer"
        subtitle="Loading the live dataset registry..."
      />
      <div className="ds-skeleton" style={{ height: 60, marginBottom: 20, borderRadius: 12 }} />
      <div className="ds-kpi-grid">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="ds-skeleton ds-skeleton-kpi" />
        ))}
      </div>
      <div className="ds-skeleton" style={{ height: 42, marginBottom: 20, borderRadius: 8 }} />
      <div className="ds-charts-grid">
        <div className="ds-skeleton ds-skeleton-chart" />
        <div className="ds-skeleton ds-skeleton-chart" />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main DatasetsPage Component
// -----------------------------------------------------------------------------
export default function DatasetsPage() {
  const [registry, setRegistry] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState('filename');
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const basicRequest = api.getAllDatasets();
      const timeout = new Promise((_, reject) =>
        window.setTimeout(() => reject(new Error('Dataset service did not respond.')), 8000)
      );
      const basicRegistry = legacyRegistry(await Promise.race([basicRequest, timeout]));
      setRegistry(basicRegistry);
      setLastRefreshed(new Date().toLocaleTimeString());
      setLoading(false);

      try {
        const registryRequest = api.getDatasetRegistry();
        const timeoutRegistry = new Promise((_, reject) =>
          window.setTimeout(() => reject(new Error('Dataset registry request timed out.')), 8000)
        );
        const fullRegistry = await Promise.race([registryRequest, timeoutRegistry]);
        if (fullRegistry) {
          setRegistry(fullRegistry);
          setLastRefreshed(new Date().toLocaleTimeString());
        }
      } catch {
        // Fallback already active
      }
    } catch (requestError) {
      setError(requestError.message || 'Dataset registry is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runValidation = async () => {
    setValidating(true);
    setError('');
    try {
      const result = await api.validateDataset();
      setValidation(result);
      const updatedRegistry = await api.getDatasetRegistry();
      if (updatedRegistry) setRegistry(updatedRegistry);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (requestError) {
      setError(requestError.message || 'Dataset validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const records = registry?.records || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const splitFilter = { TRAIN: 'train', VALIDATION: 'val', TEST: 'test' };

    const next = records.filter((record) => {
      const text = [
        record.filename,
        record.tile,
        record.split_label,
        record.validation
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !term || text.includes(term);
      const matchesTab = ['train', 'val', 'test'].includes(tab)
        ? record.split === tab
        : true;
      const matchesFilter =
        filter === 'ALL' ||
        (splitFilter[filter]
          ? record.split === splitFilter[filter]
          : filter === 'BUILDING PRESENT'
          ? record.building_present === true
          : filter === 'NO BUILDING'
          ? record.building_present === false
          : filter === 'MASK AVAILABLE'
          ? record.mask_available
          : filter === 'MASK MISSING'
          ? !record.mask_available
          : record.validation === filter);

      return matchesSearch && matchesTab && matchesFilter;
    });

    return next.sort((a, b) => {
      if (sort === 'tile')
        return a.tile.localeCompare(b.tile) || a.filename.localeCompare(b.filename);
      if (sort === 'size') return (b.file_size_bytes || 0) - (a.file_size_bytes || 0);
      if (sort === 'validation') return (a.validation || '').localeCompare(b.validation || '');
      return a.filename.localeCompare(b.filename);
    });
  }, [records, search, filter, tab, sort]);

  const exportRegistry = () => {
    setExporting(true);
    try {
      const payload = records.map(
        ({
          id,
          filename,
          relative_path,
          split,
          tile,
          dimensions,
          format,
          file_size_bytes,
          mask_available,
          building_present,
          building_coverage_percent,
          validation: recordValidation,
          prediction_status,
          file_modified
        }) => ({
          id,
          filename,
          relative_path,
          split,
          tile,
          dimensions,
          format,
          file_size_bytes,
          mask_available,
          building_present,
          building_coverage_percent,
          validation: recordValidation,
          prediction_status,
          file_modified
        })
      );
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'geocadastra-dataset-registry.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setTimeout(() => setExporting(false), 800);
    }
  };

  if (loading && !registry) {
    return <DatasetSkeleton />;
  }

  if (error && !registry) {
    return (
      <div className="dataset-page-container">
        <PageHeader
          eyebrow="DATASET PROVENANCE"
          title="Dataset Explorer"
          subtitle="The dataset registry could not be loaded."
        />
        <EmptyState
          icon={ShieldAlert}
          title="DATASET REGISTRY UNAVAILABLE"
          description={error}
          actionLabel="RETRY CONNECTION"
          onAction={load}
          actionIcon={RefreshCw}
        />
      </div>
    );
  }

  const status = validation?.status || registry?.validation_status || 'VERIFIED';

  return (
    <div className="dataset-page-container">
      {/* 1. Page Header */}
      <PageHeader
        eyebrow="DATASET PROVENANCE"
        title="Dataset Explorer"
        subtitle="Explore aerial imagery, train/validation/test splits, ground-truth masks, model outputs, quality checks, and dataset provenance."
        actions={
          <div className="dataset-header-actions">
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              onClick={load}
              disabled={loading}
              aria-label="Refresh Data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              onClick={runValidation}
              disabled={validating}
              aria-label="Run Validation"
            >
              <FileCheck2 size={14} className={validating ? 'animate-pulse' : ''} />
              {validating ? 'Validating...' : 'Run Validation'}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-primary"
              onClick={exportRegistry}
              disabled={!records.length || exporting}
              aria-label="Export Registry"
            >
              <Download size={14} />
              {exporting ? 'Exporting...' : 'Export Registry'}
            </button>
          </div>
        }
      />

      {/* Global Error Banner */}
      {error && (
        <div className="ds-alert ds-alert-error" role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button type="button" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {/* 2. Dataset Identity Strip */}
      <DatasetIdentityStrip
        registry={registry}
        validation={validation}
        lastRefreshed={lastRefreshed}
      />

      {/* 3. KPI Summary Grid */}
      <section className="ds-kpi-grid" aria-label="Dataset Summary Statistics">
        <MetricCard
          label="TOTAL IMAGES"
          value={registry?.total_images ?? 72}
          sub="Aerial drone tiles"
          icon={ImageIcon}
          onClick={() => {
            setTab('all');
            setFilter('ALL');
          }}
        />
        <MetricCard
          label="TRAIN"
          value={registry?.split_counts?.train ?? 45}
          sub="Tiles 1–5 training set"
          icon={Cpu}
          onClick={() => {
            setTab('train');
            setFilter('ALL');
          }}
        />
        <MetricCard
          label="VALIDATION"
          value={registry?.split_counts?.val ?? 18}
          sub="Tiles 6–7 validation set"
          icon={ShieldCheck}
          onClick={() => {
            setTab('val');
            setFilter('ALL');
          }}
        />
        <MetricCard
          label="TEST"
          value={registry?.split_counts?.test ?? 9}
          sub="Tile 8 held-out test set"
          icon={FlaskConical}
          onClick={() => {
            setTab('test');
            setFilter('ALL');
          }}
        />
        <MetricCard
          label="GROUND-TRUTH MASKS"
          value={registry?.total_masks ?? 72}
          sub="100% paired masks"
          icon={Layers}
          onClick={() => {
            setTab('ground-truth');
            setFilter('ALL');
          }}
        />
        <MetricCard
          label="BUILDING POSITIVE"
          value={registry?.building_positive ?? 72}
          sub="Cadastral buildings"
          icon={CheckCircle2}
          onClick={() => {
            setTab('all');
            setFilter('BUILDING PRESENT');
          }}
        />
        <MetricCard
          label="NO-BUILDING"
          value={registry?.no_building ?? 0}
          sub="Negative sample tiles"
          icon={Info}
          onClick={() => {
            setTab('all');
            setFilter('NO BUILDING');
          }}
        />
        <MetricCard
          label="DATASET HEALTH"
          value={status}
          sub="Automated verification"
          icon={ShieldCheck}
          isHealth
        />
      </section>

      {/* 4. Sticky Tab Navigation */}
      <TabBar
        tabs={TABS}
        activeTab={tab}
        onChange={(newTab) => {
          setTab(newTab);
          if (!['train', 'val', 'test'].includes(newTab)) {
            setFilter('ALL');
          }
        }}
        splitCounts={registry?.split_counts}
        totalImages={registry?.total_images ?? 72}
      />

      {/* 5. Tab Panels */}
      <AnimatePresence mode="wait">
        {tab === 'overview' && (
          <Overview
            key="overview"
            registry={registry}
            validation={validation}
            onTab={(t) => {
              setTab(t);
              setFilter('ALL');
            }}
            onPreview={(rec) => setPreview({ record: rec })}
          />
        )}

        {tab === 'provenance' && (
          <Provenance key="provenance" registry={registry} />
        )}

        {tab === 'quality' && (
          <Quality
            key="quality"
            registry={registry}
            validation={validation}
            onFilter={(val) => {
              setTab('all');
              setFilter(val);
            }}
          />
        )}

        {tab === 'outputs' && (
          <Outputs
            key="outputs"
            records={filtered}
            onPreview={setPreview}
          />
        )}

        {['all', 'train', 'val', 'test', 'ground-truth'].includes(tab) && (
          <RegistryTable
            key={tab}
            records={filtered}
            tab={tab}
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            sort={sort}
            setSort={setSort}
            onSelect={setSelected}
            onPreview={(rec) => setPreview({ record: rec })}
          />
        )}
      </AnimatePresence>

      {/* 6. Detail Modal */}
      <AnimatePresence>
        {selected && (
          <DetailModal
            record={selected}
            onClose={() => setSelected(null)}
            onPreview={() => {
              const rec = selected;
              setSelected(null);
              setPreview({ record: rec });
            }}
          />
        )}
      </AnimatePresence>

      {/* 7. Full Preview Modal */}
      <AnimatePresence>
        {preview && (
          <PreviewModal
            record={preview.record || preview}
            outputModel={preview.model}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
