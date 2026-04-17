from pathlib import Path
from typing import List, Dict
import argparse
import json
import os

import cv2
import numpy as np
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader
import segmentation_models_pytorch as smp


BASE_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


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


class QCDataset(Dataset):
    def __init__(self, dataset_dir: str, image_size: int = 256):
        self.dataset_dir = Path(dataset_dir)
        self.image_size = image_size

        meta_path = self.dataset_dir / "meta.json"
        if not meta_path.exists():
            raise FileNotFoundError(f"meta.json not found: {meta_path}")

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        if not isinstance(meta, list) or not meta:
            raise ValueError("meta.json must contain a non-empty list")

        self.items: List[Dict] = []
        for item in meta:
            image_rel = item.get("image")
            mask_rel = item.get("mask")
            if not image_rel or not mask_rel:
                continue

            image_path = self.dataset_dir / image_rel
            mask_path = self.dataset_dir / mask_rel

            if image_path.exists() and mask_path.exists():
                self.items.append(
                    {
                        "image_path": image_path,
                        "mask_path": mask_path,
                    }
                )

        if not self.items:
            raise ValueError("No valid dataset items found in meta.json")

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int):
        item = self.items[index]

        image = cv2.imread(str(item["image_path"]), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Failed to read image: {item['image_path']}")
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        mask = cv2.imread(str(item["mask_path"]), cv2.IMREAD_GRAYSCALE)
        if mask is None:
            raise ValueError(f"Failed to read mask: {item['mask_path']}")

        image = cv2.resize(image, (self.image_size, self.image_size), interpolation=cv2.INTER_AREA)
        mask = cv2.resize(mask, (self.image_size, self.image_size), interpolation=cv2.INTER_NEAREST)

        image = image.astype(np.float32) / 255.0
        image = np.transpose(image, (2, 0, 1))

        mask = (mask > 0).astype(np.float32)
        mask = np.expand_dims(mask, axis=0)

        return torch.tensor(image, dtype=torch.float32), torch.tensor(mask, dtype=torch.float32)


def build_model() -> nn.Module:
    model = smp.Unet(
        encoder_name="resnet18",
        encoder_weights="imagenet",
        in_channels=3,
        classes=1,
    )
    return model


def train(dataset_dir: str, project_name: str, epochs: int = 5, batch_size: int = 4, lr: float = 1e-3):
    dataset_path = Path(dataset_dir)
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset path not found: {dataset_path}")

    print(f"[TRAIN] Dataset: {dataset_path}")
    print(f"[TRAIN] Project: {project_name}")

    dataset = QCDataset(str(dataset_path))
    dataloader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,
    )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[TRAIN] Device: {device}")
    print(f"[TRAIN] Samples: {len(dataset)}")

    model = build_model().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = smp.losses.DiceLoss(mode="binary")

    model.train()
    for epoch in range(epochs):
        epoch_loss = 0.0

        for images, masks in dataloader:
            images = images.to(device)
            masks = masks.to(device)

            optimizer.zero_grad()
            logits = model(images)
            loss = criterion(logits, masks)
            loss.backward()
            optimizer.step()

            epoch_loss += float(loss.item())

        avg_loss = epoch_loss / max(1, len(dataloader))
        print(f"[TRAIN] Epoch {epoch + 1}/{epochs} - loss: {avg_loss:.6f}")

    model_slug = slugify_project_name(project_name)
    save_path = MODELS_DIR / f"unet_{model_slug}.pt"

    torch.save(
        {
            "project_name": project_name,
            "model_slug": model_slug,
            "image_size": dataset.image_size,
            "state_dict": model.state_dict(),
        },
        save_path,
    )

    print(f"[TRAIN] Saved model: {save_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to dataset directory")
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    train(
        dataset_dir=args.dataset,
        project_name=args.project,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
    )


if __name__ == "__main__":
    main()