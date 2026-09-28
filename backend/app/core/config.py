from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BASE_DIR.parent
UPLOAD_DIR = BASE_DIR / 'backend' / 'uploads'
JOBS_DIR = BASE_DIR / 'backend' / 'jobs'
OUTPUTS_DIR = BASE_DIR / 'backend' / 'outputs'

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tif', '.tiff'}
DEFAULT_MODEL = 'building_segmentation/runs/unetpp/building_refinement/best.pt'


def resolve_checkpoint_path(model_path: str | Path) -> Path:
    """Resolve a catalog checkpoint against this project, never process CWD."""
    supplied = Path(model_path)
    resolved = (supplied if supplied.is_absolute() else PROJECT_ROOT / supplied).resolve()
    try:
        resolved.relative_to(PROJECT_ROOT.resolve())
    except ValueError as exc:
        raise FileNotFoundError('Model checkpoint is outside the project root.') from exc
    if not resolved.is_file() or resolved.stat().st_size == 0:
        raise FileNotFoundError(f'Model checkpoint not found: {resolved.relative_to(PROJECT_ROOT)}')
    try:
        with resolved.open('rb') as checkpoint:
            checkpoint.read(1)
    except OSError as exc:
        raise OSError(f'Model checkpoint is unreadable: {resolved.relative_to(PROJECT_ROOT)}') from exc
    return resolved
