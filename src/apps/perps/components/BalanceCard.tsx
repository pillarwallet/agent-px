import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { DollarSign, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { DepositModal } from './DepositModal';
import type { UserState } from '../lib/hyperliquid/types';

interface BalanceCardProps {
  userState: UserState;
  isLoading: boolean;
  onRefresh?: () => void;
}

export function BalanceCard({
  userState,
  isLoading,
  onRefresh,
}: BalanceCardProps) {
  const availableUSDC = parseFloat(userState.marginSummary?.totalRawUsd || '0');
  const accountEquity = parseFloat(
    userState.marginSummary?.accountValue || '0'
  );

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Account Balance</CardTitle>
          <div className="flex items-center gap-2">
            <DepositModal userState={userState} />
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available USDC</p>
              <p className="text-xl font-bold font-mono-numbers">
                $
                {availableUSDC.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-start justify-between p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent/10 rounded-lg">
              <TrendingUp className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Account Equity</p>
              <p className="text-xl font-bold font-mono-numbers">
                $
                {accountEquity.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
