"""
Centralized error handling and standardized error responses
"""
from fastapi import HTTPException, status
from typing import Optional, Any, Dict
import logging

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base application error"""
    def __init__(self, message: str, code: str = "INTERNAL_ERROR", status_code: int = 500):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(self.message)


class ValidationError(AppError):
    """Validation errors (400)"""
    def __init__(self, message: str, code: str = "VALIDATION_ERROR"):
        super().__init__(message, code, status_code=400)


class AuthenticationError(AppError):
    """Authentication errors (401)"""
    def __init__(self, message: str = "Unauthorized", code: str = "UNAUTHORIZED"):
        super().__init__(message, code, status_code=401)


class PermissionError(AppError):
    """Permission errors (403)"""
    def __init__(self, message: str = "Forbidden", code: str = "FORBIDDEN"):
        super().__init__(message, code, status_code=403)


class NotFoundError(AppError):
    """Not found errors (404)"""
    def __init__(self, resource: str = "Resource", code: str = "NOT_FOUND"):
        message = f"{resource} not found"
        super().__init__(message, code, status_code=404)


class ConflictError(AppError):
    """Conflict errors (409)"""
    def __init__(self, message: str, code: str = "CONFLICT"):
        super().__init__(message, code, status_code=409)


class BillingError(AppError):
    """Billing/payment errors (402)"""
    def __init__(self, message: str, code: str = "PAYMENT_REQUIRED"):
        super().__init__(message, code, status_code=402)


class StripeError(AppError):
    """Stripe API errors (500)"""
    def __init__(self, message: str, code: str = "STRIPE_ERROR"):
        super().__init__(message, code, status_code=500)


class RateLimitError(AppError):
    """Rate limit errors (429)"""
    def __init__(self, message: str = "Too many requests", code: str = "RATE_LIMIT"):
        super().__init__(message, code, status_code=429)


class InternalServerError(AppError):
    """Internal server errors (500)"""
    def __init__(self, message: str = "Internal server error", code: str = "INTERNAL_ERROR"):
        super().__init__(message, code, status_code=500)


def error_response(message: str, code: str, details: Optional[Dict[str, Any]] = None) -> Dict:
    """Format standardized error response"""
    response = {
        "error": {
            "code": code,
            "message": message,
        }
    }
    if details:
        response["error"]["details"] = details
    return response


def app_error_to_http_exception(error: AppError) -> HTTPException:
    """Convert AppError to HTTPException"""
    return HTTPException(
        status_code=error.status_code,
        detail=error_response(error.message, error.code)
    )


# Specific validators
def validate_org_membership(member) -> None:
    """Validate user is org member, raise PermissionError if not"""
    if not member:
        raise PermissionError("You do not have access to this organization")


def validate_org_admin(member, org_id) -> None:
    """Validate user is org admin, raise PermissionError if not"""
    if not member or member.role not in ["owner", "admin"]:
        raise PermissionError(f"Only organization admins can manage billing")


def validate_subscription_active(subscription) -> None:
    """Validate subscription is active, raise BillingError if not"""
    if not subscription:
        raise BillingError("No active subscription found", "NO_SUBSCRIPTION")
    
    if subscription.status not in ["active", "past_due", "trialing", "grace_period"]:
        raise BillingError(
            f"Subscription is {subscription.status}. Please check your payment",
            "SUBSCRIPTION_INACTIVE"
        )


def validate_usage_limits(total_used: float, limit: int, overage_allowed: bool) -> None:
    """Validate usage is within limits, raise BillingError if exceeded"""
    if total_used >= limit:
        if not overage_allowed:
            minutes_remaining = max(0, limit - total_used)
            raise BillingError(
                f"Usage limit reached. {int(minutes_remaining)} minutes remaining. Upgrade to continue.",
                "USAGE_LIMIT_EXCEEDED"
            )


def log_and_raise(exception: AppError, context: Optional[str] = None) -> None:
    """Log error and raise as HTTPException"""
    context_msg = f" ({context})" if context else ""
    logger.error(f"{exception.code}{context_msg}: {exception.message}")
    raise app_error_to_http_exception(exception)
