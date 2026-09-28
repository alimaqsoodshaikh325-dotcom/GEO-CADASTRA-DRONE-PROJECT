from ultralytics import YOLO
from pathlib import Path
import traceback

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_YAML = PROJECT_ROOT / 'data.yaml'
MODEL = 'yolo11n-seg.pt'
RUNS_DIR = PROJECT_ROOT / 'runs' / 'segment'

if __name__ == '__main__':
    print('Starting 1-epoch smoke training...')
    model = YOLO(MODEL)
    try:
        results = model.train(
            data=str(DATA_YAML),
            epochs=1,
            imgsz=640,
            device='cpu',
            project=str(RUNS_DIR),
            name='smoke_building_yolo11_workers0',
            exist_ok=True,
            workers=0,
        )
        print('Smoke training completed')
    except Exception as e:
        print('Smoke training failed:', e)
        traceback.print_exc()
