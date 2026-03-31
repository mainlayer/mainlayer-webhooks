/**
 * Express webhook endpoint — Mainlayer webhook handler example.
 *
 * Install dependencies:
 *   npm install express @mainlayer/webhooks
 *   npm install --save-dev @types/express
 *
 * Environment:
 *   MAINLAYER_WEBHOOK_SECRET=whsec_...
 */

import express, { Request, Response } from 'express';
import {
  MainlayerWebhook,
  WebhookVerificationError,
  WebhookParseError,
  type WebhookEvent,
} from '@mainlayer/webhooks';

const app = express();

// IMPORTANT: Use express.raw() — the raw body is required for signature verification.
// Do NOT use express.json() on this route.
app.post(
  '/webhooks/mainlayer',
  express.raw({ type: 'application/json' }),
  (req: Request, res: Response) => {
    const signature = req.headers['x-mainlayer-signature'] as string | undefined;
    const secret = process.env['MAINLAYER_WEBHOOK_SECRET'];

    if (!signature) {
      res.status(400).json({ error: 'Missing X-Mainlayer-Signature header' });
      return;
    }

    if (!secret) {
      console.error('MAINLAYER_WEBHOOK_SECRET is not set');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    let event: WebhookEvent;
    try {
      event = MainlayerWebhook.construct(req.body as Buffer, signature, secret);
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        console.warn('Webhook signature verification failed:', err.message);
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
      if (err instanceof WebhookParseError) {
        console.warn('Webhook payload parse error:', err.message);
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      throw err;
    }

    // Route by event type
    switch (event.type) {
      case 'payment.completed': {
        const { payment_id, amount, currency, customer_id } = event.data as {
          payment_id: string;
          amount: number;
          currency: string;
          customer_id: string;
        };
        console.log(
          `Payment completed: ${payment_id} — ${amount / 100} ${currency.toUpperCase()} from ${customer_id}`,
        );
        // Fulfil the purchase, update your database, send a receipt, etc.
        break;
      }

      case 'payment.refunded': {
        const { payment_id, refund_id, refund_amount } = event.data as {
          payment_id: string;
          refund_id: string;
          refund_amount: number;
        };
        console.log(`Refund ${refund_id} issued for payment ${payment_id} (${refund_amount})`);
        break;
      }

      case 'subscription.created': {
        const { subscription_id, customer_id, plan_name } = event.data as {
          subscription_id: string;
          customer_id: string;
          plan_name: string;
        };
        console.log(`New subscription ${subscription_id} — ${customer_id} on ${plan_name}`);
        break;
      }

      case 'subscription.renewed': {
        const { subscription_id, next_renewal } = event.data as {
          subscription_id: string;
          next_renewal: string;
        };
        console.log(`Subscription ${subscription_id} renewed. Next renewal: ${next_renewal}`);
        break;
      }

      case 'subscription.cancelled': {
        const { subscription_id, ends_at } = event.data as {
          subscription_id: string;
          ends_at: string;
        };
        console.log(`Subscription ${subscription_id} cancelled. Access until: ${ends_at}`);
        break;
      }

      case 'entitlement.expired': {
        const { entitlement_id, feature_key, customer_id } = event.data as {
          entitlement_id: string;
          feature_key: string;
          customer_id: string;
        };
        console.log(
          `Entitlement ${entitlement_id} expired for customer ${customer_id} (feature: ${feature_key})`,
        );
        break;
      }

      default: {
        const _exhaustive: never = event.type;
        console.log('Unhandled event type:', _exhaustive);
      }
    }

    // Always return a 200 quickly to acknowledge receipt.
    res.status(200).json({ received: true });
  },
);

const PORT = process.env['PORT'] ?? 3000;
app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
