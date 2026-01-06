/**
 * Utility functions for working with trading signals
 */

import type { TradingSignal, FeedEvent, SparklineDataPoint } from '../types';
import {
  normalizeTrailingHistory,
  getEffectiveStopLoss,
} from '../lib/stopLossUtils';
import { formatPrice } from './formatUtils';

/**
 * Get the next TP target for a signal
 */
export const getNextTP = (signal: TradingSignal): number => {
  if (!signal.tp1_hit) return signal.tp1;
  if (!signal.tp2_hit) return signal.tp2;
  if (!signal.tp3_hit) return signal.tp3;
  return signal.tp3; // All hit, show last TP
};

/**
 * Generate timeline events for a signal
 */
export const generateSignalTimeline = (signal: TradingSignal) => {
  const { events, latestStop } = normalizeTrailingHistory(signal);
  const timelineItems: Array<{
    icon: string;
    iconColor: string;
    label: string;
    price: number;
    timestamp: string;
    pnl: number | null;
    detail?: string;
  }> = [];

  for (const event of events) {
    switch (event.type) {
      case 'opened':
        timelineItems.push({
          icon: 'TrendingUp',
          iconColor: 'text-blue-400',
          label: 'Signal Opened',
          price: signal.entry_price,
          timestamp: event.timestamp,
          pnl: null,
          detail: `Original Stop Loss: $${formatPrice(event.original_stop || signal.stop_loss, signal.ticker)}`,
        });
        break;

      case 'tp_hit':
        const tpPercent =
          (((event.tp_price || 0) - signal.entry_price) / signal.entry_price) *
          100;
        const lockedIn = tpPercent * 0.3333;

        timelineItems.push({
          icon: 'Target',
          iconColor: 'text-emerald-400',
          label: `${event.tp_level?.toUpperCase()} Hit`,
          price: event.tp_price || 0,
          timestamp: event.timestamp,
          pnl: lockedIn,
        });

        // Add stop loss move event if it moved
        if (event.moved && event.old_stop && event.new_stop) {
          timelineItems.push({
            icon: 'RefreshCw',
            iconColor: 'text-green-400',
            label: 'Stop Loss Moved',
            price: event.new_stop,
            timestamp: event.timestamp,
            pnl: null,
            detail: `$${formatPrice(event.old_stop, signal.ticker)} → $${formatPrice(event.new_stop, signal.ticker)}`,
          });
        }
        break;

      case 'stop_loss_hit':
        // Calculate stop loss P&L based on position type
        const isShortSL = signal.order_side?.toLowerCase() === 'sell';
        const slPercent = isShortSL
          ? ((signal.entry_price - (event.stop_price || latestStop)) /
              signal.entry_price) *
            100 // SHORT
          : (((event.stop_price || latestStop) - signal.entry_price) /
              signal.entry_price) *
            100; // LONG
        timelineItems.push({
          icon: 'XCircle',
          iconColor: 'text-red-400',
          label: 'Stop Loss Hit',
          price: event.stop_price || latestStop,
          timestamp: event.timestamp,
          pnl: slPercent,
        });
        break;

      case 'closed':
        timelineItems.push({
          icon: 'CheckCircle2',
          iconColor: 'text-slate-400',
          label: 'Closed',
          price: event.exit_price || signal.current_price || signal.entry_price,
          timestamp: event.timestamp,
          pnl: signal.realized_pnl_percent || 0,
        });
        break;
    }
  }

  return timelineItems;
};

/**
 * Generate feed events from signals
 */
