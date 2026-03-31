# mainlayer-webhooks

Official webhook signature verification and event parsing library for [Mainlayer](https://api.mainlayer.fr) — payment infrastructure for AI agents.

Fast, secure webhook handling in **TypeScript/JavaScript**, **Python**, and **Go**.

---

## Installation

### TypeScript / JavaScript

```bash
npm install @mainlayer/webhooks
```

### Python

```bash
pip install mainlayer-webhooks
```

### Go

```bash
go get github.com/mainlayer/mainlayer-webhooks-go
```

---

## Quick start (30 seconds)

### TypeScript / Express

```typescript
import express from 'express';
import { MainlayerWebhook, WebhookVerificationError } from '@mainlayer/webhooks';

app.post(
  '/webhooks/mainlayer',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      const event = MainlayerWebhook.construct(
        req.body,
        req.headers['x-mainlayer-signature'],
        process.env.MAINLAYER_WEBHOOK_SECRET
      );

      // Handle based on event type
      if (event.type === 'payment.completed') {
        console.log('Payment processed:', event.data.payment_id);
        // Grant access, unlock features, etc.
      }

      res.json({ received: true });
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      throw err;
    }
  }
);
```

### Python / FastAPI

```python
from fastapi import FastAPI, Header, HTTPException, Request
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError

@app.post("/webhooks/mainlayer")
async def receive_webhook(
    request: Request,
    x_mainlayer_signature: str = Header(...)
):
    raw_body = await request.body()
    try:
        event = MainlayerWebhook.construct(
            raw_body,
            x_mainlayer_signature,
            os.environ["MAINLAYER_WEBHOOK_SECRET"]
        )

        if event.type == "payment.completed":
            print(f"Payment: {event.data.payment_id}")
            # Grant access, etc.

        return {"received": True}
    except WebhookVerificationError:
        raise HTTPException(status_code=401, detail="Invalid signature")
```

### Go

```go
package main

import (
	"github.com/mainlayer/mainlayer-webhooks-go"
)

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	signature := r.Header.Get("X-Mainlayer-Signature")
	secret := os.Getenv("MAINLAYER_WEBHOOK_SECRET")

	body, _ := io.ReadAll(r.Body)

	event, err := webhooks.ConstructEvent(body, signature, secret)
	if err != nil {
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	if event.Type == "payment.completed" {
		log.Printf("Payment: %s", event.Data.PaymentID)
		// Grant access, etc.
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"received": true})
}
```

---

## Supported event types

| Event | When | Common use cases |
|---|---|---|
| `payment.completed` | Payment successfully processed | Grant access, unlock API tier |
| `payment.refunded` | Payment was refunded | Revoke access, reduce quota |
| `subscription.created` | New subscription started | Activate subscription plan |
| `subscription.renewed` | Subscription renewed | Extend access/quota |
| `subscription.cancelled` | Subscription cancelled | Revoke access immediately |
| `resource.activated` | Feature/resource enabled | Unlock premium features |

---

## How webhook signatures work

Mainlayer signs every webhook with **HMAC-SHA256** using your secret key:

```
Header: X-Mainlayer-Signature: 3d4f2a8b7c6e1f9d...
```

The signature covers the **raw request body** (as bytes, before any parsing).

**Why this matters:**
- Prevents tampering — even small changes invalidate the signature
- Timing-safe comparison prevents timing attacks
- Raw body verification works across all frameworks

---

## Setup: Get your webhook secret

1. Go to [mainlayer.fr](https://mainlayer.fr)
2. Navigate to **Settings** → **Webhooks**
3. Create a new endpoint with your URL
4. Copy the **Signing Secret** (`whk_test_...`)
5. Store safely: `export MAINLAYER_WEBHOOK_SECRET="whk_test_..."`

**Never commit webhook secrets to source control.**

---

## TypeScript / JavaScript

### Event construction & verification

```typescript
import {
  MainlayerWebhook,
  WebhookVerificationError,
  WebhookParseError
} from '@mainlayer/webhooks';

try {
  const event = MainlayerWebhook.construct(
    rawBody,          // Buffer | string (raw bytes, not parsed)
    signature,        // string from X-Mainlayer-Signature header
    secret            // string from environment
  );

  console.log(event.type);  // "payment.completed"
  console.log(event.data);  // { payment_id: "pay_...", amount_usd: 1.00, ... }
} catch (err) {
  if (err instanceof WebhookVerificationError) {
    // Signature mismatch — reject the request
    return res.status(401).send('Unauthorized');
  }
  if (err instanceof WebhookParseError) {
    // Invalid JSON or unknown event type
    return res.status(400).send('Bad request');
  }
  throw err;
}
```

### Signature verification only

```typescript
const isValid = MainlayerWebhook.verify(rawBody, signature, secret);
if (!isValid) {
  return res.status(401).send('Invalid signature');
}
```

### Express

```typescript
import express from 'express';
import { MainlayerWebhook, WebhookVerificationError } from '@mainlayer/webhooks';

const app = express();

app.post(
  '/webhooks/mainlayer',
  express.raw({ type: 'application/json' }),   // MUST be raw, not express.json()
  (req, res) => {
    try {
      const event = MainlayerWebhook.construct(
        req.body,
        req.headers['x-mainlayer-signature'] as string,
        process.env.MAINLAYER_WEBHOOK_SECRET!
      );

      switch (event.type) {
        case 'payment.completed':
          handlePaymentCompleted(event.data);
          break;
        case 'subscription.created':
          handleSubscriptionCreated(event.data);
          break;
        case 'subscription.cancelled':
          handleSubscriptionCancelled(event.data);
          break;
      }

      res.json({ received: true });
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
      return res.status(400).json({ error: 'Invalid payload' });
    }
  }
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
  const secret = process.env.MAINLAYER_WEBHOOK_SECRET ?? '';

  try {
    const event = MainlayerWebhook.construct(rawBody, signature, secret);

    // Handle event
    switch (event.type) {
      case 'payment.completed':
        await grantAccess(event.data.payer_wallet);
        break;
      case 'subscription.cancelled':
        await revokeAccess(event.data.payer_wallet);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Invalid payload' },
      { status: 400 }
    );
  }
}
```

### Typed events

```typescript
import type {
  WebhookEvent,
  PaymentCompletedEvent,
  PaymentRefundedEvent,
  SubscriptionCreatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionCancelledEvent,
  ResourceActivatedEvent,
  TypedWebhookEvent,
} from '@mainlayer/webhooks';

const event: TypedWebhookEvent = MainlayerWebhook.construct(...);

// Full type safety by event type
if (event.type === 'payment.completed') {
  const data: PaymentCompletedEvent['data'] = event.data;
  console.log(data.payment_id, data.amount_usd);
}
```

---

## Python

### Event construction & verification

```python
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError, WebhookParseError
import os

try:
    event = MainlayerWebhook.construct(
        payload=raw_body,                           # bytes
        signature=headers["X-Mainlayer-Signature"], # str
        secret=os.environ["MAINLAYER_WEBHOOK_SECRET"] # str
    )

    print(event.type)   # "payment.completed"
    print(event.data)   # {"payment_id": "pay_...", "amount_usd": 1.00, ...}
except WebhookVerificationError:
    # Signature mismatch
    return {"error": "Unauthorized"}, 401
except WebhookParseError:
    # Invalid JSON or unknown event type
    return {"error": "Bad request"}, 400
```

### Signature verification only

```python
is_valid = MainlayerWebhook.verify(raw_body, signature, secret)
if not is_valid:
    return {"error": "Invalid signature"}, 401
```

### FastAPI

```python
from fastapi import FastAPI, Header, HTTPException, Request
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError

app = FastAPI()

@app.post("/webhooks/mainlayer")
async def receive_webhook(
    request: Request,
    x_mainlayer_signature: str = Header(..., alias="X-Mainlayer-Signature")
):
    raw_body = await request.body()

    try:
        event = MainlayerWebhook.construct(
            raw_body,
            x_mainlayer_signature,
            os.environ["MAINLAYER_WEBHOOK_SECRET"]
        )

        match event.type:
            case "payment.completed":
                await grant_access(event.data["payer_wallet"])
            case "subscription.cancelled":
                await revoke_access(event.data["payer_wallet"])

        return {"received": True}
    except WebhookVerificationError:
        raise HTTPException(status_code=401, detail="Invalid signature")
    except WebhookParseError:
        raise HTTPException(status_code=400, detail="Invalid payload")
```

### Django

```python
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError
import os

@csrf_exempt
@require_http_methods(["POST"])
def webhook_mainlayer(request: HttpRequest) -> JsonResponse:
    signature = request.headers.get("X-Mainlayer-Signature", "")

    try:
        event = MainlayerWebhook.construct(
            request.body,
            signature,
            os.environ["MAINLAYER_WEBHOOK_SECRET"]
        )

        if event.type == "payment.completed":
            grant_access(event.data["payer_wallet"])
        elif event.type == "subscription.cancelled":
            revoke_access(event.data["payer_wallet"])

        return JsonResponse({"received": True})
    except WebhookVerificationError:
        return JsonResponse({"error": "Invalid signature"}, status=401)
    except Exception:
        return JsonResponse({"error": "Invalid payload"}, status=400)
```

### Flask

```python
from flask import Flask, request, jsonify
from mainlayer_webhooks import MainlayerWebhook, WebhookVerificationError
import os

app = Flask(__name__)

@app.route("/webhooks/mainlayer", methods=["POST"])
def webhook_mainlayer():
    signature = request.headers.get("X-Mainlayer-Signature", "")

    try:
        event = MainlayerWebhook.construct(
            request.get_data(),
            signature,
            os.environ["MAINLAYER_WEBHOOK_SECRET"]
        )

        if event.type == "payment.completed":
            grant_access(event.data["payer_wallet"])
        elif event.type == "subscription.cancelled":
            revoke_access(event.data["payer_wallet"])

        return jsonify({"received": True})
    except WebhookVerificationError:
        return jsonify({"error": "Invalid signature"}), 401
    except Exception:
        return jsonify({"error": "Invalid payload"}), 400
```

### Typed events (Pydantic)

```python
from mainlayer_webhooks import (
    PaymentCompletedEvent,
    PaymentRefundedEvent,
    SubscriptionCreatedEvent,
    SubscriptionRenewedEvent,
    SubscriptionCancelledEvent,
    ResourceActivatedEvent,
)

event = MainlayerWebhook.construct(...)

if isinstance(event, PaymentCompletedEvent):
    print(event.data.payment_id)      # Fully typed
    print(event.data.amount_usd)
```

---

## Go

### Event construction & verification

```go
package main

import (
	"net/http"
	webhooks "github.com/mainlayer/mainlayer-webhooks-go"
)

func handleWebhook(w http.ResponseWriter, r *http.Request) {
	signature := r.Header.Get("X-Mainlayer-Signature")
	secret := os.Getenv("MAINLAYER_WEBHOOK_SECRET")

	body, _ := io.ReadAll(r.Body)

	event, err := webhooks.ConstructEvent(body, signature, secret)
	if err != nil {
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	switch event.Type {
	case "payment.completed":
		handlePaymentCompleted(event.Data)
	case "subscription.cancelled":
		handleSubscriptionCancelled(event.Data)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"received": true})
}
```

### Signature verification only

```go
isValid := webhooks.Verify(body, signature, secret)
if !isValid {
	http.Error(w, "Invalid signature", http.StatusUnauthorized)
	return
}
```

---

## Error handling

### Return status codes correctly

| Scenario | Status | What happens |
|---|---|---|
| Signature invalid | `401` | Mainlayer stops retrying (check your secret) |
| JSON parsing failed | `400` | Mainlayer stops retrying (check payload format) |
| Processed successfully | `200` | Mainlayer considers it delivered |
| Internal error (DB down) | `500` | Mainlayer retries the webhook |

**Exception types (TypeScript/Python):**

- `WebhookVerificationError` — signature mismatch
- `WebhookParseError` — invalid JSON or unknown event type

---

## Security checklist

- [ ] Use **raw request body** (not pre-parsed JSON)
- [ ] Store webhook secret in **environment variable** (not source code)
- [ ] Verify signature **before** processing the payload
- [ ] Return correct HTTP status codes
- [ ] Use **HTTPS** for your webhook endpoint
- [ ] Log webhook events for debugging (sanitize sensitive data)
- [ ] Implement **idempotency** — handle duplicate webhooks gracefully

---

## Testing webhooks locally

Use [Mainlayer CLI](https://docs.mainlayer.fr/cli) to send test webhooks:

```bash
mainlayer webhooks test \
  --endpoint http://localhost:3000/webhooks/mainlayer \
  --event payment.completed \
  --secret whk_test_...
```

---

## Troubleshooting

### `WebhookVerificationError: Invalid signature`

1. Verify you're using the **signing secret** (not API key)
2. Check you're reading the **raw request body** (not re-serialized JSON)
3. Make sure the secret is **exact** (no extra whitespace)

```typescript
// WRONG — will fail signature verification
const parsed = JSON.parse(rawBody);
const event = MainlayerWebhook.construct(JSON.stringify(parsed), sig, secret);

// CORRECT
const event = MainlayerWebhook.construct(rawBody, sig, secret);
```

### `WebhookParseError: Unknown event type`

- Check the `event.type` is one of the supported types above
- Verify Mainlayer webhook is configured to send those events
- Check for typos in event name (e.g., `paymentcompleted` vs `payment.completed`)

### Webhook not being called

1. Verify endpoint URL is **publicly accessible** (not localhost)
2. Check endpoint uses **HTTPS** (Mainlayer requires it)
3. Ensure **no authentication** is required on the endpoint (or add to webhook config)
4. Check firewall rules aren't blocking inbound requests

---

## Contributing

See [CONTRIBUTING.md](https://github.com/mainlayer/mainlayer-webhooks/blob/main/CONTRIBUTING.md).

## License

MIT

---

**Need help?** See [docs.mainlayer.fr](https://docs.mainlayer.fr) or open an issue on [GitHub](https://github.com/mainlayer/mainlayer-webhooks/issues).
