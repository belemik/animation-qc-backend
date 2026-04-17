from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal


class VideoUploadResponse(BaseModel):
    id: int
    filename: str
    original_name: str
    created_at: datetime


class AnalysisCreateRequest(BaseModel):
    video_asset_id: int


class AnalysisCreateResponse(BaseModel):
    job_id: int
    status: str


class DefectResponse(BaseModel):
    id: int
    frame_index: int
    timecode_sec: float
    defect_type: str
    confidence: float
    x: float
    y: float
    width: float
    height: float
    status: str
    comment: str | None = None
    source: str

    class Config:
        from_attributes = True


class AnalysisResponse(BaseModel):
    id: int
    video_asset_id: int
    status: str
    created_at: datetime
    completed_at: datetime | None = None
    defects: list[DefectResponse]

    class Config:
        from_attributes = True


class DefectReviewRequest(BaseModel):
    status: Literal["confirmed", "rejected"]
    comment: str | None = None


class ManualDefectCreateRequest(BaseModel):
    frame_index: int = Field(ge=0)
    timecode_sec: float = Field(ge=0)
    defect_type: str
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    comment: str | None = None