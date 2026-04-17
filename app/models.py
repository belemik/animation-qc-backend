from sqlalchemy import Column, Integer, String, Float, Text
from app.db import Base


class ProjectAnalysis(Base):
    __tablename__ = "project_analysis"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String, unique=True, index=True)
    project_name = Column(String, nullable=True)
    filename = Column(String, nullable=True)
    analyzed_at = Column(String, nullable=True)
    saved_at = Column(String, nullable=True)
    project_status = Column(String, nullable=True)  # in_progress / accepted / rework
    defects_count = Column(Integer, default=0)
    reviewer = Column(String, nullable=True)


class SavedDefect(Base):
    __tablename__ = "saved_defect"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String, index=True)
    defect_time = Column(Float)
    defect_type = Column(String)
    confidence = Column(Float, nullable=True)
    comment = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # ai / manual


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String, index=True)
    defect_time = Column(Float)
    defect_type = Column(String)
    confidence = Column(Float)
    action = Column(String)
    comment = Column(Text, nullable=True)
    reviewer = Column(String, nullable=True)
    source = Column(String, nullable=True)
    reviewed_at = Column(String, nullable=True)