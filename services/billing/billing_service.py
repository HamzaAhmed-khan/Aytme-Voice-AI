import logging
from typing import Optional, Dict, Any
from .paypal_service import paypal_client
from app.core.config import settings

logger = logging.getLogger(__name__)

class BillingService:
    """
    Unified Billing Service for AYTME.
    Currently defaults to PayPal as the primary provider.
    """
    
    def __init__(self, provider: str = "paypal"):
        self.provider = provider
        self.client = paypal_client if provider == "paypal" else None

    async def create_subscription(
        self, 
        plan_id: str, 
        org_id: str, 
        return_url: str, 
        cancel_url: str
    ) -> Dict[str, Any]:
        """
        Create a subscription using the active provider.
        """
        if not self.client:
            raise Exception(f"Billing provider '{self.provider}' not supported or configured.")
            
        logger.info(f"[BILLING] Creating {self.provider} subscription for org {org_id}")
        return await self.client.create_subscription(plan_id, org_id, return_url, cancel_url)

    async def get_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """
        Retrieve subscription details.
        """
        if not self.client:
            raise Exception("No active billing client.")
        return await self.client.get_subscription_details(subscription_id)

    async def cancel_subscription(self, subscription_id: str, reason: str = "User requested") -> bool:
        """
        Cancel an active subscription.
        """
        if not self.client:
            raise Exception("No active billing client.")
        return await self.client.cancel_subscription(subscription_id, reason)

    def get_provider_info(self) -> Dict[str, Any]:
        """
        Return metadata about the current billing provider.
        """
        return {
            "provider": self.provider,
            "is_active": self.client is not None,
            "management_url": None # Management handled via AYTME UI for PayPal
        }

# Singleton instance
billing_service = BillingService(provider="paypal")
