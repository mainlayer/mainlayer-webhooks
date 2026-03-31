"""
Pydantic models for every Mainlayer webhook event type.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Base model
# ---------------------------------------------------------------------------


class WebhookEvent(BaseModel):
    """Base shape shared by all Mainlayer webhook events."""

    id: str = Field(..., description="Unique event identifier.")
    type: str = Field(..., description="Event type (e.g. 'payment.completed').")
    data: Dict[str, Any] = Field(..., description="Event-specific payload.")
    created_at: datetime = Field(..., description="ISO 8601 UTC timestamp.")

    model_config = {"extra": "allow"}


# ---------------------------------------------------------------------------
# Payment events
# ---------------------------------------------------------------------------


class PaymentData(BaseModel):
    payment_id: str
    amount: int = Field(..., description="Amount in the smallest currency unit (e.g. cents).")
    currency: str = Field(..., description="Three-letter ISO 4217 currency code.")
    customer_id: str
    description: Optional[str] = None
    metadata: Optional[Dict[str, str]] = None

    model_config = {"extra": "allow"}


class PaymentCompletedData(PaymentData):
    status: Literal["completed"]
    completed_at: datetime


class PaymentRefundedData(PaymentData):
    refund_id: str
    refund_amount: int
    reason: Optional[str] = None
    refunded_at: datetime


class PaymentCompletedEvent(WebhookEvent):
    type: Literal["payment.completed"]
    data: PaymentCompletedData  # type: ignore[assignment]


class PaymentRefundedEvent(WebhookEvent):
    type: Literal["payment.refunded"]
    data: PaymentRefundedData  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Subscription events
# ---------------------------------------------------------------------------


class SubscriptionData(BaseModel):
    subscription_id: str
    customer_id: str
    plan_id: str
    plan_name: str
    amount: int
    currency: str
    interval: Literal["monthly", "annual", "weekly"]
    current_period_start: datetime
    current_period_end: datetime
    metadata: Optional[Dict[str, str]] = None

    model_config = {"extra": "allow"}


class SubscriptionCreatedData(SubscriptionData):
    status: Literal["active"]
    trial_end: Optional[datetime] = None


class SubscriptionRenewedData(SubscriptionData):
    status: Literal["active"]
    renewed_at: datetime
    next_renewal: datetime


class SubscriptionCancelledData(SubscriptionData):
    status: Literal["cancelled"]
    cancelled_at: datetime
    cancellation_reason: Optional[str] = None
    ends_at: datetime


class SubscriptionCreatedEvent(WebhookEvent):
    type: Literal["subscription.created"]
    data: SubscriptionCreatedData  # type: ignore[assignment]


class SubscriptionRenewedEvent(WebhookEvent):
    type: Literal["subscription.renewed"]
    data: SubscriptionRenewedData  # type: ignore[assignment]


class SubscriptionCancelledEvent(WebhookEvent):
    type: Literal["subscription.cancelled"]
    data: SubscriptionCancelledData  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Entitlement events
# ---------------------------------------------------------------------------


class EntitlementData(BaseModel):
    entitlement_id: str
    customer_id: str
    feature_key: str
    feature_name: str
    subscription_id: Optional[str] = None
    metadata: Optional[Dict[str, str]] = None

    model_config = {"extra": "allow"}


class EntitlementExpiredData(EntitlementData):
    expired_at: datetime
    expires_at: datetime


class EntitlementExpiredEvent(WebhookEvent):
    type: Literal["entitlement.expired"]
    data: EntitlementExpiredData  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Discriminated union
# ---------------------------------------------------------------------------

TypedWebhookEvent = Union[
    PaymentCompletedEvent,
    PaymentRefundedEvent,
    SubscriptionCreatedEvent,
    SubscriptionRenewedEvent,
    SubscriptionCancelledEvent,
    EntitlementExpiredEvent,
]

EVENT_TYPE_MAP: Dict[str, type] = {
    "payment.completed": PaymentCompletedEvent,
    "payment.refunded": PaymentRefundedEvent,
    "subscription.created": SubscriptionCreatedEvent,
    "subscription.renewed": SubscriptionRenewedEvent,
    "subscription.cancelled": SubscriptionCancelledEvent,
    "entitlement.expired": EntitlementExpiredEvent,
}
