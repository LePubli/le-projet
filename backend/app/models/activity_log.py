from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.sql import func
from app.db.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False)
    user_role = Column(String, nullable=False)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=True)
    entity_label = Column(String, nullable=True)
    changes = Column(JSON, nullable=True)  # {"field": {"before": ..., "after": ...}}
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
