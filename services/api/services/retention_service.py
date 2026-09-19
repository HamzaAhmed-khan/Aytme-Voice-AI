import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy import select, delete
from app.core.database import SessionLocal
from app.models.models import Organization, Room, Transcript, TTSArtifact

logger = logging.getLogger("retention_service")

async def run_data_retention_cleanup():
    """
    Section 11.3: Data Retention & Archival.
    Deletes old transcripts based on organization settings.
    """
    logger.info("Starting Data Retention Cleanup...")
    
    while True:
        try:
            async with SessionLocal() as db:
                # 1. Fetch all organizations
                result = await db.execute(select(Organization))
                orgs = result.scalars().all()
                
                for org in orgs:
                    retention_days = org.transcript_retention_days
                    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
                    
                    # 2. Find rooms for this org
                    room_stmt = select(Room.id).where(Room.org_id == org.id)
                    room_ids = (await db.execute(room_stmt)).scalars().all()
                    
                    if room_ids:
                        # 3. Delete transcripts older than cutoff
                        # Note: We might want to archive to S3 before deleting in a real production app
                        delete_stmt = delete(Transcript).where(
                            Transcript.room_id.in_(room_ids),
                            Transcript.created_at < cutoff_date
                        )
                        deleted = await db.execute(delete_stmt)
                        
                        if deleted.rowcount > 0:
                            logger.info(f"Cleaned up {deleted.rowcount} transcripts for Org {org.name} (Retention: {retention_days} days)")
                
                await db.commit()
                
        except Exception as e:
            logger.error(f"Error in data retention cleanup: {e}")
            
        # Run once a day
        await asyncio.sleep(86400)
