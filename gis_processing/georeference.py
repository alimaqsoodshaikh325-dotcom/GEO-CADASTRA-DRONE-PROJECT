"""Safe raster georeferencing helpers. Never infer a CRS or geographic coordinates."""
from __future__ import annotations

from dataclasses import dataclass
from math import floor
from pathlib import Path

import rasterio
from pyproj import CRS, Transformer
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as transform_geometry


class GeoreferencingError(RuntimeError):
    pass


@dataclass(frozen=True)
class RasterReference:
    path: Path
    crs: CRS
    transform: object
    width: int
    height: int


def read_raster_reference(image_path: str | Path) -> RasterReference:
    """Return real raster metadata or raise an explicit safety error."""
    path = Path(image_path)
    if path.suffix.lower() not in {'.tif', '.tiff'}:
        raise GeoreferencingError('Input image does not contain georeferencing information. Use a georeferenced GeoTIFF or provide an external georeferencing workflow.')
    try:
        with rasterio.open(path) as dataset:
            if dataset.width <= 0 or dataset.height <= 0:
                raise GeoreferencingError('Raster dimensions are invalid. Geographic coordinates cannot be safely generated.')
            if dataset.crs is None:
                raise GeoreferencingError('CRS information is missing. Geographic coordinates cannot be safely generated.')
            if dataset.transform is None or dataset.transform.is_identity:
                raise GeoreferencingError('Geotransform information is missing. Geographic coordinates cannot be safely generated.')
            return RasterReference(path, CRS.from_user_input(dataset.crs), dataset.transform, dataset.width, dataset.height)
    except rasterio.errors.RasterioError as error:
        raise GeoreferencingError(f'Unable to read georeferencing metadata: {error}') from error


def pixel_to_raster_coordinates(geometry: BaseGeometry, reference: RasterReference) -> BaseGeometry:
    """Map image pixel x/y directly with the raster affine transform."""
    def convert(x, y, z=None):
        rx, ry = reference.transform * (x, y)
        return (rx, ry) if z is None else (rx, ry, z)
    return transform_geometry(convert, geometry)


def is_metric_projected(crs: CRS) -> bool:
    return crs.is_projected and bool(crs.axis_info) and abs(crs.axis_info[0].unit_conversion_factor - 1.0) < 1e-9


def select_measurement_crs(geometry: BaseGeometry, source_crs: CRS) -> CRS:
    """Use a source metre CRS when possible, otherwise choose its UTM zone from a real centroid."""
    if is_metric_projected(source_crs):
        return source_crs
    to_wgs84 = Transformer.from_crs(source_crs, CRS.from_epsg(4326), always_xy=True).transform
    centroid = transform_geometry(to_wgs84, geometry).centroid
    if not (-180 <= centroid.x <= 180 and -90 <= centroid.y <= 90):
        raise GeoreferencingError('Could not select a suitable projected CRS for metric measurements.')
    zone = floor((centroid.x + 180) / 6) + 1
    epsg = (32600 if centroid.y >= 0 else 32700) + zone
    return CRS.from_epsg(epsg)


def reproject_geometry(geometry: BaseGeometry, source_crs: CRS, destination_crs: CRS) -> BaseGeometry:
    if source_crs == destination_crs:
        return geometry
    transformer = Transformer.from_crs(source_crs, destination_crs, always_xy=True)
    return transform_geometry(transformer.transform, geometry)
