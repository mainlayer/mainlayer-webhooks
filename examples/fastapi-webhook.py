"""
FastAPI webhook endpoint — Mainlayer webhook handler example.

Install dependencies:
    pip install fastapi uvicorn mainlayer-webhooks

Run:
    uvicorn fastapi_webhook:app --reload

Environment:
    MAINLAYER_WEBHOOK_SECRET=whsec_...
"""

from __future__ import annotations

import os
import logging

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from mainlayer_webhooks import (
    MainlayerWebhook,
    WebhookVerificationError,
    WebhookParseError,
    PaymentCompletedEvent,
    PaymentRefundedEvent,
    SubscriptionCreatedEvent,
    SubscriptionRenewedEvent,
    SubscriptionCancelledEvent,
    EntitlementExpiredEvent,
)

logger = logging.getLogger(__name__)
app = FastAPI(title="Mainlayer Webhook Receiver")

WEBHOOK_SECRET = os.environ.get("MAINLAYER_WEBHOOK_SECRET", "")


@app.post("/webhooks/mainlayer", status_code=200)
async def receive_webhook(
    request: Request,
    x_mainlayer_signature: str = Header(..., alias="X-Mainlayer-Signature"),
) -> JSONResponse:
    """
    Receive and process a Mainlayer webhook event.

    IMPORTANT: Read the raw body before any JSON parsing — the signature is
    computed over the exact bytes Mainlayer sends.
    """
    if not WEBHOOK_SECRET:
        logger.error("MAINLAYER_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw_body: bytes = await request.body()

    try:
        event = MainlayerWebhook.construct(
            payload=raw_body,
            signature=x_mainlayer_signature,
            secret=WEBHOOK_SECRET,
        )
    except WebhookVerificationError as exc:
        logger.warning("Webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid signature") from exc
    except WebhookParseError as exc:
        logger.warning("Webhook payload parse error: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid payload") from exc

    # Route by event type
    if isinstance(event, PaymentCompletedEvent):
        logger.info(
            "Payment completed: %s — %s %s from %s",
            event.data.payment_id,
            event.data.amount / 100,
            event.data.currency.upper(),
            event.data.customer_id,
        )
        # Fulfil the purchase, update your database, send a receipt, etc.

    elif isinstance(event, PaymentRefundedEvent):
        logger.info(
            "Refund %s issued for payment %s (%s)",
            event.data.refund_id,
            event.data.payment_id,
            event.data.refund_amount,
        )

    elif isinstance(event, SubscriptionCreatedEvent):
        logger.info(
            "New subscription %s — %s on %s",
            event.data.subscription_id,
            event.data.customer_id,
            event.data.plan_name,
        )

    elif isinstance(event, SubscriptionRenewedEvent):
        logger.info(
            "Subscription %s renewed. Next renewal: %s",
            event.data.subscription_id,
            event.data.next_renewal,
        )

    elif isinstance(event, SubscriptionCancelledEvent):
        logger.info(
            "Subscription %s cancelled. Access until: %s",
            event.data.subscription_id,
            event.data.ends_at,
        )

    elif isinstance(event, EntitlementExpiredEvent):
        logger.info(
            "Entitlement %s expired for customer %s (feature: %s)",
            event.data.entitlement_id,
            event.data.customer_id,
            event.data.feature_key,
        )

    else:
        logger.warning("Unhandled event type: %s", event.type)

    # Always return a 200 quickly to acknowledge receipt.
    return JSONResponse({"received": True})
