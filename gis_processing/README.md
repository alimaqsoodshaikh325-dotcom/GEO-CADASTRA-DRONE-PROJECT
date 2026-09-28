# Phase 2–3 GIS Processing

This module turns YOLOv11-Seg building masks into separate building-footprint features, then optionally overlays them with a supplied cadastral parcel layer. It deliberately does not create, guess, or repair missing geographic metadata.

## Required input

- A georeferenced GeoTIFF with a valid CRS and affine transform.
- A YOLOv11-Seg checkpoint.
- Optionally, a parcel GeoJSON, Shapefile, or GeoPackage with a unique parcel-ID field.

JPG and PNG inputs can only produce the diagnostic `building_footprints_pixels.geojson`; they cannot produce geographic coordinates, geographic GeoJSON, metric measurements, or parcel overlay results.

## Run

```powershell
python gis_processing/process_pipeline.py --image gis_processing/input/aerial.tif --model runs/segment/building_yolo11/weights/best.pt
```

With parcels:

```powershell
python gis_processing/process_pipeline.py --image gis_processing/input/aerial.tif --model runs/segment/building_yolo11/weights/best.pt --parcels gis_processing/input/parcels.geojson --parcel-id-field parcel_id
```

## Coordinate and metric safety

Pixel polygons are mapped by the GeoTIFF’s actual affine transform. The final `building_footprints.geojson` uses EPSG:4326 coordinates for GIS compatibility and preserves the original input CRS in each feature property. Area, perimeter, width, height, and compactness are calculated only in a metre-based projected CRS. If the source CRS is geographic, a UTM CRS is selected from the real footprint location and recorded in the quality report.

## Outputs

- `outputs/geojson/building_footprints.geojson` — valid WGS84 building footprints.
- `outputs/visualizations/building_footprints.png` — 1080×720 image-space detection overlay.
- `outputs/reports/building_statistics.csv` — metric building measurements.
- `outputs/reports/building_parcel_relationship.csv` and `parcel_statistics.csv` — created when parcels are supplied.
- `outputs/reports/gis_quality_report.txt` — validation and CRS/assignment status.

Road analysis remains an integration point until a real road layer is supplied. No road, parcel, CRS, coordinate, metric, or land-use data is fabricated.
