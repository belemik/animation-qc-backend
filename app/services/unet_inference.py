from pathlib import Path
from typing import Optional, Dict

import cv2
import numpy as np
import torch
import segmentation_models_pytorch as smp


BASE_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def build_unet_model():
    return smp.Unet(
        encoder_name="resnet18",
        encoder_weights=None,
        in_channels=3,
        classes=1,
    )


class UNETSegmenter:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.is_ready = False
        self.image_size = 256
        self.loaded_model_path: Optional[str] = None

        default_model_path = MODELS_DIR / "unet_defect.pt"
        if default_model_path.exists():
            try:
                self.load_weights(str(default_model_path))
                print(f"[UNET] Loaded fallback model: {default_model_path}")
            except Exception as e:
                self.is_ready = False
                self.model = None
                print(f"[UNET] Failed to load fallback model: {e}")
        else:
            print(f"[UNET] Weights not found, skip segmentation: {default_model_path}")

    def load(self, model_path: str):
        self.load_weights(model_path)

    def load_weights(self, model_path: str):
        model_path_obj = Path(model_path)
        if not model_path_obj.exists():
            raise FileNotFoundError(f"UNET weights not found: {model_path_obj}")

        checkpoint = torch.load(model_path_obj, map_location=self.device)

        model = build_unet_model()

        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            state_dict = checkpoint["state_dict"]
            image_size = checkpoint.get("image_size", 256)
        else:
            state_dict = checkpoint
            image_size = 256

        model.load_state_dict(state_dict)
        model.to(self.device)
        model.eval()

        self.model = model
        self.image_size = int(image_size)
        self.loaded_model_path = str(model_path_obj)
        self.is_ready = True

        print(f"[UNET] Model loaded: {model_path_obj}")

    def _prepare_image(self, frame_bgr: np.ndarray):
        original_h, original_w = frame_bgr.shape[:2]

        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(
            frame_rgb,
            (self.image_size, self.image_size),
            interpolation=cv2.INTER_AREA,
        )

        image = resized.astype(np.float32) / 255.0
        image = np.transpose(image, (2, 0, 1))
        image = np.expand_dims(image, axis=0)

        tensor = torch.tensor(image, dtype=torch.float32, device=self.device)
        return tensor, original_w, original_h

    def segment_frame(self, frame_bgr: np.ndarray) -> Optional[Dict]:
        if not self.is_ready or self.model is None:
            return None

        if frame_bgr is None or frame_bgr.size == 0:
            return None

        tensor, original_w, original_h = self._prepare_image(frame_bgr)

        with torch.no_grad():
            logits = self.model(tensor)
            probs = torch.sigmoid(logits)[0, 0].detach().cpu().numpy()

        binary_mask = (probs > 0.5).astype(np.uint8) * 255
        confidence = float(probs.max())

        if confidence < 0.5:
            return None

        mask_resized = cv2.resize(
            binary_mask,
            (original_w, original_h),
            interpolation=cv2.INTER_NEAREST,
        )

        coords = cv2.findNonZero(mask_resized)
        if coords is None:
            return None

        x, y, w, h = cv2.boundingRect(coords)
        center_x = (x + w / 2.0) / max(1, original_w)
        center_y = (y + h / 2.0) / max(1, original_h)

        center_x = float(max(0.0, min(1.0, center_x)))
        center_y = float(max(0.0, min(1.0, center_y)))

        return {
            "mask": mask_resized,
            "confidence": round(confidence, 4),
            "center_x": center_x,
            "center_y": center_y,
        }


unet_segmenter = UNETSegmenter()