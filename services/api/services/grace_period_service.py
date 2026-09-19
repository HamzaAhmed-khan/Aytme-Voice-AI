"""
🔐 Grace Period Management Service

Background job that runs periodically (every hour) to:
1. Find organizations with expired grace periods
2. Downgrade them to Free plan
3. Log the action
4. Notify the organization (future: email notification)

This prevents organizations from indefinitely staying on grace period
and ensures billing integrity.
"""

import asyncio
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, and_
from app.core.config import settings
from app.models.models import GracePeriod, Subscription
from app.services.billing_service import BillingService

logger = logging.getLogger(__name__)


class GracePeriodService:
    """Service to manage grace period expirations and downgrade organizations"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def process_expired_grace_periods(self) -> int:
        """
        Process all expired grace periods
        
        Returns: Number of organizations downgraded
        """
        try:
            # Find all expired grace periods
            result = await self.db.execute(
                select(GracePeriod).where(
                    and_(
                        GracePeriod.is_active == True,
                        GracePeriod.expires_at <= datetime.utcnow()
                    )
                )
            )
            expired_grace_periods = result.scalars().all()
            
            if not expired_grace_periods:
                logger.debug("No expired grace periods to process")
                return 0
            
            logger.info(f"Processing {len(expired_grace_periods)} expired grace periods")
            
            downgraded_count = 0
            billing_service = BillingService(self.db)
            
            for grace_period in expired_grace_periods:
                try:
                    # Downgrade to Free plan
                    success = await billing_service.handle_grace_period_expiry(grace_period.org_id)
                    
                    if success:
                        downgraded_count += 1
                        logger.info(
                            f"Grace period processed: org {grace_period.org_id} downgraded to Free "
                            f"(expires_at: {grace_period.expires_at})"
                        )
                        
                        # Mark grace period as resolved
                        grace_period.is_active = False
                        grace_period.resolved_at = datetime.utcnow()
                        grace_period.resolution_reason = "grace_period_expired_auto_downgrade"
                    else:
                        logger.warning(
                            f"Failed to downgrade org {grace_period.org_id} after grace period expiry"
                        )
                
                except Exception as e:
                    logger.error(
                        f"Error processing grace period for org {grace_period.org_id}: {str(e)}",
                        exc_info=True
                    )
                    # Continue to next grace period instead of failing
                    continue
            
            await self.db.commit()
            logger.info(f"Grace period processing complete: {downgraded_count} organizations downgraded")
            return downgraded_count
        
        except Exception as e:
            logger.error(f"Error processing expired grace periods: {str(e)}", exc_info=True)
            return 0


async def run_grace_period_cleanup():
    """
    Background job: Run grace period cleanup
    
    Should be called periodically (e.g., every hour from main.py lifespan):
    
    ```python
    # In main.py lifespan
    async def delayed_startup():
        await asyncio.sleep(2)
        try:
            from app.services.grace_period_service import run_grace_period_cleanup
            while True:
                await run_grace_period_cleanup()
                await asyncio.sleep(3600)  # Every hour
        except Exception as e:
            logger.error(f"Grace period cleanup failed: {e}")
    ```
    """
    try:
        # Create database engine
        engine = create_async_engine(settings.DATABASE_URL, echo=False)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        
        async with async_session() as session:
            grace_period_service = GracePeriodService(session)
            downgraded = await grace_period_service.process_expired_grace_periods()
            logger.info(f"Grace period cleanup completed: {downgraded} orgs downgraded")
        
        await engine.dispose()
    
    except Exception as e:
        logger.error(f"Grace period cleanup error: {str(e)}", exc_info=True)


async def background_grace_period_monitor():
    """
    Run grace period monitoring loop (to be called from main.py lifespan)
    
    Runs every hour to check for expired grace periods
    """
    while True:
        try:
            await run_grace_period_cleanup()
            await asyncio.sleep(3600)  # Every hour
        except Exception as e:
            logger.error(f"Error in grace period monitoring loop: {str(e)}")
            await asyncio.sleep(300)  # Retry after 5 minutes on error
