from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime, date
from typing import Optional, List
from decimal import Decimal


class CheckoutRequest(BaseModel):
    # Accept string to avoid 422 when frontend sends a fallback plan name
    plan_id: str
    redirect_url: Optional[str] = None
    discount_code: Optional[str] = None


class PlanResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    price_monthly: Decimal
    minutes_included: int
    overage_rate_per_min: Decimal
    max_rooms: int
    max_participants: int
    paypal_plan_id: Optional[str] = None
    features: dict

    model_config = ConfigDict(from_attributes=True)


class SubscriptionResponse(BaseModel):
    id: Optional[UUID] = None
    org_id: UUID
    plan_name: Optional[str] = None
    status: str
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool
    minutes_used: float = 0.0
    minutes_total: int = 60
    overage_allowed: bool = False
    days_remaining: Optional[int] = None
    is_expiring_soon: bool = False

    model_config = ConfigDict(from_attributes=True)


class InvoiceResponse(BaseModel):
    id: UUID
    amount: Decimal
    total_amount: Decimal # frontend expects total_amount
    currency: str
    status: str
    pdf_url: Optional[str] = None
    billing_period_start: datetime
    billing_period_end: datetime
    period_start: datetime # frontend expects period_start
    period_end: datetime   # frontend expects period_end
    paid_at: Optional[datetime] = None
    created_at: datetime
    plan_name: Optional[str] = "Pro" # Default for now, populated in API
    minutes_used: float = 0.0        # Default for now, populated in API

    model_config = ConfigDict(from_attributes=True)


class UsageRecordResponse(BaseModel):
    id: UUID
    minutes_used: Decimal
    recorded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UsageResponse(BaseModel):
    """Monthly usage summary"""
    org_id: UUID
    period_start: datetime
    period_end: datetime
    total_minutes: float
    included_minutes: int
    overage_minutes: float
    overage_rate: float
    estimated_overage_cost: float


class OverageResponse(BaseModel):
    """Daily usage breakdown"""
    date: date
    minutes_used: float


class UsageCreate(BaseModel):
    """Usage recording request"""
    room_id: Optional[UUID] = None
    minutes: float
