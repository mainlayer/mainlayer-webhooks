# mainlayer-webhooks

Official webhook signature verification and event parsing library for [Mainlayer](https://mainlayer.fr) — payment infrastructure for AI agents.

Available in **TypeScript/JavaScript** and **Python**.

---

## Installation

### TypeScript / JavaScript

```bash
npm install @mainlayer/webhooks
# or
pnpm add @mainlayer/webhooks
# or
yarn add @mainlayer/webhooks
```

### Python

```bash
pip install mainlayer-webhooks
```

---

## Webhook events

| Event type | Description |
|---|---|
| `payment.completed` | A payment was successfully processed |
| `payment.refunded` | A payment was fully or partially refunded |
| `subscription.created` | A new subscription was started |
| `subscription.renewed` | A subscription was renewed for another period |
| `subscription.cancelled` | A subscription was cancelled |
| `entitlement.expired` | A feature entitlement has expired |

---

## How signatures work

Mainlayer signs every webhook request with **HMAC-SHA256** using your webhook secret. The signature is sent in the `X-Mainlayer-Signature` header as a hex string.

```
X-Mainlayer-Signature: 3d4f2a8b...
```

The signature is computed over the **raw request body bytes** — always read the raw body before any JSON parsing.

---

## TypeScript / JavaScript

### Verify and construct an event

```typescript
import { MainlayerWebhook, WebhookVerificationError, WebhookParseError } from '@mainlayer/webhooks';

const event = MainlayerWebhook.construct(
  rawBody,                                          // Buffer or string — raw body, not parsed JSON
  req.headers['x-mainlayer-signature'] as string,
  process.env.MAINLAYER_WEBHOOK_SECRET!,
);

switch (event.type) {
  case 'payment.completed':
    console.log('Payment ID:', event.data.payment_id);
    break;
  case 'subscription.created':
    console.log('Plan:', event.data.plan_name);
    break;
}
```

### Signature-only check

```typescript
const isValid = MainlayerWebhook.verify(rawBody, signature, secret);
```

### Express

```typescript
import express from 'express';
import { MainlayerWebhook, WebhookVerificationError, WebhookParseError } from '@mainlayer/webhooks';

app.post(
  '/webhooks/mainlayer',
  express.raw({ type: 'application/json' }),   // raw body required
  (req, res) => {
    try {
      const event = MainlayerWebhook.construct(
        req.body,
        req.headers['x-mainlayer-signature'] as string,
        process.env.MAINLAYER_WEBHOOK_SECRET!,
      );
      // handle event ...
      res.json({ received: true });
    } catch (err) {
      if (err instanceof WebhookVerificationError) return res.status(401).json({ error: 'Invalid signature' });
      if (err instanceof WebhookParseError) return res.status(400).json({ error: 'Invalid payload' });
      throw err;
    }
  },
);
```

### Next.js App Router

```typescript
// app/api/webhooks/mainlayer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { MainlayerWebhook, WebhookVerificationError } from '@mainlayer/webhooks';

export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get('x-mainlayer-signature') ?? '';

  try {
    const event = MainlayerWebhook.construct(rawBody, signature, process.env.MAINLAYER_WEBHOOK_SECRET!);
    // handle event ...
    return NextResponse.json({ received: true });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    throw err;
  }
}
```

### TypeScript types

```typescript
import type {
  WebhookEvent,
  PaymentCompletedEvent,
  PaymentRefundedEvent,
  SubscriptionCreatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionCancelledEvent,
  EntitlementExpiredEvent,
  TypedWebhookEvent,
} from '@mainlayer/webhooks';
```

---

## Python

### Verify and construct an event

```python
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError, WebhookParseError

event = MainlayerWebhook.construct(
    payload=raw_body,                       # bytes — raw body, not decoded
    signature=headers["X-Mainlayer-Signature"],
    secret=os.environ["MAINLAYER_WEBHOOK_SECRET"],
)

if event.type == "payment.completed":
    print("Payment ID:", event.data.payment_id)
elif event.type == "subscription.created":
    print("Plan:", event.data.plan_name)
```

### Signature-only check

```python
is_valid = MainlayerWebhook.verify(raw_body, signature, secret)
```

### FastAPI

```python
from fastapi import FastAPI, Header, HTTPException, Request
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError, WebhookParseError

app = FastAPI()

@app.post("/webhooks/mainlayer")
async def receive_webhook(
    request: Request,
    x_mainlayer_signature: str = Header(..., alias="X-Mainlayer-Signature"),
):
    raw_body = await request.body()   # raw bytes required
    try:
        event = MainlayerWebhook.construct(raw_body, x_mainlayer_signature, WEBHOOK_SECRET)
    except WebhookVerificationError:
        raise HTTPException(status_code=401, detail="Invalid signature")
    except WebhookParseError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    # handle event ...
    return {"received": True}
```

### Django

```python
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError

@csrf_exempt
def webhook(request: HttpRequest) -> JsonResponse:
    signature = request.headers.get("X-Mainlayer-Signature", "")
    try:
        event = MainlayerWebhook.construct(request.body, signature, WEBHOOK_SECRET)
    except WebhookVerificationError:
        return JsonResponse({"error": "Invalid signature"}, status=401)

    # handle event ...
    return JsonResponse({"received": True})
```

### Flask

```python
from flask import Flask, request, jsonify
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError

app = Flask(__name__)

@app.route("/webhooks/mainlayer", methods=["POST"])
def webhook():
    signature = request.headers.get("X-Mainlayer-Signature", "")
    try:
        event = MainlayerWebhook.construct(request.get_data(), signature, WEBHOOK_SECRET)
    except WebhookVerificationError:
        return jsonify({"error": "Invalid signature"}), 401

    # handle event ...
    return jsonify({"received": True})
```

### Typed event models (Pydantic)

```python
from mainlayer_webhooks import (
    PaymentCompletedEvent,
    PaymentRefundedEvent,
    SubscriptionCreatedEvent,
    SubscriptionRenewedEvent,
    SubscriptionCancelledEvent,
    EntitlementExpiredEvent,
)

if isinstance(event, PaymentCompletedEvent):
    print(event.data.payment_id)   # fully typed
```

---

## Error handling

Both libraries raise two exception types:

| Exception | When |
|---|---|
| `WebhookVerificationError` | Signature does not match the payload (wrong secret, tampered body) |
| `WebhookParseError` | Payload is not valid JSON, missing required fields, or unknown event type |

Always return **HTTP 200** after successfully processing an event. Return **401** for signature failures and **400** for parse errors so Mainlayer knows whether to retry.

---

## Security

- Signatures are verified using **HMAC-SHA256** with `hmac.compare_digest` / `timingSafeEqual` to prevent timing attacks.
- Always pass the **raw request body** — never a re-serialised JSON string.
- Store your webhook secret in an environment variable, never in source code.
- Validate the `X-Mainlayer-Signature` header before trusting any payload data.

---

## Contributing

See [CONTRIBUTING.md](https://github.com/mainlayer/mainlayer-webhooks/blob/main/CONTRIBUTING.md).

## License

MIT
