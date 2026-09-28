# Spatial Consensus and Quality Decision Layer

## Overview

This layer is a conservative decision and reporting component for the GIS pipeline. It accepts model candidate building polygons, evaluates quality and parcel relationships, and emits final consensus outputs without inventing detections.

It is designed to work with the project’s existing GIS stack and existing model inference modules, especially the verified U-Net++ inference path already used in the GIS pipeline.

## Supported model identities

The layer is designed to support the following model names explicitly:

- YOLO11-Seg
- U-Net++
- Mask R-CNN

The current project implementation reuses the verified U-Net++ GIS inference implementation. The system handles missing model predictions gracefully: a model may be absent or produce zero candidates without breaking the GIS workflow.

## Architecture

The workflow is intentionally simple and conservative:

1. Collect candidate building polygons from a model inference source.
2. Validate geometry and compute basic polygon metrics.
3. Attach parcel relationships if a parcel layer is supplied.
4. Evaluate confidence, geometry quality, parcel relationship, and model agreement.
5. Write final outputs as disk artifacts and a plain-text summary.

## Inputs

- Raster GeoTIFF input (required)
- Model path (required; current project uses the verified U-Net++ checkpoint)
- Optional parcel layer (GeoJSON, GeoPackage, shapefile)
- Parcel ID field (default: `ID` for this project’s real parcel data)
- Confidence threshold (default: 0.5)

## Decision logic

The layer evaluates candidate quality using:

- model confidence
- geometry validity
- polygon quality
- spatial consistency
- parcel relationship
- model agreement in multi-model scenarios

Explicit thresholds:

- HIGH_CONFIDENCE: confidence >= 0.75
- MEDIUM_CONFIDENCE: confidence >= 0.45
- LOW_CONFIDENCE: confidence >= 0.25
- REVIEW_REQUIRED: below 0.25 or invalid geometry

Parcel statuses:

- NORMAL
- BOUNDARY_CROSSING
- MULTI_PARCEL
- UNASSIGNED
- GEOMETRY_ERROR

For boundary crossing, the report text is intentionally cautious and uses:

> Potential boundary crossing requiring cadastral verification.

This avoids implying legal or cadastral non-compliance.

## Empty-result handling

If no candidates are produced by the supplied model on the raster, the layer does not invent buildings. Instead it writes:

- empty GeoJSON FeatureCollection
- empty CSVs with headers only
- a clear text report stating that no building candidates were produced
- blank but valid visualization placeholders

This is the required behavior for the real AI4Boundaries raster with the current U-Net++ checkpoint.

## Outputs

Final output directory:

- `gis_processing/outputs/final/`

Created files:

- `final_buildings.geojson`
- `building_measurements.csv`
- `building_parcel_association.csv`
- `parcel_statistics.csv`
- `spatial_consensus_report.csv`
- `spatial_consensus_report.txt`

Visualization directory:

- `gis_processing/outputs/visualizations/final/`

Created files:

- `final_buildings_overlay.png`
- `confidence_overlay.png`
- `parcel_relationship_overlay.png`

## Limitations

- This is a quality-assessment and reporting layer, not a retraining pipeline.
- It does not fabricate detections for empty model outputs.
- The decision logic is conservative and explicitly avoids unsupported quality claims.
- Multi-model agreement is future-ready and is only used when multiple candidate sets exist.
- This layer does not substitute for cadastral review where parcel-edge ambiguity exists.

## Implemented vs future-ready

Implemented:

- empty-result handling
- geometry validation and polygon metrics
- parcel overlay assessment
- explicit confidence classes
- output writing for empty and non-empty results
- CLI runner

Future-ready:

- richer multi-model agreement scoring
- stronger parcel-edge logic
- additional model adapters beyond U-Net++
- richer spatial consensus analytics
