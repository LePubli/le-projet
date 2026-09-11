from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.db.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, nullable=False, default="info")
    entity_type = Column(String, nullable=True)
    entity_id = Column(Integer, nullable=True)
    target_roles = Column(JSON, nullable=True)  # None = broadcast à tous
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class NotificationRead(Base):
    __tablename__ = "notification_reads"

    id = Column(Integer, primary_key=True, index=True)
    notification_id = Column(
        Integer, ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False
    )
    username = Column(String, nullable=False, index=True)
