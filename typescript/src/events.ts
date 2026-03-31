/**
 * Typed event interfaces for all Mainlayer webhook event types.
 */

export type WebhookEventType =
  | 'payment.completed'
  | 'payment.refunded'
  | 'subscription.created'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'entitlement.expired';

/**
 * Base webhook event shape shared by all event types.
 */
export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  data: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Payment events
// ---------------------------------------------------------------------------

export interface PaymentData {
  [key: string]: unknown;
  payment_id: string;
  amount: number;
  currency: string;
  customer_id: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentCompletedData extends PaymentData {
  status: 'completed';
  completed_at: string;
}

export interface PaymentRefundedData extends PaymentData {
  refund_id: string;
  refund_amount: number;
  reason?: string;
  refunded_at: string;
}

export interface PaymentCompletedEvent extends WebhookEvent {
  type: 'payment.completed';
  data: PaymentCompletedData;
}

export interface PaymentRefundedEvent extends WebhookEvent {
  type: 'payment.refunded';
  data: PaymentRefundedData;
}

// ---------------------------------------------------------------------------
// Subscription events
// ---------------------------------------------------------------------------

export interface SubscriptionData {
  [key: string]: unknown;
  subscription_id: string;
  customer_id: string;
  plan_id: string;
  plan_name: string;
  amount: number;
  currency: string;
  interval: 'monthly' | 'annual' | 'weekly';
  current_period_start: string;
  current_period_end: string;
  metadata?: Record<string, string>;
}

export interface SubscriptionCreatedData extends SubscriptionData {
  status: 'active';
  trial_end?: string;
}

export interface SubscriptionRenewedData extends SubscriptionData {
  status: 'active';
  renewed_at: string;
  next_renewal: string;
}

export interface SubscriptionCancelledData extends SubscriptionData {
  status: 'cancelled';
  cancelled_at: string;
  cancellation_reason?: string;
  ends_at: string;
}

export interface SubscriptionCreatedEvent extends WebhookEvent {
  type: 'subscription.created';
  data: SubscriptionCreatedData;
}

export interface SubscriptionRenewedEvent extends WebhookEvent {
  type: 'subscription.renewed';
  data: SubscriptionRenewedData;
}

export interface SubscriptionCancelledEvent extends WebhookEvent {
  type: 'subscription.cancelled';
  data: SubscriptionCancelledData;
}

// ---------------------------------------------------------------------------
// Entitlement events
// ---------------------------------------------------------------------------

export interface EntitlementData {
  [key: string]: unknown;
  entitlement_id: string;
  customer_id: string;
  feature_key: string;
  feature_name: string;
  subscription_id?: string;
  metadata?: Record<string, string>;
}

export interface EntitlementExpiredData extends EntitlementData {
  expired_at: string;
  expires_at: string;
}

export interface EntitlementExpiredEvent extends WebhookEvent {
  type: 'entitlement.expired';
  data: EntitlementExpiredData;
}

// ---------------------------------------------------------------------------
// Discriminated union helper
// ---------------------------------------------------------------------------

export type TypedWebhookEvent =
  | PaymentCompletedEvent
  | PaymentRefundedEvent
  | SubscriptionCreatedEvent
  | SubscriptionRenewedEvent
  | SubscriptionCancelledEvent
  | EntitlementExpiredEvent;