export const generateFeedEvents = (signals: TradingSignal[]): FeedEvent[] => {
  const events: FeedEvent[] = [];

  signals.forEach((signal) => {
    // Event 1: Signal opened - BOTH BUY AND SELL
    const isShort = signal.order_side?.toLowerCase() === 'sell';
    events.push({
      id: `${signal.id}-opened`,
      timestamp: signal.created_at,
      type: 'signal_opened',
      ticker: signal.ticker,
      order_side: signal.order_side,
      description: `${isShort ? 'SHORT' : 'LONG'} position opened`,
      details: { entry_price: signal.entry_price },
    });

    // Event 2-4: TP hits
    [1, 2, 3].forEach((level) => {
      const tpHit = signal[`tp${level}_hit` as keyof TradingSignal];
      const tpPrice = signal[`tp${level}` as keyof TradingSignal];

      if (tpHit === true && tpPrice && Number(tpPrice) > 0) {
        // Calculate TP profit based on position type
        const isShort = signal.order_side?.toLowerCase() === 'sell';
        const tpPercent = isShort
          ? ((signal.entry_price - Number(tpPrice)) / signal.entry_price) * 100 // SHORT
          : ((Number(tpPrice) - signal.entry_price) / signal.entry_price) * 100; // LONG
        const lockedInPercent = tpPercent * 0.3333;

        // Increase spacing to 10 seconds between TPs to avoid collision
        const baseTimestamp = new Date(signal.created_at);
        const tpTimestamp = new Date(baseTimestamp.getTime() + level * 10000);

        const event: FeedEvent = {
          id: `${signal.id}-tp${level}`,
          timestamp: tpTimestamp.toISOString(),
          type: 'tp_hit',
          ticker: signal.ticker,
          order_side: signal.order_side,
          description: `TP${level} hit`,
          profit_percent: lockedInPercent,
          details: {
            entry_price: signal.entry_price,
            exit_price: Number(tpPrice),
            tp_level: level,
          },
        };

        events.push(event);
      }
    });

    // Event 7: Stop loss hit
    if (signal.stop_loss_hit && signal.status === 'stopped') {
      events.push({
        id: `${signal.id}-sl`,
        timestamp:
          signal.closed_at || signal.last_price_update || signal.created_at,
        type: 'stop_loss_hit',
        ticker: signal.ticker,
        order_side: signal.order_side,
        description: 'Stop loss hit',
        profit_percent: signal.realized_pnl_percent || 0,
        details: {
          entry_price: signal.entry_price,
          exit_price: getEffectiveStopLoss(signal),
        },
      });
    }

    // Event 8: Closed due to opposite direction
    if (signal.status === 'closed') {
      const exitPrice = signal.current_price || signal.entry_price;

      events.push({
        id: `${signal.id}-opposite`,
        timestamp: signal.closed_at || signal.created_at,
        type: 'opposite_closed',
        ticker: signal.ticker,
        order_side: signal.order_side,
        description: 'Closed by opposite direction signal',
        profit_percent: signal.realized_pnl_percent || 0,
        details: {
          entry_price: signal.entry_price,
          exit_price: exitPrice,
        },
      });
    }

    // Event 9: Trade completed (all TPs hit)
    if (signal.status === 'completed') {
      events.push({
        id: `${signal.id}-completed`,
        timestamp: signal.closed_at || signal.created_at,
        type: 'completed',
        ticker: signal.ticker,
        order_side: signal.order_side,
        description: 'All take profits hit',
        profit_percent: signal.realized_pnl_percent || 0,
        details: {
          entry_price: signal.entry_price,
        },
      });
    }
  });

  // Sort by timestamp (most recent first)
  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
};

/**
 * Generate sparkline data for Overall P&L
 */
export const generateOverallPnLSparkline = (
  closedSignals: TradingSignal[]
): Array<{ value: number }> => {
  const closedWithPnL = closedSignals
    .filter((s) => s.realized_pnl_percent !== null && s.closed_at)
    .sort(
      (a, b) =>
        new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()
    );

  if (closedWithPnL.length === 0) return [];

  let cumulative = 0;
  return closedWithPnL.map((s) => {
    cumulative += s.realized_pnl_percent || 0;
    return { value: cumulative };
  });
};

/**
 * Generate sparkline data for Open Positions P&L
 */
export const generateOpenPnLSparkline = (
  openSignals: TradingSignal[]
): Array<{ value: number }> => {
  const openWithPnL = openSignals
    .filter((s) => s.profit_loss_percent !== null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  if (openWithPnL.length === 0) return [];

  let cumulative = 0;
  return openWithPnL.map((s) => {
    cumulative += s.profit_loss_percent || 0;
    return { value: cumulative };
  });
};

/**
 * Generate sparkline data for Closed Trades P&L (including realized from open)
 */
export const generateClosedPnLSparkline = (
  closedSignals: TradingSignal[],
  openSignals: TradingSignal[]
): Array<{ value: number }> => {
  // Combine closed trades and open trades with realized P&L
  const closedWithPnL = closedSignals
    .filter((s) => s.realized_pnl_percent !== null && s.closed_at)
    .map((s) => ({
      timestamp: new Date(s.closed_at!).getTime(),
      pnl: s.realized_pnl_percent || 0,
      isClosed: true,
    }));

  const openWithRealizedPnL = openSignals
    .filter((s) => s.realized_pnl_percent && s.realized_pnl_percent > 0)
    .map((s) => ({
      timestamp: new Date(s.last_price_update || s.created_at).getTime(),
      pnl: s.realized_pnl_percent || 0,
      isClosed: false,
    }));

  const allEvents = [...closedWithPnL, ...openWithRealizedPnL].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  if (allEvents.length === 0) return [];

  let cumulative = 0;
  return allEvents.map((event) => {
    cumulative += event.pnl;
    return { value: cumulative };
  });
};
