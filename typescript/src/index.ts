import { verifySignature } from './verify';
import type { WebhookEvent, WebhookEventType } from './events';

export type { WebhookEvent, WebhookEventType };
export type {
  PaymentData,
  PaymentCompletedEvent,
  PaymentRefundedEvent,
  SubscriptionData,
  SubscriptionCreatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionCancelledEvent,
  EntitlementData,
  EntitlementExpiredEvent,
  TypedWebhookEvent,
} from './events';
export { verifySignature, computeSignature } from './verify';

const VALID_EVENT_TYPES = new Set<WebhookEventType>([
  'payment.completed',
  'payment.refunded',
  'subscription.created',
  'subscription.renewed',
  'subscription.cancelled',
  'entitlement.expired',
]);

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export class WebhookParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookParseError';
  }
}

/**
 * MainlayerWebhook — signature verification and event construction.
 *
 * @example
 * ```typescript
 * import { MainlayerWebhook } from '@mainlayer/webhooks';
 *
 * const event = MainlayerWebhook.construct(
 *   req.body,
 *   req.headers['x-mainlayer-signature'] as string,
 *   process.env.MAINLAYER_WEBHOOK_SECRET!,
 * );
 * ```
 */
export class MainlayerWebhook {
  /**
   * Verify that the request came from Mainlayer by checking the HMAC-SHA256
   * signature against the raw request body.
   *
   * @param payload   - Raw request body (string or Buffer — do NOT parse JSON first).
   * @param signature - Value of the `X-Mainlayer-Signature` header.
   * @param secret    - Your webhook secret from the Mainlayer dashboard.
   * @returns         `true` if the signature is valid.
   */
  static verify(payload: string | Buffer, signature: string, secret: string): boolean {
    return verifySignature(payload, signature, secret);
  }

  /**
   * Verify the webhook signature and parse the payload into a typed
   * `WebhookEvent`. Throws if the signature is invalid or the payload cannot
   * be parsed.
   *
   * @param payload   - Raw request body (string or Buffer — do NOT parse JSON first).
   * @param signature - Value of the `X-Mainlayer-Signature` header.
   * @param secret    - Your webhook secret from the Mainlayer dashboard.
   * @returns         Parsed and verified `WebhookEvent`.
   * @throws          `WebhookVerificationError` when the signature does not match.
   * @throws          `WebhookParseError` when the payload is not valid JSON or
   *                  is missing required fields.
   */
  static construct(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): WebhookEvent {
    if (!verifySignature(payload, signature, secret)) {
      throw new WebhookVerificationError(
        'Webhook signature verification failed. Ensure you are using the raw ' +
          'request body and the correct webhook secret.',
      );
    }

    const raw = typeof payload === 'string' ? payload : payload.toString('utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new WebhookParseError('Webhook payload is not valid JSON.');
    }

    return MainlayerWebhook.assertWebhookEvent(parsed);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private static assertWebhookEvent(value: unknown): WebhookEvent {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new WebhookParseError('Webhook payload must be a JSON object.');
    }

    const obj = value as Record<string, unknown>;

    if (typeof obj['id'] !== 'string' || obj['id'].trim() === '') {
      throw new WebhookParseError("Webhook payload missing required field 'id'.");
    }

    if (typeof obj['type'] !== 'string') {
      throw new WebhookParseError("Webhook payload missing required field 'type'.");
    }

    if (!VALID_EVENT_TYPES.has(obj['type'] as WebhookEventType)) {
      throw new WebhookParseError(
        `Unknown webhook event type: '${obj['type']}'. ` +
          `Expected one of: ${[...VALID_EVENT_TYPES].join(', ')}.`,
      );
    }

    if (typeof obj['data'] !== 'object' || obj['data'] === null) {
      throw new WebhookParseError("Webhook payload missing required field 'data'.");
    }

    if (typeof obj['created_at'] !== 'string' || obj['created_at'].trim() === '') {
      throw new WebhookParseError(
        "Webhook payload missing required field 'created_at'.",
      );
    }

    return {
      id: obj['id'] as string,
      type: obj['type'] as WebhookEventType,
      data: obj['data'] as Record<string, unknown>,
      created_at: obj['created_at'] as string,
    };
  }
}
