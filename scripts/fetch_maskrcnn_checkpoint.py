from __future__ import annotations

import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path


CHECKPOINT_URL = (
    'https://huggingface.co/shaikhrahella/geocadastra-maskrcnn/resolve/'
    'da294b175c7fff4b19ac135278ab5ad4b96dd063/best.pth'
)
EXPECTED_SHA256 = 'a57ca656cf021785d905138e696e63b24680b8baeea36dd0808925185e8a6f6b'
CHECKPOINT_PATH = (
    Path(__file__).resolve().parents[1]
    / 'building_segmentation'
    / 'runs'
    / 'maskrcnn'
    / 'building_instances_fixed'
    / 'best.pth'
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as checkpoint:
        for chunk in iter(lambda: checkpoint.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def provision_checkpoint() -> None:
    if CHECKPOINT_PATH.exists():
        if not CHECKPOINT_PATH.is_file():
            raise RuntimeError(f'Checkpoint path is not a regular file: {CHECKPOINT_PATH}')
        actual_hash = sha256_file(CHECKPOINT_PATH)
        if actual_hash != EXPECTED_SHA256:
            raise RuntimeError(
                'Existing Mask R-CNN checkpoint failed SHA-256 verification; '
                'refusing to replace it.'
            )
        print('Verified existing Mask R-CNN checkpoint.')
        return

    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix='.best.pth.',
            suffix='.download',
            dir=CHECKPOINT_PATH.parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            request = urllib.request.Request(
                CHECKPOINT_URL,
                headers={'User-Agent': 'GeoCadastra-Render-build/1.0'},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                for chunk in iter(lambda: response.read(1024 * 1024), b''):
                    temporary_file.write(chunk)

        actual_hash = sha256_file(temporary_path)
        if actual_hash != EXPECTED_SHA256:
            raise RuntimeError(
                'Downloaded Mask R-CNN checkpoint failed SHA-256 verification.'
            )
        os.replace(temporary_path, CHECKPOINT_PATH)
        temporary_path = None
        print('Downloaded and verified Mask R-CNN checkpoint.')
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


if __name__ == '__main__':
    provision_checkpoint()
