from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Organization
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

class CustomDomainService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    @lru_cache(maxsize=1000)
    def _get_cache():
        # Using a simple dict as an async-safe cache would be better, 
        # but for this scale a static cache with TTL logic or Redis is preferred.
        # This is a placeholder for the caching logic.
        return {}

    async def resolve_domain(self, hostname: str) -> str:
        """Resolve a hostname to an Organization ID."""
        # Check cache first (Simulated)
        # if hostname in self._get_cache(): return self._get_cache()[hostname]

        result = await self.db.execute(
            select(Organization.id).where(Organization.custom_domain == hostname)
        )
        org_id = result.scalar_one_or_none()
        
        if org_id:
            logger.info(f"Resolved custom domain {hostname} to org {org_id}")
            # self._get_cache()[hostname] = str(org_id)
            return str(org_id)
        
        return None

custom_domain_service = CustomDomainService
