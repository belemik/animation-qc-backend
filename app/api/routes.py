from pathlib import Path
from typing import Dict, List, Optional, Literal
import base64
import secrets
import string
import sqlite3
from datetime import datetime
import uuid
import json
import zipfile
import shutil
import urllib.request
import urllib.parse
import subprocess
import sys
import os

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from ultralytics import YOLO

from app.services.unet_inference import unet_segmenter

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

PREVIEW_DIR = BASE_DIR / "previews"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

ANNOTATIONS_DIR = BASE_DIR / "annotations"
ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)

EXPORTS_DIR = BASE_DIR / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

PROJECT_DATASETS_DIR = BASE_DIR / "project_datasets"
PROJECT_DATASETS_DIR.mkdir(parents=True, exist_ok=True)

TRAINING_LOGS_DIR = BASE_DIR / "training_logs"
TRAINING_LOGS_DIR.mkdir(parents=True, exist_ok=True)

MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = BASE_DIR / "animation_qc.db"
TRAIN_SCRIPT_PATH = BASE_DIR / "app" / "services" / "train_unet.py"

results_store: Dict[str, Dict] = {}

ALPHABET = string.ascii_uppercase + string.digits
YOLO_MODEL_PATH = "yolov8n.pt"

print(f"[YOLO] Loading model: {YOLO_MODEL_PATH}")
model = YOLO(YOLO_MODEL_PATH)
print("[YOLO] Model loaded")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_column(cur: sqlite3.Cursor, table_name: str, column_name: str, column_sql: str):
    columns = cur.execute(f"PRAGMA table_info({table_name})").fetchall()
    existing = {row[1] for row in columns}
    if column_name not in existing:
        cur.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")


def slugify_project_name(project_name: str) -> str:
    source = (project_name or "").strip().lower()
    translit_map = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
        "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i",
        "й": "i", "к": "k", "л": "l", "м": "m", "н": "n",
        "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
        "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
        "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "",
        "э": "e", "ю": "yu", "я": "ya",
    }
    normalized = "".join(translit_map.get(ch, ch) for ch in source)
    safe = []
    prev_dash = False
    for ch in normalized:
        if ch.isalnum():
            safe.append(ch)
            prev_dash = False
        else:
            if not prev_dash:
                safe.append("_")
                prev_dash = True
    result = "".join(safe).strip("_")
    return result or "default_project"


def get_project_dataset_root(project_name: str) -> Path:
    return PROJECT_DATASETS_DIR / slugify_project_name(project_name)


def get_project_dataset_current_dir(project_name: str) -> Path:
    return get_project_dataset_root(project_name) / "current"


def get_project_model_path(project_name: str) -> Path:
    return MODELS_DIR / f"unet_{slugify_project_name(project_name)}.pt"


def is_process_alive(pid: Optional[int]) -> bool:
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def validate_dataset_structure(dataset_dir: Path):
    if not dataset_dir.exists() or not dataset_dir.is_dir():
        raise HTTPException(status_code=400, detail="Папка датасета не найдена")

    images_dir = dataset_dir / "images"
    masks_dir = dataset_dir / "masks"
    meta_path = dataset_dir / "meta.json"

    if not images_dir.exists() or not images_dir.is_dir():
        raise HTTPException(status_code=400, detail="В архиве нет папки images")
    if not masks_dir.exists() or not masks_dir.is_dir():
        raise HTTPException(status_code=400, detail="В архиве нет папки masks")
    if not meta_path.exists():
        raise HTTPException(status_code=400, detail="В архиве нет файла meta.json")

    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать meta.json: {e}")

    if not isinstance(data, list) or not data:
        raise HTTPException(status_code=400, detail="meta.json должен содержать непустой массив примеров")

    return {
        "images_dir": str(images_dir),
        "masks_dir": str(masks_dir),
        "meta_path": str(meta_path),
        "items_count": len(data),
    }


