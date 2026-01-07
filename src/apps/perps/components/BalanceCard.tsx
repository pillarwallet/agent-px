import { Card } from './ui/card';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import type { UserState } from '../lib/hyperliquid/types';
import { useMemo } from 'react';

interface BalanceCardProps {
  userState: UserState;
  isLoading: boolean;
  masterAddress: string;
  onRefresh?: () => void;
}

export function BalanceCard({
  userState,
  isLoading,
  masterAddress,
  onRefresh,
}: BalanceCardProps) {
  const accountEquity = parseFloat(
    userState.marginSummary?.accountValue || '0'
  );

  // Calculate total PnL from all positions
  const totalPnl = useMemo(() => {
    if (!userState.assetPositions) return 0;
    return userState.assetPositions.reduce((sum, pos) => {
      return sum + parseFloat(pos.position.unrealizedPnl || '0');
    }, 0);
  }, [userState.assetPositions]);

  const pnlPercent = accountEquity > 0
    ? ((totalPnl / (accountEquity - totalPnl)) * 100).toFixed(2)
    : '0.00';

  const isPnlPositive = totalPnl >= 0;

  return (
    <Card className="p-3 pt-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Perps Balance</span>
        </div>
        <div className="flex items-center gap-2">
          <DepositModal userState={userState} />
          <WithdrawModal
            userState={userState}
            masterAddress={masterAddress}
            onSuccess={onRefresh}
          />
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-8 w-8"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2 pb-1 mt-2">
        {/* Main Balance */}
        <div>
          <p className="text-3xl font-bold font-mono-numbers">
            ${accountEquity.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        {/* PnL Display */}
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-0.5 rounded-md text-sm font-semibold ${isPnlPositive
            ? 'bg-green-500/10 text-green-500'
            : 'bg-red-500/10 text-red-500'
            }`}>
            {isPnlPositive ? '+' : ''}${totalPnl.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className={`text-sm font-semibold ${isPnlPositive ? 'text-green-500' : 'text-red-500'
            }`}>
            {isPnlPositive ? '+' : ''}{pnlPercent}% {isPnlPositive ? '↑' : '↓'}
          </div>
        </div>

        {/* Note about PnL calculation */}
        <p className="text-xs text-muted-foreground">
          Showing total unrealized PnL from open positions
        </p>
      </div>
    </Card>
  );
}
