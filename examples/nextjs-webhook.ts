/**
 * Next.js App Router API route — Mainlayer webhook handler example.
 *
 * File location: app/api/webhooks/mainlayer/route.ts
 *
 * Install dependencies:
 *   npm install @mainlayer/webhooks
 *
 * Environment (add to .env.local):
 *   MAINLAYER_WEBHOOK_SECRET=whsec_...
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  MainlayerWebhook,
  WebhookVerificationError,
  WebhookParseError,
  type WebhookEvent,
} from '@mainlayer/webhooks';

// Disable the built-in body parser — we need the raw body for HMAC verification.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-mainlayer-signature');
  const secret = process.env['MAINLAYER_WEBHOOK_SECRET'];

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Mainlayer-Signature header' },
      { status: 400 },
    );
  }

  if (!secret) {
    console.error('MAINLAYER_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw body as a Buffer for exact byte-level HMAC comparison.
  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: WebhookEvent;
  try {
    event = MainlayerWebhook.construct(rawBody, signature, secret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn('[mainlayer] Signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    if (err instanceof WebhookParseError) {
      console.warn('[mainlayer] Payload parse error:', err.message);
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    throw err;
  }

  // Handle the event asynchronously so the 200 response is returned immediately.
  // In production, consider queuing the event rather than processing inline.
  try {
    await handleEvent(event);
  } catch (err) {
    console.error('[mainlayer] Error handling event:', event.type, err);
    // Return 200 anyway — Mainlayer has already delivered the event.
    // Investigate and replay manually if needed.
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

async function handleEvent(event: WebhookEvent): Promise<void> {
  console.log(`[mainlayer] Processing event: ${event.type} (${event.id})`);

  switch (event.type) {
    case 'payment.completed': {
      const { payment_id, amount, currency, customer_id } = event.data as {
        payment_id: string;
        amount: number;
        currency: string;
        customer_id: string;
      };
      // Example: update your database and provision access
      console.log(
        `Payment ${payment_id} completed — ${amount / 100} ${currency.toUpperCase()} by ${customer_id}`,
      );
      // await db.payments.markCompleted(payment_id);
      // await provisionAccess(customer_id);
      break;
    }

    case 'payment.refunded': {
      const { payment_id, refund_id } = event.data as {
        payment_id: string;
        refund_id: string;
      };
      console.log(`Refund ${refund_id} for payment ${payment_id}`);
      // await db.refunds.record(refund_id, payment_id);
      break;
    }

    case 'subscription.created': {
      const { subscription_id, customer_id, plan_name } = event.data as {
        subscription_id: string;
        customer_id: string;
        plan_name: string;
      };
      console.log(`Subscription ${subscription_id} created — ${customer_id} on ${plan_name}`);
      // await db.subscriptions.create({ subscription_id, customer_id, plan_name });
      break;
    }

    case 'subscription.renewed': {
      const { subscription_id } = event.data as { subscription_id: string };
      console.log(`Subscription ${subscription_id} renewed`);
      // await db.subscriptions.refresh(subscription_id);
      break;
    }

    case 'subscription.cancelled': {
      const { subscription_id, ends_at } = event.data as {
        subscription_id: string;
        ends_at: string;
      };
      console.log(`Subscription ${subscription_id} cancels at ${ends_at}`);
      // await db.subscriptions.scheduleCancellation(subscription_id, ends_at);
      break;
    }

    case 'entitlement.expired': {
      const { entitlement_id, feature_key, customer_id } = event.data as {
        entitlement_id: string;
        feature_key: string;
        customer_id: string;
      };
      console.log(`Entitlement ${entitlement_id} (${feature_key}) expired for ${customer_id}`);
      // await db.entitlements.revoke(entitlement_id);
      break;
    }

    default: {
      const _exhaustive: never = event.type;
      console.warn('[mainlayer] Unhandled event type:', _exhaustive);
    }
  }
}
