/**
 * Feed Event Card component for displaying feed events
 */

import { motion } from 'framer-motion';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { FeedEvent, LeverageType } from '../../types';

interface FeedEventCardProps {
  event: FeedEvent;
  leverage: LeverageType;
  animateOnMount?: boolean;
}

export const FeedEventCard = ({
  event,
  leverage,
  animateOnMount = true,
}: FeedEventCardProps) => {
  const applyLeverage = (pnl: number) => pnl * leverage;

  const getEventIcon = () => {
    switch (event.type) {
      case 'signal_opened':
        return event.order_side === 'buy' ? (
          <ArrowUpCircle className="text-green-500 w-5 h-5" />
        ) : (
          <ArrowDownCircle className="text-red-500 w-5 h-5" />
        );
      case 'tp_hit':
        return <span className="text-green-500 font-bold text-xl">✓</span>;
      case 'stop_loss_hit':
        return <span className="text-red-500 font-bold text-xl">✕</span>;
      case 'opposite_closed':
        return <span className="text-yellow-500 font-bold text-xl">⟲</span>;
      case 'completed':
        return <span className="text-green-500 font-bold text-xl">✓✓✓</span>;
    }
  };

  const getEventColor = () => {
    switch (event.type) {
      case 'signal_opened':
        return event.order_side === 'buy'
          ? 'border-green-500/30'
          : 'border-red-500/30';
      case 'tp_hit':
      case 'completed':
        return 'border-green-500/30';
      case 'stop_loss_hit':
        return 'border-red-500/30';
      case 'opposite_closed':
        return 'border-yellow-500/30';
    }
  };

  return (
    <motion.div
      initial={animateOnMount ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`glass-card rounded-3xl p-5 border-l-4 ${getEventColor()} hover:glass-card-hover transition-all duration-300`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">{getEventIcon()}</div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h4 className="font-bold text-lg">
              {event.ticker.replace('.P', '')}
            </h4>
            <Badge
              variant={event.order_side === 'buy' ? 'default' : 'destructive'}
            >
              {event.order_side.toUpperCase()}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground mb-2">
            {event.description}
          </p>

          {event.profit_percent !== undefined && (
            <p
              className={`text-lg font-bold ${
                event.profit_percent >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {applyLeverage(event.profit_percent) >= 0 ? '+' : ''}
              {applyLeverage(event.profit_percent).toFixed(2)}%
            </p>
          )}

          {event.details && (
            <div className="text-xs text-muted-foreground mt-2 space-y-1">
              {event.details.entry_price && (
                <p>Entry: ${event.details.entry_price.toFixed(2)}</p>
              )}
              {event.details.exit_price && (
                <p>Exit: ${event.details.exit_price.toFixed(2)}</p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground/60 mt-2">
            {new Date(event.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
    </motion.div>
  );
};
