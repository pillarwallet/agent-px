/**
 * Shared types for Insights app
 */

export interface TradingSignal {
  id: string;
  order_side: string;
  ticker: string;
  entry_price: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  created_at: string;
  current_price?: number;
  profit_loss_percent?: number;
  realized_pnl_percent?: number;
  tp1_hit?: boolean;
  tp2_hit?: boolean;
  tp3_hit?: boolean;
  stop_loss_hit?: boolean;
  status?: string;
  last_price_update?: string;
  closed_at?: string;
  trailing_stop_history?: Array<{
    tp_level: string;
    new_stop_loss: number;
    timestamp: string;
    event?: string;
    tp_price?: number;
    moved?: boolean;
    old_stop?: number;
    new_stop?: number;
  }>;
}

export interface FeedEvent {
  id: string;
  timestamp: string;
  type: 'signal_opened' | 'tp_hit' | 'stop_loss_hit' | 'opposite_closed' | 'completed';
  ticker: string;
  order_side: string;
  description: string;
  profit_percent?: number;
  details?: {
    entry_price?: number;
    exit_price?: number;
    tp_level?: number;
  };
}

export interface SparklineDataPoint {
  time: number;
  price: number;
}

export type TabType = 'open' | 'closed' | 'feed' | 'all';
export type PnLViewType = 'floating' | 'open' | 'closed' | null;
export type LeverageType = 1 | 3 | 5 | 10;

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'unknown';

export interface SubscriptionRecord {
  eoaAddress: string;
  clientReferenceId?: string | null;
  status?: SubscriptionStatus;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  cancelAt?: number | null;
  cancelAtPeriodEnd?: boolean | null;
  canceledAt?: number | null;
  currentPeriodStart?: number | null;
  currentPeriodEnd?: number | null;
  trialStart?: number | null;
  trialEnd?: number | null;
  defaultPaymentMethodId?: string | null;
  collectionMethod?: string | null;
  pauseBehavior?: string | null;
  pauseResumesAt?: number | null;
  priceId?: string | null;
  priceNickname?: string | null;
  productId?: string | null;
  currency?: string | null;
  amount?: number | null;
  interval?: string | null;
  latestEventId?: string | null;
  latestEventType?: string | null;
  checkoutSessionId?: string | null;
  checkoutMode?: string | null;
  checkoutStatus?: string | null;
  lastInvoiceId?: string | null;
  lastInvoiceStatus?: string | null;
  lastInvoiceDueDate?: number | null;
  lastInvoiceCreated?: number | null;
  lastInvoiceTotal?: number | null;
  lastInvoiceCurrency?: string | null;
  lastInvoiceHostedUrl?: string | null;
  lastInvoicePdf?: string | null;
  upcomingInvoiceDueDate?: number | null;
  entitlements?: Array<{
    feature: string | null;
    reference: string | null;
    expiresAt: number | null;
    startsAt: number | null;
  }>;
  entitlementsUpdatedAt?: number | null;
  isActive?: boolean;
  updatedAt?: number | null;
  lastWebhookAt?: number | null;
}

export interface SubscriptionApiResponse {
  subscription: SubscriptionRecord | null;
}

