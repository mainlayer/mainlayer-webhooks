import { createHmac } from 'crypto';
import {
  MainlayerWebhook,
  WebhookVerificationError,
  WebhookParseError,
  verifySignature,
  computeSignature,
} from '../src/index';
import type { WebhookEvent } from '../src/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'whsec_test_secret_key_32bytes!!';

function sign(payload: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function makePayload(overrides: Partial<WebhookEvent> = {}): string {
  return JSON.stringify({
    id: 'evt_test_001',
    type: 'payment.completed',
    created_at: '2024-01-15T12:00:00Z',
    data: {
      payment_id: 'pay_abc123',
      amount: 2000,
      currency: 'usd',
      customer_id: 'cus_xyz',
      status: 'completed',
      completed_at: '2024-01-15T12:00:00Z',
    },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// computeSignature
// ---------------------------------------------------------------------------

describe('computeSignature', () => {
  it('produces a 64-character hex string', () => {
    const sig = computeSignature('hello', SECRET);
    expect(sig).toHaveLength(64);
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for the same inputs', () => {
    expect(computeSignature('body', SECRET)).toBe(computeSignature('body', SECRET));
  });

  it('differs when the secret changes', () => {
    expect(computeSignature('body', 'secret-a')).not.toBe(
      computeSignature('body', 'secret-b'),
    );
  });

  it('differs when the payload changes', () => {
    expect(computeSignature('payload-a', SECRET)).not.toBe(
      computeSignature('payload-b', SECRET),
    );
  });

  it('accepts a Buffer payload', () => {
    const strSig = computeSignature('buffer-test', SECRET);
    const bufSig = computeSignature(Buffer.from('buffer-test'), SECRET);
    expect(strSig).toBe(bufSig);
  });
});

// ---------------------------------------------------------------------------
// verifySignature
// ---------------------------------------------------------------------------

describe('verifySignature', () => {
  it('returns true for a valid signature', () => {
    const body = 'test-body';
    const sig = sign(body);
    expect(verifySignature(body, sig, SECRET)).toBe(true);
  });

  it('returns false for a tampered payload', () => {
    const sig = sign('original-body');
    expect(verifySignature('tampered-body', sig, SECRET)).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    const body = 'test-body';
    const sig = sign(body, 'correct-secret');
    expect(verifySignature(body, sig, 'wrong-secret')).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifySignature('body', '', SECRET)).toBe(false);
  });

  it('returns false for an empty secret', () => {
    expect(verifySignature('body', sign('body'), '')).toBe(false);
  });

  it('returns false for a signature of different length', () => {
    expect(verifySignature('body', 'abc', SECRET)).toBe(false);
  });

  it('handles Buffer payloads correctly', () => {
    const body = Buffer.from('buffer-payload');
    const sig = sign('buffer-payload');
    expect(verifySignature(body, sig, SECRET)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MainlayerWebhook.verify
// ---------------------------------------------------------------------------

describe('MainlayerWebhook.verify', () => {
  it('returns true for a valid webhook', () => {
    const payload = makePayload();
    expect(MainlayerWebhook.verify(payload, sign(payload), SECRET)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = makePayload();
    expect(MainlayerWebhook.verify(payload, 'bad-signature', SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MainlayerWebhook.construct — happy paths
// ---------------------------------------------------------------------------

describe('MainlayerWebhook.construct — valid events', () => {
  function buildAndConstruct(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
    const payload = makePayload(overrides);
    return MainlayerWebhook.construct(payload, sign(payload), SECRET);
  }

  it('parses a payment.completed event', () => {
    const event = buildAndConstruct({ type: 'payment.completed' });
    expect(event.type).toBe('payment.completed');
    expect(event.id).toBe('evt_test_001');
    expect(event.created_at).toBe('2024-01-15T12:00:00Z');
    expect(event.data).toBeDefined();
  });

  it('parses a payment.refunded event', () => {
    const event = buildAndConstruct({
      type: 'payment.refunded',
      data: {
        payment_id: 'pay_abc',
        refund_id: 'ref_001',
        amount: 2000,
        refund_amount: 2000,
        currency: 'usd',
        customer_id: 'cus_xyz',
        refunded_at: '2024-01-16T10:00:00Z',
      },
    } as Partial<WebhookEvent>);
    expect(event.type).toBe('payment.refunded');
  });

  it('parses a subscription.created event', () => {
    const event = buildAndConstruct({
      type: 'subscription.created',
      data: {
        subscription_id: 'sub_001',
        customer_id: 'cus_xyz',
        plan_id: 'plan_pro',
        plan_name: 'Pro',
        amount: 4900,
        currency: 'usd',
        interval: 'monthly',
        status: 'active',
        current_period_start: '2024-01-15T00:00:00Z',
        current_period_end: '2024-02-15T00:00:00Z',
      },
    } as Partial<WebhookEvent>);
    expect(event.type).toBe('subscription.created');
  });

  it('parses a subscription.renewed event', () => {
    const event = buildAndConstruct({
      type: 'subscription.renewed',
      data: {
        subscription_id: 'sub_001',
        customer_id: 'cus_xyz',
        plan_id: 'plan_pro',
        plan_name: 'Pro',
        amount: 4900,
        currency: 'usd',
        interval: 'monthly',
        status: 'active',
        renewed_at: '2024-02-15T00:00:00Z',
        next_renewal: '2024-03-15T00:00:00Z',
        current_period_start: '2024-02-15T00:00:00Z',
        current_period_end: '2024-03-15T00:00:00Z',
      },
    } as Partial<WebhookEvent>);
    expect(event.type).toBe('subscription.renewed');
  });

  it('parses a subscription.cancelled event', () => {
    const event = buildAndConstruct({
      type: 'subscription.cancelled',
      data: {
        subscription_id: 'sub_001',
        customer_id: 'cus_xyz',
        plan_id: 'plan_pro',
        plan_name: 'Pro',
        amount: 4900,
        currency: 'usd',
        interval: 'monthly',
        status: 'cancelled',
        cancelled_at: '2024-01-20T00:00:00Z',
        ends_at: '2024-02-15T00:00:00Z',
        current_period_start: '2024-01-15T00:00:00Z',
        current_period_end: '2024-02-15T00:00:00Z',
      },
    } as Partial<WebhookEvent>);
    expect(event.type).toBe('subscription.cancelled');
  });

  it('parses an entitlement.expired event', () => {
    const event = buildAndConstruct({
      type: 'entitlement.expired',
      data: {
        entitlement_id: 'ent_001',
        customer_id: 'cus_xyz',
        feature_key: 'advanced_analytics',
        feature_name: 'Advanced Analytics',
        expired_at: '2024-01-15T12:00:00Z',
        expires_at: '2024-01-15T12:00:00Z',
      },
    } as Partial<WebhookEvent>);
    expect(event.type).toBe('entitlement.expired');
  });

  it('preserves all data fields from the payload', () => {
    const payload = makePayload();
    const event = MainlayerWebhook.construct(payload, sign(payload), SECRET);
    expect((event.data as Record<string, unknown>)['payment_id']).toBe('pay_abc123');
    expect((event.data as Record<string, unknown>)['amount']).toBe(2000);
    expect((event.data as Record<string, unknown>)['currency']).toBe('usd');
  });

  it('accepts a Buffer payload', () => {
    const str = makePayload();
    const buf = Buffer.from(str, 'utf8');
    const sig = sign(str);
    const event = MainlayerWebhook.construct(buf, sig, SECRET);
    expect(event.type).toBe('payment.completed');
  });
});

// ---------------------------------------------------------------------------
// MainlayerWebhook.construct — error paths
// ---------------------------------------------------------------------------

describe('MainlayerWebhook.construct — invalid inputs', () => {
  it('throws WebhookVerificationError for a wrong signature', () => {
    const payload = makePayload();
    expect(() =>
      MainlayerWebhook.construct(payload, 'bad-sig', SECRET),
    ).toThrow(WebhookVerificationError);
  });

  it('throws WebhookVerificationError for a wrong secret', () => {
    const payload = makePayload();
    const sig = sign(payload, 'wrong-secret');
    expect(() =>
      MainlayerWebhook.construct(payload, sig, SECRET),
    ).toThrow(WebhookVerificationError);
  });

  it('throws WebhookVerificationError for an empty signature', () => {
    const payload = makePayload();
    expect(() =>
      MainlayerWebhook.construct(payload, '', SECRET),
    ).toThrow(WebhookVerificationError);
  });

  it('throws WebhookParseError for malformed JSON', () => {
    const bad = 'not-json{{{';
    const sig = sign(bad);
    expect(() =>
      MainlayerWebhook.construct(bad, sig, SECRET),
    ).toThrow(WebhookParseError);
  });

  it('throws WebhookParseError when id is missing', () => {
    const raw = JSON.stringify({ type: 'payment.completed', data: {}, created_at: '2024-01-01T00:00:00Z' });
    const sig = sign(raw);
    expect(() => MainlayerWebhook.construct(raw, sig, SECRET)).toThrow(WebhookParseError);
  });

  it('throws WebhookParseError when type is missing', () => {
    const raw = JSON.stringify({ id: 'evt_1', data: {}, created_at: '2024-01-01T00:00:00Z' });
    const sig = sign(raw);
    expect(() => MainlayerWebhook.construct(raw, sig, SECRET)).toThrow(WebhookParseError);
  });

  it('throws WebhookParseError for an unknown event type', () => {
    const raw = JSON.stringify({ id: 'evt_1', type: 'unknown.event', data: {}, created_at: '2024-01-01T00:00:00Z' });
    const sig = sign(raw);
    expect(() => MainlayerWebhook.construct(raw, sig, SECRET)).toThrow(WebhookParseError);
  });

  it('throws WebhookParseError when data is missing', () => {
    const raw = JSON.stringify({ id: 'evt_1', type: 'payment.completed', created_at: '2024-01-01T00:00:00Z' });
    const sig = sign(raw);
    expect(() => MainlayerWebhook.construct(raw, sig, SECRET)).toThrow(WebhookParseError);
  });

  it('throws WebhookParseError when created_at is missing', () => {
    const raw = JSON.stringify({ id: 'evt_1', type: 'payment.completed', data: {} });
    const sig = sign(raw);
    expect(() => MainlayerWebhook.construct(raw, sig, SECRET)).toThrow(WebhookParseError);
  });

  it('throws WebhookParseError when payload is a JSON array', () => {
    const raw = JSON.stringify([1, 2, 3]);
    const sig = sign(raw);
    expect(() => MainlayerWebhook.construct(raw, sig, SECRET)).toThrow(WebhookParseError);
  });

  it('error message mentions the unrecognised event type', () => {
    const raw = JSON.stringify({ id: 'evt_1', type: 'mystery.event', data: {}, created_at: '2024-01-01T00:00:00Z' });
    const sig = sign(raw);
    expect(() => MainlayerWebhook.construct(raw, sig, SECRET)).toThrow(
      /mystery\.event/,
    );
  });
});
