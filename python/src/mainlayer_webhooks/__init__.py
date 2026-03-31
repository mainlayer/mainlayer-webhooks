"""
mainlayer-webhooks — Webhook signature verification and event parsing for Mainlayer.

Basic usage::

    from mainlayer_webhooks import MainlayerWebhook

    event = MainlayerWebhook.construct(
        payload=request.body,
        signature=request.headers["X-Mainlayer-Signature"],
        secret=MAINLAYER_WEBHOOK_SECRET,
    )
    print(event.type, event.id)
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Union

from .events import (
    EVENT_TYPE_MAP,
    WebhookEvent,
    PaymentCompletedEvent,
    PaymentRefundedEvent,
    SubscriptionCreatedEvent,
    SubscriptionRenewedEvent,
    SubscriptionCancelledEvent,
    EntitlementExpiredEvent,
    TypedWebhookEvent,
)

__all__ = [
    "MainlayerWebhook",
    "WebhookVerificationError",
    "WebhookParseError",
    "WebhookEvent",
    "PaymentCompletedEvent",
    "PaymentRefundedEvent",
    "SubscriptionCreatedEvent",
    "SubscriptionRenewedEvent",
    "SubscriptionCancelledEvent",
    "EntitlementExpiredEvent",
    "TypedWebhookEvent",
]

VALID_EVENT_TYPES = frozenset(EVENT_TYPE_MAP.keys())


class WebhookVerificationError(Exception):
    """Raised when the webhook signature does not match the payload."""


class WebhookParseError(Exception):
    """Raised when the webhook payload cannot be parsed or is structurally invalid."""


def _compute_signature(payload: bytes, secret: str) -> str:
    """Return the HMAC-SHA256 hex digest for *payload* using *secret*."""
    return hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()


def _verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify the HMAC-SHA256 signature in a timing-safe manner.

    Args:
        payload:   Raw request body bytes.
        signature: Hex-encoded signature from the ``X-Mainlayer-Signature`` header.
        secret:    Webhook secret from the Mainlayer dashboard.

    Returns:
        ``True`` if the signature is valid, ``False`` otherwise.
    """
    if not signature or not secret:
        return False
    expected = _compute_signature(payload, secret)
    return hmac.compare_digest(expected, signature)


class MainlayerWebhook:
    """
    Mainlayer webhook helper class.

    All methods are static — no instantiation required.

    Example::

        from mainlayer_webhooks import MainlayerWebhook

        event = MainlayerWebhook.construct(
            payload=raw_body,
            signature=headers["X-Mainlayer-Signature"],
            secret=os.environ["MAINLAYER_WEBHOOK_SECRET"],
        )
    """

    @staticmethod
    def verify(payload: bytes, signature: str, secret: str) -> bool:
        """
        Verify that the webhook request came from Mainlayer.

        Args:
            payload:   Raw request body (do **not** decode or parse JSON first).
            signature: Value of the ``X-Mainlayer-Signature`` header.
            secret:    Your webhook secret from the Mainlayer dashboard.

        Returns:
            ``True`` if the signature is valid.
        """
        return _verify_signature(payload, signature, secret)

    @staticmethod
    def construct(
        payload: bytes,
        signature: str,
        secret: str,
    ) -> WebhookEvent:
        """
        Verify the signature and parse the payload into a :class:`WebhookEvent`.

        Args:
            payload:   Raw request body (do **not** decode or parse JSON first).
            signature: Value of the ``X-Mainlayer-Signature`` header.
            secret:    Your webhook secret from the Mainlayer dashboard.

        Returns:
            A :class:`WebhookEvent` (or a typed subclass when the event type is
            recognised).

        Raises:
            :class:`WebhookVerificationError`: When the signature does not match.
            :class:`WebhookParseError`: When the payload is not valid JSON or is
                missing required fields.
        """
        if not _verify_signature(payload, signature, secret):
            raise WebhookVerificationError(
                "Webhook signature verification failed. Ensure you are passing "
                "the raw request body and the correct webhook secret."
            )

        try:
            raw = json.loads(payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise WebhookParseError(
                f"Webhook payload is not valid JSON: {exc}"
            ) from exc

        if not isinstance(raw, dict):
            raise WebhookParseError("Webhook payload must be a JSON object.")

        event_type = raw.get("type")
        if not isinstance(event_type, str):
            raise WebhookParseError("Webhook payload missing required field 'type'.")

        if event_type not in VALID_EVENT_TYPES:
            raise WebhookParseError(
                f"Unknown webhook event type: '{event_type}'. "
                f"Expected one of: {', '.join(sorted(VALID_EVENT_TYPES))}."
            )

        model_class = EVENT_TYPE_MAP.get(event_type, WebhookEvent)

        try:
            return model_class.model_validate(raw)
        except Exception as exc:
            raise WebhookParseError(
                f"Failed to parse webhook payload for event type '{event_type}': {exc}"
            ) from exc
