"""
pytest test suite for mainlayer_webhooks.

Run with:
    pytest python/tests/ -v --tb=short
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone

import pytest

from mainlayer_webhooks import (
    MainlayerWebhook,
    WebhookParseError,
    WebhookVerificationError,
    WebhookEvent,
    PaymentCompletedEvent,
    PaymentRefundedEvent,
    SubscriptionCreatedEvent,
    SubscriptionRenewedEvent,
    SubscriptionCancelledEvent,
    EntitlementExpiredEvent,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

SECRET = "whsec_test_secret_key_32bytes!!"


def sign(payload: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def make_payload(**overrides) -> bytes:
    event = {
        "id": "evt_test_001",
        "type": "payment.completed",
        "created_at": "2024-01-15T12:00:00Z",
        "data": {
            "payment_id": "pay_abc123",
            "amount": 2000,
            "currency": "usd",
            "customer_id": "cus_xyz",
            "status": "completed",
            "completed_at": "2024-01-15T12:00:00Z",
        },
    }
    event.update(overrides)
    return json.dumps(event).encode()


# ---------------------------------------------------------------------------
# verify — happy paths
# ---------------------------------------------------------------------------


class TestVerifyValid:
    def test_returns_true_for_valid_signature(self):
        payload = make_payload()
        assert MainlayerWebhook.verify(payload, sign(payload), SECRET) is True

    def test_different_payloads_both_valid(self):
        p1 = make_payload()
        p2 = make_payload(id="evt_002")
        assert MainlayerWebhook.verify(p1, sign(p1), SECRET) is True
        assert MainlayerWebhook.verify(p2, sign(p2), SECRET) is True


# ---------------------------------------------------------------------------
# verify — failure paths
# ---------------------------------------------------------------------------


class TestVerifyInvalid:
    def test_returns_false_for_wrong_signature(self):
        payload = make_payload()
        assert MainlayerWebhook.verify(payload, "bad" * 10, SECRET) is False

    def test_returns_false_for_tampered_payload(self):
        original = make_payload()
        sig = sign(original)
        tampered = make_payload(id="evt_tampered")
        assert MainlayerWebhook.verify(tampered, sig, SECRET) is False

    def test_returns_false_for_wrong_secret(self):
        payload = make_payload()
        sig = sign(payload, "correct-secret")
        assert MainlayerWebhook.verify(payload, sig, "wrong-secret") is False

    def test_returns_false_for_empty_signature(self):
        payload = make_payload()
        assert MainlayerWebhook.verify(payload, "", SECRET) is False

    def test_returns_false_for_empty_secret(self):
        payload = make_payload()
        assert MainlayerWebhook.verify(payload, sign(payload), "") is False


# ---------------------------------------------------------------------------
# construct — payment events
# ---------------------------------------------------------------------------


class TestConstructPaymentCompleted:
    def test_parses_payment_completed(self):
        payload = make_payload(type="payment.completed")
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, PaymentCompletedEvent)
        assert event.type == "payment.completed"
        assert event.id == "evt_test_001"

    def test_data_fields_are_accessible(self):
        payload = make_payload(type="payment.completed")
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, PaymentCompletedEvent)
        assert event.data.amount == 2000
        assert event.data.currency == "usd"
        assert event.data.customer_id == "cus_xyz"

    def test_created_at_parsed_as_datetime(self):
        payload = make_payload()
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event.created_at, datetime)


class TestConstructPaymentRefunded:
    def test_parses_payment_refunded(self):
        payload = make_payload(
            type="payment.refunded",
            data={
                "payment_id": "pay_abc",
                "refund_id": "ref_001",
                "amount": 2000,
                "refund_amount": 2000,
                "currency": "usd",
                "customer_id": "cus_xyz",
                "status": "completed",
                "refunded_at": "2024-01-16T10:00:00Z",
            },
        )
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, PaymentRefundedEvent)
        assert event.type == "payment.refunded"
        assert event.data.refund_id == "ref_001"


# ---------------------------------------------------------------------------
# construct — subscription events
# ---------------------------------------------------------------------------

SUBSCRIPTION_DATA = {
    "subscription_id": "sub_001",
    "customer_id": "cus_xyz",
    "plan_id": "plan_pro",
    "plan_name": "Pro",
    "amount": 4900,
    "currency": "usd",
    "interval": "monthly",
    "current_period_start": "2024-01-15T00:00:00Z",
    "current_period_end": "2024-02-15T00:00:00Z",
}


class TestConstructSubscriptionCreated:
    def test_parses_subscription_created(self):
        payload = make_payload(
            type="subscription.created",
            data={**SUBSCRIPTION_DATA, "status": "active"},
        )
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, SubscriptionCreatedEvent)
        assert event.type == "subscription.created"

    def test_subscription_data_fields(self):
        payload = make_payload(
            type="subscription.created",
            data={**SUBSCRIPTION_DATA, "status": "active"},
        )
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, SubscriptionCreatedEvent)
        assert event.data.plan_name == "Pro"
        assert event.data.interval == "monthly"


class TestConstructSubscriptionRenewed:
    def test_parses_subscription_renewed(self):
        payload = make_payload(
            type="subscription.renewed",
            data={
                **SUBSCRIPTION_DATA,
                "status": "active",
                "renewed_at": "2024-02-15T00:00:00Z",
                "next_renewal": "2024-03-15T00:00:00Z",
            },
        )
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, SubscriptionRenewedEvent)
        assert event.type == "subscription.renewed"


class TestConstructSubscriptionCancelled:
    def test_parses_subscription_cancelled(self):
        payload = make_payload(
            type="subscription.cancelled",
            data={
                **SUBSCRIPTION_DATA,
                "status": "cancelled",
                "cancelled_at": "2024-01-20T00:00:00Z",
                "ends_at": "2024-02-15T00:00:00Z",
            },
        )
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, SubscriptionCancelledEvent)
        assert event.type == "subscription.cancelled"


# ---------------------------------------------------------------------------
# construct — entitlement events
# ---------------------------------------------------------------------------


class TestConstructEntitlementExpired:
    def test_parses_entitlement_expired(self):
        payload = make_payload(
            type="entitlement.expired",
            data={
                "entitlement_id": "ent_001",
                "customer_id": "cus_xyz",
                "feature_key": "advanced_analytics",
                "feature_name": "Advanced Analytics",
                "expired_at": "2024-01-15T12:00:00Z",
                "expires_at": "2024-01-15T12:00:00Z",
            },
        )
        event = MainlayerWebhook.construct(payload, sign(payload), SECRET)
        assert isinstance(event, EntitlementExpiredEvent)
        assert event.type == "entitlement.expired"
        assert event.data.feature_key == "advanced_analytics"


# ---------------------------------------------------------------------------
# construct — error paths
# ---------------------------------------------------------------------------


class TestConstructErrors:
    def test_raises_verification_error_for_wrong_sig(self):
        payload = make_payload()
        with pytest.raises(WebhookVerificationError):
            MainlayerWebhook.construct(payload, "bad-sig", SECRET)

    def test_raises_verification_error_for_wrong_secret(self):
        payload = make_payload()
        with pytest.raises(WebhookVerificationError):
            MainlayerWebhook.construct(payload, sign(payload), "wrong-secret")

    def test_raises_verification_error_for_empty_sig(self):
        payload = make_payload()
        with pytest.raises(WebhookVerificationError):
            MainlayerWebhook.construct(payload, "", SECRET)

    def test_raises_parse_error_for_bad_json(self):
        bad = b"not-json{{{"
        with pytest.raises(WebhookParseError, match="valid JSON"):
            MainlayerWebhook.construct(bad, sign(bad), SECRET)

    def test_raises_parse_error_for_json_array(self):
        bad = json.dumps([1, 2, 3]).encode()
        with pytest.raises(WebhookParseError, match="JSON object"):
            MainlayerWebhook.construct(bad, sign(bad), SECRET)

    def test_raises_parse_error_for_missing_type(self):
        raw = json.dumps({"id": "evt_1", "data": {}, "created_at": "2024-01-01T00:00:00Z"}).encode()
        with pytest.raises(WebhookParseError):
            MainlayerWebhook.construct(raw, sign(raw), SECRET)

    def test_raises_parse_error_for_unknown_type(self):
        raw = json.dumps({
            "id": "evt_1",
            "type": "mystery.event",
            "data": {},
            "created_at": "2024-01-01T00:00:00Z",
        }).encode()
        with pytest.raises(WebhookParseError, match="mystery.event"):
            MainlayerWebhook.construct(raw, sign(raw), SECRET)

    def test_error_message_lists_known_types(self):
        raw = json.dumps({
            "id": "evt_1",
            "type": "bad.type",
            "data": {},
            "created_at": "2024-01-01T00:00:00Z",
        }).encode()
        with pytest.raises(WebhookParseError) as exc_info:
            MainlayerWebhook.construct(raw, sign(raw), SECRET)
        assert "payment.completed" in str(exc_info.value)
