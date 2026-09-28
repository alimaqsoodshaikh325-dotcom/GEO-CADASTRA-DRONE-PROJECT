// Sample dataset for Demo Mode
export const demoData = {
  // Pune, Maharashtra, India area matching coordinates in Auth screen
  mapCenter: [18.5204, 73.8567],
  
  analysisSummary: {
    image_id: 'img_aerial_pune_sih2026',
    buildings_detected: 5,
    average_confidence: 91.68, // (94.8 + 91.2 + 87.6 + 95.1 + 89.7) / 5
    total_building_area_m2: 1045.2,
    processing_status: 'completed',
    timestamp: '2026-08-31T18:40:00Z',
    filename: 'aerial_pune_sih2026.tif'
  },

  buildings: [
    {
      building_id: 'B001',
      confidence: 94.8,
      bbox: [18.5201, 73.8562, 18.5205, 73.8566],
      // Polygon coordinate rings: [lat, lng]
      polygon: [
        [18.5201, 73.8562],
        [18.5205, 73.8562],
        [18.5205, 73.8566],
        [18.5201, 73.8566],
        [18.5201, 73.8562]
      ],
      area_m2: 245.6,
      perimeter_m: 78.2,
      centroid: [18.5203, 73.8564],
      parcel_id: 'P-1027'
    },
    {
      building_id: 'B002',
      confidence: 91.2,
      bbox: [18.5207, 73.8568, 18.5210, 73.8572],
      polygon: [
        [18.5207, 73.8568],
        [18.5210, 73.8568],
        [18.5210, 73.8572],
        [18.5207, 73.8572],
        [18.5207, 73.8568]
      ],
      area_m2: 180.4,
      perimeter_m: 62.0,
      centroid: [18.52085, 73.8570],
      parcel_id: 'P-1028'
    },
    {
      building_id: 'B003',
      confidence: 87.6,
      bbox: [18.5212, 73.8561, 18.5215, 73.8565],
      polygon: [
        [18.5212, 73.8561],
        [18.5215, 73.8561],
        [18.5215, 73.8565],
        [18.5212, 73.8565],
        [18.5212, 73.8561]
      ],
      area_m2: 310.8,
      perimeter_m: 88.4,
      centroid: [18.52135, 73.8563],
      parcel_id: 'P-1027'
    },
    {
      building_id: 'B004',
      confidence: 95.1,
      bbox: [18.5202, 73.8575, 18.5205, 73.8578],
      polygon: [
        [18.5202, 73.8575],
        [18.5205, 73.8575],
        [18.5205, 73.8578],
        [18.5202, 73.8578],
        [18.5202, 73.8575]
      ],
      area_m2: 120.5,
      perimeter_m: 50.2,
      centroid: [18.52035, 73.85765],
      parcel_id: 'P-1029'
    },
    {
      building_id: 'B005',
      confidence: 89.7,
      bbox: [18.5216, 73.8570, 18.5219, 73.8574],
      polygon: [
        [18.5216, 73.8570],
        [18.5219, 73.8570],
        [18.5219, 73.8574],
        [18.5216, 73.8574],
        [18.5216, 73.8570]
      ],
      area_m2: 187.9,
      perimeter_m: 65.8,
      centroid: [18.52175, 73.8572],
      parcel_id: 'P-1028'
    }
  ],

  parcels: [
    {
      parcel_id: 'P-1027',
      area_m2: 1500.0,
      building_count: 2,
      total_building_area_m2: 556.4, // B001 + B003
      building_coverage_ratio: 0.371, // 556.4 / 1500
      polygon: [
        [18.5200, 73.8560],
        [18.5216, 73.8560],
        [18.5216, 73.8567],
        [18.5200, 73.8567],
        [18.5200, 73.8560]
      ]
    },
    {
      parcel_id: 'P-1028',
      area_m2: 1200.0,
      building_count: 2,
      total_building_area_m2: 368.3, // B002 + B005
      building_coverage_ratio: 0.307,
      polygon: [
        [18.5206, 73.8567],
        [18.5220, 73.8567],
        [18.5220, 73.8575],
        [18.5206, 73.8575],
        [18.5206, 73.8567]
      ]
    },
    {
      parcel_id: 'P-1029',
      area_m2: 800.0,
      building_count: 1,
      total_building_area_m2: 120.5, // B004
      building_coverage_ratio: 0.151,
      polygon: [
        [18.5200, 73.8573],
        [18.5206, 73.8573],
        [18.5206, 73.8580],
        [18.5200, 73.8580],
        [18.5200, 73.8573]
      ]
    }
  ],

  // Convert buildings to dynamic GeoJSON for React-Leaflet GIS visualization
  getGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: this.buildings.map(b => ({
        type: 'Feature',
        id: b.building_id,
        properties: {
          building_id: b.building_id,
          confidence: b.confidence,
          area_m2: b.area_m2,
          perimeter_m: b.perimeter_m,
          parcel_id: b.parcel_id
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            b.polygon.map(coord => [coord[1], coord[0]]) // GeoJSON is [lng, lat]
          ]
        }
      }))
    };
  },

  getParcelsGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: this.parcels.map(p => ({
        type: 'Feature',
        id: p.parcel_id,
        properties: {
          parcel_id: p.parcel_id,
          area_m2: p.area_m2,
          building_count: p.building_count,
          total_building_area_m2: p.total_building_area_m2,
          building_coverage_ratio: p.building_coverage_ratio
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            p.polygon.map(coord => [coord[1], coord[0]]) // GeoJSON is [lng, lat]
          ]
        }
      }))
    };
  }
};
