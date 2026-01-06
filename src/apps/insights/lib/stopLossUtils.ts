// Helper utilities for handling stop loss display and calculations

interface TradingSignal {
  stop_loss: number;
  order_side?: string | null;
  created_at: string;
  closed_at?: string | null;
  status?: string | null;
  stop_loss_hit?: boolean | null;
  current_price?: number | null;
  trailing_stop_history?: Array<any> | null;
  tp1?: number | null;
  tp1_hit?: boolean | null;
  tp2?: number | null;
  tp2_hit?: boolean | null;
  tp3?: number | null;
  tp3_hit?: boolean | null;
}

/**
 * Get the effective (current) stop loss for a trading signal.
 * Returns the original stop loss if no trailing stops are active,
 * or the most recent trailing stop loss from the history.
 */
export function getEffectiveStopLoss(signal: TradingSignal): number {
  if (
    !signal.trailing_stop_history ||
    signal.trailing_stop_history.length === 0
  ) {
    return signal.stop_loss; // Original stop loss
  }

  // Return the most recent trailing stop loss from history
  const latest =
    signal.trailing_stop_history[signal.trailing_stop_history.length - 1];
  return latest.new_stop_loss || latest.new_stop || signal.stop_loss;
}

/**
 * Check if a trading signal has an active trailing stop loss
 */
export function hasTrailingStop(signal: TradingSignal): boolean {
  return !!(
    signal.trailing_stop_history && signal.trailing_stop_history.length > 0
  );
}

/**
 * Get the stop loss display info for UI
 * Returns both original and current stop loss with formatting hints
 */
export function getStopLossDisplayInfo(signal: TradingSignal) {
  const originalSL = signal.stop_loss;
  const currentSL = getEffectiveStopLoss(signal);
  const isTrailing = hasTrailingStop(signal);

  return {
    original: originalSL,
    current: currentSL,
    isTrailing,
    displayText: isTrailing
      ? `${originalSL.toFixed(2)} → ${currentSL.toFixed(2)}`
      : currentSL.toFixed(2),
    tooltip: isTrailing
      ? `Original: $${originalSL.toFixed(2)}, Trailing: $${currentSL.toFixed(2)}`
      : `Stop Loss: $${originalSL.toFixed(2)}`,
  };
}

/**
 * Normalized timeline event types
 */
export interface TimelineEvent {
  type: 'opened' | 'tp_hit' | 'stop_loss_hit' | 'closed';
  timestamp: string;
  tp_level?: string;
  tp_price?: number;
  moved?: boolean;
  old_stop?: number;
  new_stop?: number;
  stop_price?: number;
  exit_price?: number;
  original_stop?: number;
}

/**
 * Normalize trailing stop history from various formats into a unified timeline
 * Handles both legacy and new history formats, and infers events when history is missing
 */
export function normalizeTrailingHistory(signal: TradingSignal): {
  events: TimelineEvent[];
  latestStop: number;
} {
  const events: TimelineEvent[] = [];
  let currentSL = signal.stop_loss;
  const isShort = signal.order_side?.toLowerCase() === 'sell';

  // Add opening event
  events.push({
    type: 'opened',
    timestamp: signal.created_at,
    original_stop: currentSL,
  });

  // Process trailing stop history
  const raw = Array.isArray(signal.trailing_stop_history)
    ? signal.trailing_stop_history
    : [];

  if (raw.length > 0) {
    // Use actual history if available
    for (const h of raw) {
      // Handle new normalized format
      if (h.event === 'tp_hit') {
        const oldStop = h.old_stop ?? currentSL;
        const newStop = h.new_stop ?? currentSL;

        events.push({
          type: 'tp_hit',
          timestamp: h.timestamp,
          tp_level: h.tp_level,
          tp_price: h.tp_price,
          moved: h.moved ?? newStop !== oldStop,
          old_stop: oldStop,
          new_stop: newStop,
        });

        currentSL = newStop;
      }
      // Handle legacy recalc format: { tp_level, new_stop_loss, timestamp }
      else if (h.tp_level && h.new_stop_loss !== undefined) {
        const oldStop = currentSL;
        const newStop = h.new_stop_loss;

        events.push({
          type: 'tp_hit',
          timestamp: h.timestamp,
          tp_level: h.tp_level,
          moved: newStop !== oldStop,
          old_stop: oldStop,
          new_stop: newStop,
        });

        currentSL = newStop;
      }
      // Handle legacy webhook format: { reason, price, old_stop, new_stop, timestamp }
      else if (
        h.reason &&
        h.old_stop !== undefined &&
        h.new_stop !== undefined
      ) {
        const tpMatch = h.reason?.match(/tp(\d+)_hit/);
        const tpLevel = tpMatch ? `tp${tpMatch[1]}` : undefined;

        events.push({
          type: 'tp_hit',
          timestamp: h.timestamp,
          tp_level: tpLevel,
          tp_price: h.price,
          moved: h.new_stop !== h.old_stop,
          old_stop: h.old_stop,
          new_stop: h.new_stop,
        });

        currentSL = h.new_stop;
      }
    }
  } else {
    // Infer timeline from tp_hit booleans when history is missing
    const tpLevels = [
      { name: 'tp1', hit: signal.tp1_hit, price: signal.tp1 },
      { name: 'tp2', hit: signal.tp2_hit, price: signal.tp2 },
      { name: 'tp3', hit: signal.tp3_hit, price: signal.tp3 },
    ].filter((tp) => tp.price && tp.hit);

    let inferredTime = new Date(signal.created_at).getTime();
    const closedTime = signal.closed_at
      ? new Date(signal.closed_at).getTime()
      : Date.now();
    const timeStep =
      tpLevels.length > 0
        ? (closedTime - inferredTime) / (tpLevels.length + 1)
        : 0;

    for (const tp of tpLevels) {
      inferredTime += timeStep;
      const oldStop = currentSL;
      // Calculate new stop based on position type
      const newStop = isShort
        ? tp.price! * 1.05 // SHORT: 5% above TP (moving DOWN as price falls)
        : tp.price! * 0.95; // LONG: 5% below TP (moving UP as price rises)

      // Check if stop should move based on position type
      const moved = isShort
        ? newStop < currentSL // SHORT: only move DOWN
        : newStop > currentSL; // LONG: only move UP

      events.push({
        type: 'tp_hit',
        timestamp: new Date(inferredTime).toISOString(),
        tp_level: tp.name,
        tp_price: tp.price!,
        moved,
        old_stop: oldStop,
        new_stop: moved ? newStop : oldStop,
      });

      if (moved) {
        currentSL = newStop;
      }
    }
  }

  // Add final event (stop loss hit or closed)
  if (signal.stop_loss_hit && signal.closed_at) {
    events.push({
      type: 'stop_loss_hit',
      timestamp: signal.closed_at,
      stop_price: currentSL,
    });
  } else if (signal.status === 'stopped' && signal.closed_at) {
    // Infer stop loss hit if status is 'stopped'
    events.push({
      type: 'stop_loss_hit',
      timestamp: signal.closed_at,
      stop_price: currentSL,
    });
  } else if (signal.status === 'completed' && signal.closed_at) {
    events.push({
      type: 'closed',
      timestamp: signal.closed_at,
      exit_price: signal.current_price ?? undefined,
    });
  } else if (signal.status === 'closed' && signal.closed_at) {
    events.push({
      type: 'closed',
      timestamp: signal.closed_at,
      exit_price: signal.current_price ?? undefined,
    });
  }

  // Sort by timestamp
  events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return { events, latestStop: currentSL };
}