def save_project_dataset_record(
    *,
    project_name: str,
    source_type: str,
    dataset_dir: Path,
    source_url: str = "",
    zip_filename: str = "",
):
    conn = get_conn()
    cur = conn.cursor()

    model_path = str(get_project_model_path(project_name))
    now = datetime.utcnow().isoformat()

    existing = cur.execute(
        "SELECT project_name FROM project_datasets WHERE project_name = ?",
        (project_name,),
    ).fetchone()

    if existing:
        cur.execute(
            """
            UPDATE project_datasets
            SET
                source_type = ?,
                source_url = ?,
                zip_filename = ?,
                dataset_dir = ?,
                model_path = ?,
                updated_at = ?
            WHERE project_name = ?
            """,
            (
                source_type,
                source_url,
                zip_filename,
                str(dataset_dir),
                model_path,
                now,
                project_name,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO project_datasets (
                project_name,
                source_type,
                source_url,
                zip_filename,
                dataset_dir,
                model_path,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_name,
                source_type,
                source_url,
                zip_filename,
                str(dataset_dir),
                model_path,
                now,
                now,
            ),
        )

    existing_train = cur.execute(
        "SELECT project_name FROM project_training_status WHERE project_name = ?",
        (project_name,),
    ).fetchone()

    if not existing_train:
        cur.execute(
            """
            INSERT INTO project_training_status (
                project_name,
                train_status,
                train_log_path,
                last_error,
                pid,
                started_at,
                finished_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_name,
                "idle",
                "",
                "",
                None,
                None,
                None,
                now,
            ),
        )

    conn.commit()
    conn.close()


def refresh_project_training_status(project_name: str):
    conn = get_conn()
    cur = conn.cursor()

    row = cur.execute(
        """
        SELECT
            project_name,
            train_status,
            train_log_path,
            last_error,
            pid,
            started_at,
            finished_at,
            updated_at
        FROM project_training_status
        WHERE project_name = ?
        """,
        (project_name,),
    ).fetchone()

    if row is None:
        conn.close()
        return None

    current_status = row["train_status"]
    pid = row["pid"]
    log_path = row["train_log_path"] or ""
    model_path = get_project_model_path(project_name)

    next_status = current_status
    next_error = row["last_error"] or ""
    finished_at = row["finished_at"]

    if current_status == "training":
        if is_process_alive(pid):
            next_status = "training"
        else:
            if model_path.exists():
                next_status = "done"
                next_error = ""
                finished_at = datetime.utcnow().isoformat()
            else:
                next_status = "error"
                if log_path and Path(log_path).exists():
                    try:
                        content = Path(log_path).read_text(encoding="utf-8", errors="ignore")
                        next_error = content[-1500:] if content else "Обучение завершилось с ошибкой"
                    except Exception:
                        next_error = "Обучение завершилось с ошибкой"
                else:
                    next_error = "Обучение завершилось с ошибкой"
                finished_at = datetime.utcnow().isoformat()

        cur.execute(
            """
            UPDATE project_training_status
            SET
                train_status = ?,
                last_error = ?,
                finished_at = ?,
                updated_at = ?,
                pid = ?
            WHERE project_name = ?
            """,
            (
                next_status,
                next_error,
                finished_at,
                datetime.utcnow().isoformat(),
                pid if next_status == "training" else None,
                project_name,
            ),
        )
        conn.commit()

    updated = cur.execute(
        """
        SELECT
            project_name,
            train_status,
            train_log_path,
            last_error,
            pid,
            started_at,
            finished_at,
            updated_at
        FROM project_training_status
        WHERE project_name = ?
        """,
        (project_name,),
    ).fetchone()

    conn.close()
    return dict(updated) if updated else None


def extract_dataset_zip(zip_path: Path, target_dir: Path):
    if target_dir.exists():
        shutil.rmtree(target_dir, ignore_errors=True)
    target_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zip_file:
        zip_file.extractall(target_dir)

    children = [p for p in target_dir.iterdir()]
    if len(children) == 1 and children[0].is_dir():
        nested = children[0]
        temp_unpack_dir = target_dir.parent / f"{target_dir.name}_flat"
        if temp_unpack_dir.exists():
            shutil.rmtree(temp_unpack_dir, ignore_errors=True)
        shutil.move(str(nested), str(temp_unpack_dir))
        shutil.rmtree(target_dir, ignore_errors=True)
        shutil.move(str(temp_unpack_dir), str(target_dir))

    validate_dataset_structure(target_dir)


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS review_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            review_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            filename TEXT,
            reviewer_name TEXT,
            executor_name TEXT,
            status TEXT NOT NULL,
            total_defects INTEGER NOT NULL DEFAULT 0,
            accepted_count INTEGER NOT NULL DEFAULT 0,
            rejected_count INTEGER NOT NULL DEFAULT 0,
            ai_count INTEGER NOT NULL DEFAULT 0,
            manual_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS review_history_defects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            review_id TEXT NOT NULL,
            defect_id TEXT NOT NULL,
            defect_label TEXT,
            defect_type TEXT NOT NULL,
            defect_time REAL NOT NULL,
            confidence REAL NOT NULL DEFAULT 1.0,
            source TEXT NOT NULL,
            status TEXT NOT NULL,
            comment TEXT,
            x REAL,
            y REAL,
            frame_url TEXT,
            mask_url TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS training_annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            annotation_id TEXT NOT NULL,
            project_name TEXT NOT NULL DEFAULT '',
            video_id TEXT NOT NULL,
            defect_label TEXT NOT NULL,
            defect_type TEXT NOT NULL,
            defect_time REAL NOT NULL,
            comment TEXT,
            frame_url TEXT NOT NULL,
            mask_url TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS project_datasets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_name TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL DEFAULT 'manual',
            source_url TEXT NOT NULL DEFAULT '',
            zip_filename TEXT NOT NULL DEFAULT '',
            dataset_dir TEXT NOT NULL DEFAULT '',
            model_path TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS project_training_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_name TEXT NOT NULL UNIQUE,
            train_status TEXT NOT NULL DEFAULT 'idle',
            train_log_path TEXT NOT NULL DEFAULT '',
            last_error TEXT NOT NULL DEFAULT '',
            pid INTEGER,
            started_at TEXT,
            finished_at TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )

    ensure_column(cur, "review_history", "executor_name", "TEXT")
    ensure_column(cur, "review_history", "ai_count", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(cur, "review_history", "manual_count", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(cur, "review_history_defects", "defect_label", "TEXT")
    ensure_column(cur, "review_history_defects", "frame_url", "TEXT")
    ensure_column(cur, "review_history_defects", "mask_url", "TEXT")
    ensure_column(cur, "training_annotations", "comment", "TEXT")
    ensure_column(cur, "training_annotations", "project_name", "TEXT NOT NULL DEFAULT ''")

    conn.commit()
    conn.close()


init_db()


class ManualDefectCreate(BaseModel):
    video_id: str
    label: str
    time: float = Field(..., ge=0)
    type: str
    x: Optional[float] = Field(default=None, ge=0, le=1)
    y: Optional[float] = Field(default=None, ge=0, le=1)
    comment: Optional[str] = ""
    confidence: float = Field(default=1.0, ge=0, le=1)


class DefectDecisionUpdate(BaseModel):
    video_id: str
    defect_id: str
    status: Literal["accepted", "rejected"]
    comment: Optional[str] = ""


class ReviewSubmitPayload(BaseModel):
    video_id: str
    project_name: str
    reviewer_name: str = "Анна Кузнецова"
    executor_name: Optional[str] = ""
    action: Literal["submit", "close"]


class TrainingAnnotationCreate(BaseModel):
    project_name: str = ""
    video_id: str
    time: float = Field(..., ge=0)
    type: str
    name: str
    comment: Optional[str] = ""
    mask: List[List[int]]


class ManualTrainingAnnotationUpload(BaseModel):
    project_name: str
    name: str
    type: str
    comment: Optional[str] = ""
    frame_data_url: str
    mask_data_url: str


class DatasetLinkPayload(BaseModel):
    url: str = Field(..., min_length=1)


def generate_short_id(length: int = 6) -> str:
    while True:
        candidate = "".join(secrets.choice(ALPHABET) for _ in range(length))
        if candidate not in results_store:
            return candidate


def generate_defect_id(length: int = 8) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def generate_review_id(length: int = 10) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def normalize_label(label: str) -> str:
    return label.replace("_", " ").strip()


def map_yolo_class_to_defect_type(class_name: str) -> str:
    return normalize_label(class_name.lower())


def extract_center_xy(box_xyxy, frame_width: int, frame_height: int):
    x1, y1, x2, y2 = box_xyxy
    center_x = ((x1 + x2) / 2.0) / frame_width
    center_y = ((y1 + y2) / 2.0) / frame_height
    center_x = max(0.0, min(1.0, center_x))
    center_y = max(0.0, min(1.0, center_y))
    return center_x, center_y


def save_preview_frame(video_id: str, defect_id: str, frame_bgr) -> str:
    preview_name = f"{video_id}_{defect_id}.jpg"
    preview_path = PREVIEW_DIR / preview_name
    cv2.imwrite(str(preview_path), frame_bgr)
    return f"/previews/{preview_name}"


def save_mask_preview(video_id: str, defect_id: str, mask_uint8) -> str:
    mask_name = f"{video_id}_{defect_id}_mask.png"
    mask_path = PREVIEW_DIR / mask_name
    cv2.imwrite(str(mask_path), mask_uint8)
    return f"/previews/{mask_name}"


def save_annotation_frame(annotation_id: str, frame_bgr: np.ndarray) -> str:
    filename = f"{annotation_id}_frame.png"
    path = ANNOTATIONS_DIR / filename
    cv2.imwrite(str(path), frame_bgr)
    return f"/annotations/{filename}"


def save_annotation_mask(annotation_id: str, mask_uint8: np.ndarray) -> str:
    filename = f"{annotation_id}_mask.png"
    path = ANNOTATIONS_DIR / filename
    cv2.imwrite(str(path), mask_uint8)
    return f"/annotations/{filename}"


def decode_data_url_to_image(data_url: str) -> np.ndarray:
    if not data_url or "," not in data_url:
        raise ValueError("Некорректный data URL")

    _, encoded = data_url.split(",", 1)
    raw = base64.b64decode(encoded)
    image_array = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_UNCHANGED)

    if image is None:
        raise ValueError("Не удалось декодировать изображение")

    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    elif image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)

    return image


def make_defect(
    *,
    label: str,
    time_sec: float,
    defect_type: str,
    confidence: float,
    source: str,
    comment: str,
    x: Optional[float] = None,
    y: Optional[float] = None,
    frame_url: Optional[str] = None,
    mask_url: Optional[str] = None,
) -> Dict:
    return {
        "id": generate_defect_id(),
        "label": label,
        "time": round(float(time_sec), 2),
        "type": defect_type,
        "confidence": round(float(confidence), 3),
        "source": source,
        "x": None if x is None else round(float(x), 4),
        "y": None if y is None else round(float(y), 4),
        "comment": comment,
        "status": "new",
        "frame_url": frame_url,
        "mask_url": mask_url,
    }


def dedupe_defects(defects: List[Dict], time_window: float = 0.75) -> List[Dict]:
    if not defects:
        return []

    defects_sorted = sorted(defects, key=lambda d: (d["type"], d["time"]))
    deduped: List[Dict] = []

    for defect in defects_sorted:
        if not deduped:
            deduped.append(defect)
            continue

        prev = deduped[-1]
        same_type = prev["type"] == defect["type"]
        close_time = abs(prev["time"] - defect["time"]) < time_window

        if same_type and close_time:
            if defect["confidence"] > prev["confidence"]:
                deduped[-1] = defect
        else:
            deduped.append(defect)

    return sorted(deduped, key=lambda d: d["time"])


def run_yolo_inference_on_video(video_id: str, video_path: Path, frame_step_seconds: float = 1.0) -> List[Dict]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Не удалось открыть видео")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 25.0

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)
    frame_step = max(1, int(round(fps * frame_step_seconds)))

    defects: List[Dict] = []
    frame_idx = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            if frame_idx % frame_step != 0:
                frame_idx += 1
                continue

            timestamp = frame_idx / fps
            results = model.predict(source=frame, verbose=False, conf=0.25)

            if results:
                result = results[0]
                boxes = result.boxes
                names = result.names

                if boxes is not None and len(boxes) > 0:
                    for box in boxes:
                        cls_id = int(box.cls[0].item())
                        confidence = float(box.conf[0].item())
                        class_name = names.get(cls_id, f"class_{cls_id}")
                        defect_type = map_yolo_class_to_defect_type(class_name)

                        xyxy = box.xyxy[0].tolist()
                        x, y = extract_center_xy(xyxy, frame_width, frame_height)

                        defect = make_defect(
                            label=normalize_label(class_name),
                            time_sec=timestamp,
                            defect_type=defect_type,
                            confidence=confidence,
                            source="ai",
                            x=x,
                            y=y,
                            comment=f"YOLO detected: {normalize_label(class_name)}",
                        )
                        defect["frame_url"] = save_preview_frame(video_id, defect["id"], frame)
                        defects.append(defect)

            frame_idx += 1

    finally:
        cap.release()

    return dedupe_defects(defects, time_window=0.75)


def run_opencv_checks_on_video(video_id: str, video_path: Path, frame_step_seconds: float = 0.5) -> List[Dict]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Не удалось открыть видео")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 25.0

    frame_step = max(1, int(round(fps * frame_step_seconds)))

    prev_small_gray = None
    prev_mean = None
    defects: List[Dict] = []
    frame_idx = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            if frame_idx % frame_step != 0:
                frame_idx += 1
                continue

            timestamp = frame_idx / fps
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            small_gray = cv2.resize(gray, (160, 90))
            current_mean = float(np.mean(small_gray))

            if prev_small_gray is not None:
                diff = cv2.absdiff(small_gray, prev_small_gray)
                mean_diff = float(np.mean(diff))
                changed_ratio = float(np.mean(diff > 25))
                brightness_jump = abs(current_mean - (prev_mean or current_mean))

                if mean_diff < 1.2 and changed_ratio < 0.004:
                    defect = make_defect(
                        label="Freeze frame",
                        time_sec=timestamp,
                        defect_type="freeze_frame",
                        confidence=min(0.99, 0.75 + (1.2 - mean_diff) * 0.1),
                        source="ai",
                        x=0.5,
                        y=0.5,
                        comment="OpenCV detected almost identical consecutive frames",
                    )
                    defect["frame_url"] = save_preview_frame(video_id, defect["id"], frame)
                    defects.append(defect)

                if mean_diff > 32 and changed_ratio > 0.45:
                    defect = make_defect(
                        label="Frame jump",
                        time_sec=timestamp,
                        defect_type="frame_jump",
                        confidence=min(0.99, 0.65 + mean_diff / 100.0),
                        source="ai",
                        x=0.5,
                        y=0.5,
                        comment="OpenCV detected abrupt frame-wide change",
                    )
                    defect["frame_url"] = save_preview_frame(video_id, defect["id"], frame)
                    defects.append(defect)

                if brightness_jump > 18 and mean_diff > 8 and changed_ratio < 0.35:
                    defect = make_defect(
                        label="Flicker",
                        time_sec=timestamp,
                        defect_type="flicker",
                        confidence=min(0.99, 0.60 + brightness_jump / 80.0),
                        source="ai",
                        x=0.5,
                        y=0.5,
                        comment="OpenCV detected rapid brightness fluctuation",
                    )
                    defect["frame_url"] = save_preview_frame(video_id, defect["id"], frame)
                    defects.append(defect)

            prev_small_gray = small_gray
            prev_mean = current_mean
            frame_idx += 1

    finally:
        cap.release()

    return dedupe_defects(defects, time_window=1.0)


def run_unet_checks_on_video(
    video_id: str,
    video_path: Path,
    project_name: Optional[str] = None,
    frame_step_seconds: float = 1.0,
) -> List[Dict]:
    project_model_path = get_project_model_path(project_name or "")
    unet_ready = False

    if project_name and project_model_path.exists():
        try:
            if hasattr(unet_segmenter, "load_weights"):
                unet_segmenter.load_weights(str(project_model_path))
            elif hasattr(unet_segmenter, "load"):
                unet_segmenter.load(str(project_model_path))
            unet_ready = True
        except Exception as e:
            print(f"[UNET] Failed to load project model {project_model_path}: {e}")

    if not unet_ready:
        unet_ready = bool(getattr(unet_segmenter, "is_ready", False))

    if not unet_ready:
        return []

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Не удалось открыть видео")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 25.0

    frame_step = max(1, int(round(fps * frame_step_seconds)))
    defects: List[Dict] = []
    frame_idx = 0

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            if frame_idx % frame_step != 0:
                frame_idx += 1
                continue

            timestamp = frame_idx / fps
            result = unet_segmenter.segment_frame(frame)

            if result is not None:
                defect = make_defect(
                    label="Segmentation defect",
                    time_sec=timestamp,
                    defect_type="deformation_mask",
                    confidence=result["confidence"],
                    source="ai",
                    x=result["center_x"],
                    y=result["center_y"],
                    comment="U-Net detected segmented defect region",
                )
                defect["frame_url"] = save_preview_frame(video_id, defect["id"], frame)
                defect["mask_url"] = save_mask_preview(video_id, defect["id"], result["mask"])
                defects.append(defect)

            frame_idx += 1

    finally:
        cap.release()

    return dedupe_defects(defects, time_window=1.0)


def run_combined_analysis(video_id: str, video_path: Path, project_name: Optional[str] = None) -> List[Dict]:
    yolo_defects = run_yolo_inference_on_video(video_id=video_id, video_path=video_path, frame_step_seconds=1.0)
    cv_defects = run_opencv_checks_on_video(video_id=video_id, video_path=video_path, frame_step_seconds=0.5)
    unet_defects = run_unet_checks_on_video(
        video_id=video_id,
        video_path=video_path,
        project_name=project_name,
        frame_step_seconds=1.0,
    )

    all_defects = yolo_defects + cv_defects + unet_defects
    return dedupe_defects(all_defects, time_window=0.5)


def extract_frame_at_time(video_path: Path, time_sec: float) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Не удалось открыть видео для кадра")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 25.0

    frame_idx = int(round(time_sec * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None:
        raise RuntimeError("Не удалось извлечь кадр из видео")

    return frame


def build_mask_array(mask: List[List[int]]) -> np.ndarray:
    mask_np = np.array(mask, dtype=np.uint8)
    if mask_np.ndim != 2:
        raise ValueError("Маска должна быть двумерным массивом")
    return mask_np


@router.get("/health")
def health():
    return {"ok": True}


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не передан")

    video_id = generate_short_id()
    ext = Path(file.filename).suffix or ".mp4"
    saved_name = f"{video_id}{ext.lower()}"
    file_path = UPLOAD_DIR / saved_name

    content = await file.read()
    file_path.write_bytes(content)

    results_store[video_id] = {
        "video_id": video_id,
        "filename": file.filename,
        "file_path": str(file_path),
        "file_url": f"/uploads/{saved_name}",
        "status": "uploaded",
        "defects": [],
        "project_name": "",
    }

    return {
        "video_id": video_id,
        "filename": file.filename,
        "file_url": f"/uploads/{saved_name}",
        "status": "uploaded",
    }


@router.get("/analyze/{video_id}")
def analyze_video(video_id: str, project_name: str = Query(default="")):
    if video_id not in results_store:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    item = results_store[video_id]
    video_path = Path(item["file_path"])

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Файл видео не найден")

    item["status"] = "processing"
    item["project_name"] = project_name or item.get("project_name", "")

    try:
        defects = run_combined_analysis(
            video_id=video_id,
            video_path=video_path,
            project_name=project_name or None,
        )
        item["defects"] = defects
        item["status"] = "done"

        return {
            "video_id": video_id,
            "status": "done",
            "project_name": project_name,
            "defects": defects,
        }

    except Exception as e:
        item["status"] = "error"
        item["defects"] = []
        raise HTTPException(status_code=500, detail=f"Ошибка анализа: {e}")


@router.get("/result/{video_id}")
def get_result(video_id: str):
    if video_id not in results_store:
        raise HTTPException(status_code=404, detail="Результат не найден")

    item = results_store[video_id]
    return {
        "video_id": item["video_id"],
        "filename": item["filename"],
        "file_url": item["file_url"],
        "status": item["status"],
        "project_name": item.get("project_name", ""),
        "defects": item.get("defects", []),
    }


@router.post("/defects/manual")
def create_manual_defect(payload: ManualDefectCreate):
    if payload.video_id not in results_store:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    defect = {
        "id": generate_defect_id(),
        "label": payload.label,
        "time": payload.time,
        "type": payload.type,
        "confidence": payload.confidence,
        "source": "manual",
        "x": payload.x,
        "y": payload.y,
        "comment": payload.comment,
        "status": "accepted",
        "frame_url": None,
        "mask_url": None,
    }

    results_store[payload.video_id]["defects"].append(defect)
    return {"ok": True, "defect": defect}


@router.patch("/defects/decision")
def update_defect_decision(payload: DefectDecisionUpdate):
    if payload.video_id not in results_store:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    defects = results_store[payload.video_id]["defects"]
    defect = next((item for item in defects if item["id"] == payload.defect_id), None)

    if defect is None:
        raise HTTPException(status_code=404, detail="Дефект не найден")

    if defect.get("source") != "ai":
        raise HTTPException(status_code=400, detail="Решение доступно только для AI-дефектов")

    defect["status"] = payload.status
    defect["comment"] = (payload.comment or "").strip() if payload.status == "accepted" else ((payload.comment or "").strip() or "Дефект не подтверждён")

    return {"ok": True, "defect": defect}


@router.post("/training/annotation")
def create_training_annotation(payload: TrainingAnnotationCreate):
    if payload.video_id not in results_store:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    item = results_store[payload.video_id]
    video_path = Path(item["file_path"])

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Файл видео не найден")

    try:
        frame = extract_frame_at_time(video_path, payload.time)
        mask_np = build_mask_array(payload.mask)

        frame_height, frame_width = frame.shape[:2]
        if mask_np.shape[0] != frame_height or mask_np.shape[1] != frame_width:
            mask_np = cv2.resize(mask_np, (frame_width, frame_height), interpolation=cv2.INTER_NEAREST)

        annotation_id = str(uuid.uuid4())
        frame_url = save_annotation_frame(annotation_id, frame)
        mask_url = save_annotation_mask(annotation_id, mask_np)

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO training_annotations (
                annotation_id,
                project_name,
                video_id,
                defect_label,
                defect_type,
                defect_time,
                comment,
                frame_url,
                mask_url,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                annotation_id,
                (payload.project_name or "").strip(),
                payload.video_id,
                payload.name.strip(),
                payload.type.strip(),
                payload.time,
                (payload.comment or "").strip(),
                frame_url,
                mask_url,
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
        conn.close()

        return {
            "ok": True,
            "annotation_id": annotation_id,
            "frame_url": frame_url,
            "mask_url": mask_url,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка сохранения annotation: {e}")


@router.post("/training/annotation/manual-upload")
def create_training_annotation_from_files(payload: ManualTrainingAnnotationUpload):
    try:
        frame = decode_data_url_to_image(payload.frame_data_url)
        mask = decode_data_url_to_image(payload.mask_data_url)

        frame_height, frame_width = frame.shape[:2]
        mask_gray = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
        if mask_gray.shape[0] != frame_height or mask_gray.shape[1] != frame_width:
            mask_gray = cv2.resize(mask_gray, (frame_width, frame_height), interpolation=cv2.INTER_NEAREST)

        annotation_id = str(uuid.uuid4())
        frame_url = save_annotation_frame(annotation_id, frame)
        mask_url = save_annotation_mask(annotation_id, mask_gray)

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO training_annotations (
                annotation_id,
                project_name,
                video_id,
                defect_label,
                defect_type,
                defect_time,
                comment,
                frame_url,
                mask_url,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                annotation_id,
                (payload.project_name or "").strip(),
                "",
                payload.name.strip(),
                payload.type.strip(),
                0.0,
                (payload.comment or "").strip(),
                frame_url,
                mask_url,
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
        conn.close()

        return {
            "ok": True,
            "annotation_id": annotation_id,
            "frame_url": frame_url,
            "mask_url": mask_url,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка загрузки manual annotation: {e}")


@router.get("/training/annotations")
def get_training_annotations(project_name: str = Query(default="")):
    conn = get_conn()
    cur = conn.cursor()

    if project_name.strip():
        rows = cur.execute(
            """
            SELECT
                annotation_id,
                project_name,
                video_id,
                defect_label,
                defect_type,
                defect_time,
                comment,
                frame_url,
                mask_url,
                created_at
            FROM training_annotations
            WHERE project_name = ?
            ORDER BY id DESC
            """,
            (project_name.strip(),),
        ).fetchall()
    else:
        rows = cur.execute(
            """
            SELECT
                annotation_id,
                project_name,
                video_id,
                defect_label,
                defect_type,
                defect_time,
                comment,
                frame_url,
                mask_url,
                created_at
            FROM training_annotations
            ORDER BY id DESC
            """
        ).fetchall()

    items = [
        {
            "id": row["annotation_id"],
            "project_name": row["project_name"],
            "video_id": row["video_id"],
            "name": row["defect_label"],
            "type": row["defect_type"],
            "time": row["defect_time"],
            "comment": row["comment"] or "",
            "frame_url": row["frame_url"],
            "mask_url": row["mask_url"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]

    conn.close()
    return {"count": len(items), "items": items}


@router.delete("/training/annotation/{annotation_id}")
def delete_training_annotation(annotation_id: str):
    conn = get_conn()
    cur = conn.cursor()

    row = cur.execute(
        """
        SELECT frame_url, mask_url
        FROM training_annotations
        WHERE annotation_id = ?
        """,
        (annotation_id,),
    ).fetchone()

    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Annotation не найден")

    frame_url = row["frame_url"]
    mask_url = row["mask_url"]

    cur.execute(
        "DELETE FROM training_annotations WHERE annotation_id = ?",
        (annotation_id,),
    )
    conn.commit()
    conn.close()

    if frame_url:
        frame_path = BASE_DIR / frame_url.lstrip("/")
        if frame_path.exists():
            frame_path.unlink()

    if mask_url:
        mask_path = BASE_DIR / mask_url.lstrip("/")
        if mask_path.exists():
            mask_path.unlink()

    return {"ok": True, "deleted": annotation_id}


@router.get("/training/export")
def export_training_dataset(project_name: str = Query(default="")):
    conn = get_conn()
    cur = conn.cursor()

    if project_name.strip():
        rows = cur.execute(
            """
            SELECT
                annotation_id,
                project_name,
                video_id,
                defect_label,
                defect_type,
                defect_time,
                comment,
                frame_url,
                mask_url,
                created_at
            FROM training_annotations
            WHERE project_name = ?
            ORDER BY id DESC
            """,
            (project_name.strip(),),
        ).fetchall()
    else:
        rows = cur.execute(
            """
            SELECT
                annotation_id,
                project_name,
                video_id,
                defect_label,
                defect_type,
                defect_time,
                comment,
                frame_url,
                mask_url,
                created_at
            FROM training_annotations
            ORDER BY id DESC
            """
        ).fetchall()

    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="Датасет пуст")

    export_suffix = project_name.strip() or "all_projects"
    safe_suffix = slugify_project_name(export_suffix)
    export_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    export_root = EXPORTS_DIR / f"dataset_{safe_suffix}_{export_id}"
    images_dir = export_root / "images"
    masks_dir = export_root / "masks"
    images_dir.mkdir(parents=True, exist_ok=True)
    masks_dir.mkdir(parents=True, exist_ok=True)

    meta_items = []

    for row in rows:
        annotation_id = row["annotation_id"]
        frame_src = BASE_DIR / row["frame_url"].lstrip("/")
        mask_src = BASE_DIR / row["mask_url"].lstrip("/")

        frame_dst_name = f"{annotation_id}.png"
        mask_dst_name = f"{annotation_id}.png"

        frame_dst = images_dir / frame_dst_name
        mask_dst = masks_dir / mask_dst_name

        if frame_src.exists():
            shutil.copy2(frame_src, frame_dst)
        if mask_src.exists():
            shutil.copy2(mask_src, mask_dst)

        meta_items.append(
            {
                "id": annotation_id,
                "project_name": row["project_name"],
                "video_id": row["video_id"],
                "name": row["defect_label"],
                "type": row["defect_type"],
                "time": row["defect_time"],
                "comment": row["comment"] or "",
                "image": f"images/{frame_dst_name}",
                "mask": f"masks/{mask_dst_name}",
                "created_at": row["created_at"],
            }
        )

    meta_path = export_root / "meta.json"
    meta_path.write_text(json.dumps(meta_items, ensure_ascii=False, indent=2), encoding="utf-8")

    zip_path = EXPORTS_DIR / f"dataset_{safe_suffix}_{export_id}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in export_root.rglob("*"):
            if file_path.is_file():
                zip_file.write(file_path, file_path.relative_to(export_root))

    shutil.rmtree(export_root, ignore_errors=True)

    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=zip_path.name,
    )


@router.post("/projects/{project_name}/dataset/upload")
async def upload_project_dataset(project_name: str, file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл датасета не передан")

    ext = Path(file.filename).suffix.lower()
    if ext != ".zip":
        raise HTTPException(status_code=400, detail="Нужен ZIP архив датасета")

    project_root = get_project_dataset_root(project_name)
    project_root.mkdir(parents=True, exist_ok=True)

    saved_zip_path = project_root / "source_dataset.zip"
    current_dataset_dir = get_project_dataset_current_dir(project_name)

    content = await file.read()
    saved_zip_path.write_bytes(content)

    extract_dataset_zip(saved_zip_path, current_dataset_dir)
    dataset_info = validate_dataset_structure(current_dataset_dir)

    save_project_dataset_record(
        project_name=project_name,
        source_type="zip",
        dataset_dir=current_dataset_dir,
        zip_filename=file.filename,
    )

    return {
        "ok": True,
        "project_name": project_name,
        "source_type": "zip",
        "zip_filename": file.filename,
        "dataset_dir": str(current_dataset_dir),
        "items_count": dataset_info["items_count"],
    }


@router.post("/projects/{project_name}/dataset/link")
def attach_project_dataset_link(project_name: str, payload: DatasetLinkPayload):
    parsed = urllib.parse.urlparse(payload.url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Ссылка должна начинаться с http:// или https://")

    project_root = get_project_dataset_root(project_name)
    project_root.mkdir(parents=True, exist_ok=True)

    saved_zip_path = project_root / "source_dataset_from_link.zip"
    current_dataset_dir = get_project_dataset_current_dir(project_name)

    try:
        with urllib.request.urlopen(payload.url.strip(), timeout=30) as response:
            content = response.read()
        saved_zip_path.write_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Не удалось скачать архив по ссылке: {e}")

    extract_dataset_zip(saved_zip_path, current_dataset_dir)
    dataset_info = validate_dataset_structure(current_dataset_dir)

    save_project_dataset_record(
        project_name=project_name,
        source_type="link",
        dataset_dir=current_dataset_dir,
        source_url=payload.url.strip(),
        zip_filename=saved_zip_path.name,
    )

    return {
        "ok": True,
        "project_name": project_name,
        "source_type": "link",
        "source_url": payload.url.strip(),
        "dataset_dir": str(current_dataset_dir),
        "items_count": dataset_info["items_count"],
    }


@router.get("/projects/{project_name}/dataset/status")
def get_project_dataset_status(project_name: str):
    conn = get_conn()
    cur = conn.cursor()

    row = cur.execute(
        """
        SELECT
            project_name,
            source_type,
            source_url,
            zip_filename,
            dataset_dir,
            model_path,
            created_at,
            updated_at
        FROM project_datasets
        WHERE project_name = ?
        """,
        (project_name,),
    ).fetchone()

    conn.close()

    if row is None:
        return {
            "project_name": project_name,
            "has_dataset": False,
            "has_model": get_project_model_path(project_name).exists(),
        }

    dataset_dir = Path(row["dataset_dir"]) if row["dataset_dir"] else None
    info = None
    if dataset_dir and dataset_dir.exists():
        try:
            info = validate_dataset_structure(dataset_dir)
        except Exception:
            info = None

    return {
        "project_name": row["project_name"],
        "has_dataset": True,
        "source_type": row["source_type"],
        "source_url": row["source_url"],
        "zip_filename": row["zip_filename"],
        "dataset_dir": row["dataset_dir"],
        "model_path": row["model_path"],
        "has_model": Path(row["model_path"]).exists() if row["model_path"] else False,
        "items_count": info["items_count"] if info else 0,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.post("/projects/{project_name}/train")
def train_project_model(project_name: str):
    conn = get_conn()
    cur = conn.cursor()

    dataset_row = cur.execute(
        """
        SELECT dataset_dir
        FROM project_datasets
        WHERE project_name = ?
        """,
        (project_name,),
    ).fetchone()

    if dataset_row is None or not dataset_row["dataset_dir"]:
        conn.close()
        raise HTTPException(status_code=404, detail="Для проекта не найден подключённый датасет")

    dataset_dir = Path(dataset_row["dataset_dir"])
    validate_dataset_structure(dataset_dir)

    train_row = cur.execute(
        """
        SELECT
            project_name,
            train_status,
            train_log_path,
            last_error,
            pid,
            started_at,
            finished_at,
            updated_at
        FROM project_training_status
        WHERE project_name = ?
        """,
        (project_name,),
    ).fetchone()

    if train_row and train_row["train_status"] == "training" and is_process_alive(train_row["pid"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Обучение уже запущено для этого проекта")

    log_path = TRAINING_LOGS_DIR / f"train_{slugify_project_name(project_name)}.log"
    if log_path.exists():
        log_path.unlink()

    now = datetime.utcnow().isoformat()
    model_path = get_project_model_path(project_name)

    if model_path.exists():
        model_path.unlink()

    with open(log_path, "w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [
                sys.executable,
                str(TRAIN_SCRIPT_PATH),
                "--dataset",
                str(dataset_dir),
                "--project",
                project_name,
            ],
            stdout=log_file,
            stderr=log_file,
            cwd=str(BASE_DIR),
        )

    if train_row:
        cur.execute(
            """
            UPDATE project_training_status
            SET
                train_status = ?,
                train_log_path = ?,
                last_error = '',
                pid = ?,
                started_at = ?,
                finished_at = NULL,
                updated_at = ?
            WHERE project_name = ?
            """,
            (
                "training",
                str(log_path),
                process.pid,
                now,
                now,
                project_name,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO project_training_status (
                project_name,
                train_status,
                train_log_path,
                last_error,
                pid,
                started_at,
                finished_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_name,
                "training",
                str(log_path),
                "",
                process.pid,
                now,
                None,
                now,
            ),
        )

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "project_name": project_name,
        "train_status": "training",
        "pid": process.pid,
        "log_path": str(log_path),
        "model_path": str(model_path),
    }


@router.get("/projects/{project_name}/train-status")
def get_project_train_status(project_name: str):
    status = refresh_project_training_status(project_name)

    if status is None:
        return {
            "project_name": project_name,
            "train_status": "idle",
            "has_model": get_project_model_path(project_name).exists(),
            "model_path": str(get_project_model_path(project_name)),
        }

    return {
        "project_name": project_name,
        "train_status": status["train_status"],
        "has_model": get_project_model_path(project_name).exists(),
        "model_path": str(get_project_model_path(project_name)),
        "log_path": status["train_log_path"],
        "last_error": status["last_error"],
        "pid": status["pid"],
        "started_at": status["started_at"],
        "finished_at": status["finished_at"],
        "updated_at": status["updated_at"],
    }


@router.post("/reviews/submit")
def submit_review(payload: ReviewSubmitPayload):
    if payload.video_id not in results_store:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    current = results_store[payload.video_id]
    defects = current.get("defects", [])

    total_defects = len(defects)
    accepted_count = len([d for d in defects if d.get("status") == "accepted"])
    rejected_count = len([d for d in defects if d.get("status") == "rejected"])
    ai_count = len([d for d in defects if d.get("source") == "ai"])
    manual_count = len([d for d in defects if d.get("source") == "manual"])

    review_id = generate_review_id()
    created_at = datetime.utcnow().isoformat()
    final_status = "submitted" if payload.action == "submit" else "closed"

    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO review_history (
            review_id,
            video_id,
            project_name,
            filename,
            reviewer_name,
            executor_name,
            status,
            total_defects,
            accepted_count,
            rejected_count,
            ai_count,
            manual_count,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            review_id,
            payload.video_id,
            payload.project_name.strip() or "Без названия",
            current.get("filename"),
            payload.reviewer_name,
            (payload.executor_name or "").strip(),
            final_status,
            total_defects,
            accepted_count,
            rejected_count,
            ai_count,
            manual_count,
            created_at,
        ),
    )

    for defect in defects:
        cur.execute(
            """
            INSERT INTO review_history_defects (
                review_id,
                defect_id,
                defect_label,
                defect_type,
                defect_time,
                confidence,
                source,
                status,
                comment,
                x,
                y,
                frame_url,
                mask_url
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                review_id,
                defect.get("id"),
                defect.get("label"),
                defect.get("type"),
                defect.get("time", 0),
                defect.get("confidence", 1.0),
                defect.get("source", "ai"),
                defect.get("status", "new"),
                defect.get("comment", ""),
                defect.get("x"),
                defect.get("y"),
                defect.get("frame_url"),
                defect.get("mask_url"),
            ),
        )

    conn.commit()
    conn.close()

    return {"ok": True, "review_id": review_id, "status": final_status}


@router.get("/reviews/history")
def get_reviews_history():
    conn = get_conn()
    cur = conn.cursor()

    rows = cur.execute(
        """
        SELECT
            review_id,
            video_id,
            project_name,
            filename,
            reviewer_name,
            executor_name,
            status,
            total_defects,
            accepted_count,
            rejected_count,
            ai_count,
            manual_count,
            created_at
        FROM review_history
        ORDER BY id DESC
        """
    ).fetchall()

    items = [dict(row) for row in rows]
    conn.close()

    return {"items": items}


@router.get("/reviews/{review_id}")
def get_review_detail(review_id: str):
    conn = get_conn()
    cur = conn.cursor()

    review_row = cur.execute(
        """
        SELECT
            review_id,
            video_id,
            project_name,
            filename,
            reviewer_name,
            executor_name,
            status,
            total_defects,
            accepted_count,
            rejected_count,
            ai_count,
            manual_count,
            created_at
        FROM review_history
        WHERE review_id = ?
        LIMIT 1
        """,
        (review_id,),
    ).fetchone()

    if review_row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Review не найден")

    defect_rows = cur.execute(
        """
        SELECT
            defect_id,
            defect_label,
            defect_type,
            defect_time,
            confidence,
            source,
            status,
            comment,
            x,
            y,
            frame_url,
            mask_url
        FROM review_history_defects
        WHERE review_id = ?
        ORDER BY defect_time ASC, id ASC
        """,
        (review_id,),
    ).fetchall()

    defects = [
        {
            "id": row["defect_id"],
            "label": row["defect_label"],
            "time": row["defect_time"],
            "type": row["defect_type"],
            "confidence": row["confidence"],
            "source": row["source"],
            "status": row["status"],
            "comment": row["comment"] or "",
            "x": row["x"],
            "y": row["y"],
            "frame_url": row["frame_url"],
            "mask_url": row["mask_url"],
        }
        for row in defect_rows
    ]

    review = dict(review_row)
    conn.close()

    return {"review": review, "defects": defects}