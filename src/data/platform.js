import { Building2, ScanLine, Map, LandPlot, Layers3, ChartNoAxesCombined } from 'lucide-react'

export const features = [
  [
    Building2,
    'AI Building Detection',
    'Detect urban structures using the YOLOv11-Seg Active Model.'
  ],
  [
    ScanLine,
    'Precision Footprint Segmentation',
    'Extract vector footprints. Currently running YOLOv11-Seg, with U-Net++ integration planned.'
  ],
  [
    Map,
    'Automated Parcel Mapping',
    'Conduct post-processing spatial calculations via custom GIS pipelines.'
  ],
  [
    LandPlot,
    'Cadastral Feature Extraction',
    'Intersect building footprints with cadastral parcel boundaries to extract spatial indicators.'
  ],
  [
    Layers3,
    'GIS Visualization',
    'Interrogate geospatial boundaries and layers interactively in a Leaflet canvas.'
  ],
  [
    ChartNoAxesCombined,
    'Spatial Analytics',
    'Compute built area distribution and coverage density metrics directly from extracted footprints.'
  ]
]

export const workflow = [
  'Drone Ingestion',
  'Image Validation',
  'YOLOv11-Seg Processing',
  'Building Detection',
  'Footprint Extraction',
  'GIS Cadastral Mapping'
]
