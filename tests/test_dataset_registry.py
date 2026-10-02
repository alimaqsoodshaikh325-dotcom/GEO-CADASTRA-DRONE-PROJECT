from __future__ import annotations

from pathlib import Path

from PIL import Image

from backend.app.api import dashboard


def _write_image(path: Path, image_format: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new('RGB', (2, 2)).save(path, format=image_format)


def test_demo_dataset_counts_use_actual_files_and_no_missing_split_defaults(tmp_path, monkeypatch):
    dataset_root = tmp_path / 'building_segmentation' / 'unet_dataset'
    monkeypatch.setattr(dashboard, 'PROJECT_ROOT', tmp_path)

    _write_image(dataset_root / 'images' / 'train' / 'tile1_image_part_001.jpg', 'JPEG')
    _write_image(dataset_root / 'images' / 'train' / 'tile1_image_part_002.jpg', 'JPEG')
    _write_image(dataset_root / 'masks' / 'train' / 'tile1_image_part_001.png', 'PNG')

    payload = dashboard.get_datasets()

    assert payload['total_images'] == 2
    assert payload['total_masks'] == 1
    assert payload['splits']['train']['image_count'] == 2
    assert payload['splits']['train']['mask_count'] == 1
    assert payload['splits']['train']['masks'] == ['tile1_image_part_001.png']
    assert payload['splits']['val']['items'] == []
    assert payload['splits']['test']['items'] == []
    assert payload['splits']['test']['masks'] == []


def test_dataset_registry_uses_actual_root_and_validation_status(tmp_path, monkeypatch):
    records = [
        {
            'split': split,
            'mask_available': True,
            'building_present': True,
            'validation': 'VALID',
        }
        for split, count in (('train', 45), ('val', 18), ('test', 9))
        for _ in range(count)
    ]
    monkeypatch.setattr(dashboard, 'PROJECT_ROOT', tmp_path)
    monkeypatch.setattr(
        dashboard,
        'DATASET_ROOT',
        tmp_path / 'building_segmentation' / 'unet_dataset',
    )
    monkeypatch.setattr(dashboard, '_dataset_records', lambda: records)

    payload = dashboard.get_dataset_registry()

    assert payload['dataset_root'] == 'building_segmentation/unet_dataset'
    assert payload['validation_status'] == 'PASS'
    assert payload['split_counts'] == {'train': 45, 'val': 18, 'test': 9}
    assert payload['total_masks'] == 72


def test_dataset_validation_status_does_not_pass_incomplete_or_invalid_data():
    record = {
        'split': 'train',
        'mask_available': True,
        'validation': 'VALID',
    }
    complete_records = [
        {**record, 'split': split}
        for split, count in (('train', 45), ('val', 18), ('test', 9))
        for _ in range(count)
    ]

    assert dashboard._dataset_validation_status(complete_records) == 'PASS'
    assert dashboard._dataset_validation_status(complete_records[:-1]) == 'FAIL'
    assert dashboard._dataset_validation_status(
        [{**record, 'validation': 'WARNING', 'mask_available': False}]
    ) == 'WARNING'
    assert dashboard._dataset_validation_status(
        [{**record, 'validation': 'INVALID'}]
    ) == 'FAIL'
