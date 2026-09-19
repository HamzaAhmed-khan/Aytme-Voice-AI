import httpx
import os
import base64
import time
import logging
import asyncio
import uuid
import json
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

def resolve_secret(value):
    if hasattr(value, "get_secret_value"):
        return value.get_secret_value()
    return value

class PayPalClient:
    """
    Async PayPal client for Subscriptions API (v1/billing)
    """
    def __init__(self):
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0
        self._token_lock = asyncio.Lock()

    @property
    def base_url(self) -> str:
        env = settings.PAYPAL_ENV.lower()
        if env == "live":
            return "https://api-m.paypal.com"
        # Everything else goes to sandbox for safety
        return "https://api-m.sandbox.paypal.com"

    async def get_access_token(self) -> str:
        """
        Get OAuth2 access token with basic caching and concurrency locking
        """
        # 1. Quick check outside the lock
        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token
            
        async with self._token_lock:
            # 2. Re-check after acquiring lock to prevent redundant refreshes
            if self._access_token and time.time() < self._token_expires_at - 60:
                return self._access_token

            client_id = settings.PAYPAL_CLIENT_ID
            secret = resolve_secret(settings.PAYPAL_SECRET) if settings.PAYPAL_SECRET else None

            if not client_id or not secret:
                logger.error("[PAYPAL] Missing credentials")
                raise Exception("PayPal credentials not configured")
                
            auth_str = f"{client_id}:{secret}"
            encoded_auth = base64.b64encode(auth_str.encode()).decode()
            
            async with httpx.AsyncClient() as client:
                try:
                    response = await client.post(
                        f"{self.base_url}/v1/oauth2/token",
                        headers={
                            "Authorization": f"Basic {encoded_auth}",
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        data={"grant_type": "client_credentials"},
                        timeout=10.0
                    )
                    response.raise_for_status()
                    data = response.json()
                    
                    self._access_token = data["access_token"]
                    self._token_expires_at = time.time() + data.get("expires_in", 3600)
                    
                    logger.info("[PAYPAL] Token generated successfully")
                    return self._access_token
                except Exception as e:
                    logger.error(f"[PAYPAL] Failed to get access token: {str(e)}")
                    raise

    async def create_product(self, name: str, description: str, type: str = "SERVICE", category: str = "SOFTWARE") -> Dict[str, Any]:
        """
        [SETUP PHASE] Create a PayPal product
        POST /v1/catalogs/products
        """
        token = await self.get_access_token()
        payload = {
            "name": name,
            "description": description,
            "type": type,
            "category": category
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/v1/catalogs/products",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "PayPal-Request-Id": f"prod-{uuid.uuid4()}"
                    },
                    json=payload
                )
                if response.status_code not in [200, 201]:
                    logger.error(f"[PAYPAL] Product creation failed: {response.text}")
                    raise Exception(f"PayPal Product Error: {response.text}")
                return response.json()
            except Exception as e:
                logger.error(f"[PAYPAL] Exception in create_product: {str(e)}")
                raise

    async def create_pay_plan(self, product_id: str, name: str, description: str, billing_cycles: list, payment_preferences: dict) -> Dict[str, Any]:
        """
        [SETUP PHASE] Create a PayPal billing plan
        POST /v1/billing/plans
        """
        token = await self.get_access_token()
        payload = {
            "product_id": product_id,
            "name": name,
            "description": description,
            "status": "ACTIVE",
            "billing_cycles": billing_cycles,
            "payment_preferences": payment_preferences
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/v1/billing/plans",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "PayPal-Request-Id": f"plan-{uuid.uuid4()}"
                    },
                    json=payload
                )
                if response.status_code not in [200, 201]:
                    logger.error(f"[PAYPAL] Plan creation failed: {response.text}")
                    raise Exception(f"PayPal Plan Error: {response.text}")
                return response.json()
            except Exception as e:
                logger.error(f"[PAYPAL] Exception in create_pay_plan: {str(e)}")
                raise

    async def validate_plan(self, plan_id: str) -> bool:
        """
        [PRODUCTION VALIDATION] Check if a plan exists and is ACTIVE.
        """
        try:
            logger.info(f"[PAYPAL] Validating plan status for: {plan_id}")
            details = await self.get_plan_details(plan_id)
            status = details.get("status", "INACTIVE")
            
            is_active = status.upper() == "ACTIVE"
            if is_active:
                logger.info(f"[PAYPAL] Plan {plan_id} validated: ACTIVE")
            else:
                logger.warning(f"[PAYPAL][ERROR] Plan {plan_id} is {status} (Not Active)")
            return is_active
        except Exception as e:
            logger.error(f"[PAYPAL][ERROR] Failed to validate plan {plan_id}: {str(e)}")
            return False

    async def get_plan_details(self, plan_id: str) -> Dict[str, Any]:
        """
        [VALIDATION] Fetch detailed plan status from PayPal
        GET /v1/billing/plans/{id}
        """
        if not plan_id or not plan_id.startswith("P-"):
            raise ValueError(f"Invalid PayPal Plan ID format: {plan_id}")

        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/v1/billing/plans/{plan_id}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    timeout=10.0
                )
                if response.status_code != 200:
                    logger.error(f"[PAYPAL] Failed to fetch plan {plan_id}: {response.text}")
                    raise Exception(f"PayPal Plan Fetch Error: {response.text}")
                return response.json()
            except Exception as e:
                logger.error(f"[PAYPAL] Exception in get_plan_details: {str(e)}")
                raise

    async def create_subscription(self, plan_id: str, org_id: str, return_url: str, cancel_url: str) -> Dict[str, Any]:
        """
        [RUNTIME] Create a PayPal subscription with minimal strict payload
        POST /v1/billing/subscriptions
        """
        # 1. Environment and Format Guard
        if not plan_id.startswith("P-"):
            logger.error(f"[PAYPAL] Invalid Plan ID: {plan_id}")
            raise ValueError("PayPal Plan ID must start with 'P-'")

        token = await self.get_access_token()
        
        # 2. Strict Payload: ONLY plan_id + application_context as per production requirements
        # Note: custom_id is removed to minimize 400 validation errors, org_id must be in return_url
        payload = {
            "plan_id": plan_id,
            "application_context": {
                "brand_name": "AYTME",
                "user_action": "SUBSCRIBE_NOW",
                "shipping_preference": "NO_SHIPPING",
                "return_url": return_url,
                "cancel_url": cancel_url
            }
        }
        
        async with httpx.AsyncClient() as client:
            try:
                requestId = str(uuid.uuid4())
                logger.info(f"[PAYPAL] Creating subscription for plan {plan_id} (ReqID: {requestId})")
                
                response = await client.post(
                    f"{self.base_url}/v1/billing/subscriptions",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "PayPal-Request-Id": requestId
                    },
                    json=payload,
                    timeout=20.0
                )
                
                # Log FULL response on any non-2xx status for debugging 400 errors
                if response.status_code not in [200, 201]:
                    logger.error(f"[PAYPAL] Subscription API 400/Error Response: {response.text}")
                    raise Exception(f"PayPal Subscription Error: {response.text}")

                data = response.json()
                approval_url = next(
                    (link["href"] for link in data.get("links", []) if link["rel"] == "approve"),
                    None
                )
                
                logger.info(f"[PAYPAL] Subscription {data.get('id')} created successfully")
                return {
                    "id": data.get("id"),
                    "approval_url": approval_url,
                    "status": data.get("status")
                }
            except Exception as e:
                logger.error(f"[PAYPAL] Error in create_subscription: {str(e)}")
                raise

    async def verify_webhook_signature(self, headers: Dict[str, str], body: bytes) -> bool:
        """
        Verify PayPal webhook signature
        POST /v1/notifications/verify-webhook-signature
        """
        token = await self.get_access_token()
        webhook_id = settings.PAYPAL_WEBHOOK_ID
        
        if not webhook_id:
            logger.warning("[PAYPAL] Webhook ID not configured, skipping verification (NOT SECURE)")
            return False

        payload = {
            "auth_algo": headers.get("PAYPAL-AUTH-ALGO"),
            "cert_url": headers.get("PAYPAL-CERT-URL"),
            "transmission_id": headers.get("PAYPAL-TRANSMISSION-ID"),
            "transmission_sig": headers.get("PAYPAL-TRANSMISSION-SIG"),
            "transmission_time": headers.get("PAYPAL-TRANSMISSION-TIME"),
            "webhook_id": webhook_id,
            "webhook_event": json.loads(body.decode()) # PayPal expects a parsed object
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/v1/notifications/verify-webhook-signature",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json=payload,
                    timeout=15.0
                )
                response.raise_for_status()
                data = response.json()
                
                is_valid = data.get("verification_status") == "SUCCESS"
                if not is_valid:
                    logger.warning(f"[PAYPAL] Webhook signature verification failed: {data.get('verification_status')}")
                return is_valid
            except Exception as e:
                logger.error(f"[PAYPAL] Error verifying webhook signature: {str(e)}")
                return False

    async def get_subscription_details(self, subscription_id: str) -> Dict[str, Any]:
        """
        Get details of a subscription
        GET /v1/billing/subscriptions/{id}
        """
        token = await self.get_access_token()
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/v1/billing/subscriptions/{subscription_id}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    timeout=15.0
                )
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"[PAYPAL] Error fetching subscription {subscription_id}: {str(e)}")
                raise

    async def cancel_subscription(self, subscription_id: str, reason: str = "User requested cancellation") -> bool:
        """
        Cancel a subscription
        POST /v1/billing/subscriptions/{id}/cancel
        """
        token = await self.get_access_token()
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/v1/billing/subscriptions/{subscription_id}/cancel",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json={"reason": reason},
                    timeout=15.0
                )
                if response.status_code != 204:
                    logger.error(f"[PAYPAL] Cancel subscription {subscription_id} failed with status {response.status_code}: {response.text}")
                    return False
                return True
            except Exception as e:
                logger.exception(f"[PAYPAL] Exception during subscription cancellation: {subscription_id}")
                return False

    async def get_subscription_transactions(self, subscription_id: str, start_time: str, end_time: str) -> list:
        """
        Fetch transaction history for a subscription.
        GET /v1/billing/subscriptions/{id}/transactions?start_time=...&end_time=...
        Returns list of transaction dicts.
        """
        token = await self.get_access_token()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/v1/billing/subscriptions/{subscription_id}/transactions",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    params={"start_time": start_time, "end_time": end_time},
                    timeout=15.0,
                )
                if response.status_code != 200:
                    logger.warning(f"[PAYPAL] Transactions fetch failed for {subscription_id}: {response.text}")
                    return []
                return response.json().get("transactions", [])
            except Exception as e:
                logger.error(f"[PAYPAL] Error fetching transactions for {subscription_id}: {e}")
                return []

    async def create_or_sync_paypal_plan(self, plan: Any) -> str:
        """
        [AUTOMATION] Create a PayPal Product and Billing Plan for a local Plan model.
        Returns the paypal_plan_id.
        """
        token = await self.get_access_token()
        
        # 1. Create Product
        prod_payload = {
            "name": f"AYTME {plan.name} Plan",
            "description": plan.description or f"AYTME {plan.name} subscription",
            "type": "SERVICE",
            "category": "SOFTWARE"
        }
        
        async with httpx.AsyncClient() as client:
            # Step 1: Create Product
            prod_resp = await client.post(
                f"{self.base_url}/v1/catalogs/products",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": f"prod-{plan.id}-{int(time.time())}"
                },
                json=prod_payload
            )
            if prod_resp.status_code not in [200, 201]:
                err = await prod_resp.text()
                logger.error(f"[PAYPAL] Product creation failed for sync: {err}")
                raise Exception(f"PayPal Product Sync Error: {err}")
            
            product_id = prod_resp.json()["id"]
            
            # Step 2: Create Billing Plan
            plan_payload = {
                "product_id": product_id,
                "name": f"AYTME {plan.name}",
                "description": f"{plan.name} - {plan.minutes_included} min/month",
                "status": "ACTIVE",
                "billing_cycles": [
                    {
                        "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
                        "tenure_type": "REGULAR",
                        "sequence": 1,
                        "total_cycles": 0,
                        "pricing_scheme": {
                            "fixed_price": {
                                "value": str(plan.price_monthly),
                                "currency_code": "USD"
                            }
                        }
                    }
                ],
                "payment_preferences": {
                    "auto_bill_outstanding": True,
                    "setup_fee_failure_action": "CONTINUE",
                    "payment_failure_threshold": 3
                }
            }
            
            plan_resp = await client.post(
                f"{self.base_url}/v1/billing/plans",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": f"plan-{plan.id}-{int(time.time())}"
                },
                json=plan_payload
            )
            if plan_resp.status_code not in [200, 201]:
                err = await plan_resp.text()
                logger.error(f"[PAYPAL] Plan creation failed for sync: {err}")
                raise Exception(f"PayPal Plan Sync Error: {err}")
            
            new_plan_id = plan_resp.json()["id"]
            logger.info(f"[PAYPAL] Auto-synced plan '{plan.name}' -> {new_plan_id}")
            return new_plan_id

# Singleton instance
paypal_client = PayPalClient()
