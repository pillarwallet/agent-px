import { useEffect } from 'react';
import { useTokenPnL } from '../../../../hooks/useTokenPnL';
import { PortfolioToken } from '../../../../services/tokensData';
import { WalletTransactionsMobulaResponse } from '../../../../types/api';
import {
  formatExponentialSmallNumber,
  limitDigitsNumber,
} from '../../../../utils/number';

interface TokenPnLCellProps {
  token: PortfolioToken; // Changed Token to PortfolioToken
  transactionsData: WalletTransactionsMobulaResponse | undefined;
  walletAddress: string | undefined;
  chainId: number;
  isRefreshing?: boolean; // Added isRefreshing prop
}

export const TokenPnLCell = ({
  // Changed to named export
  token,
  transactionsData,
  walletAddress,
  chainId,
  isRefreshing, // Destructured isRefreshing
}: TokenPnLCellProps) => {
  const {
    pnl,
    isLoading,
    refetch, // Added refetch
  } = useTokenPnL(
    token && walletAddress // Conditional hook call
      ? {
          token: {
            contract: token.contract,
            symbol: token.symbol,
            decimals: token.decimals,
            balance: token.balance,
            price: token.price,
          },
          transactionsData,
          walletAddress,
          chainId,
        }
      : null
  );

  useEffect(() => {
    if (isRefreshing && refetch) {
      refetch();
    }
  }, [isRefreshing, refetch]);

  // Show loading immediately when refreshing, or when hook is loading
  if (isRefreshing || isLoading) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
        <div className="h-2 w-12 bg-white/10 rounded animate-pulse" />
      </div>
    );
  }

  if (!pnl) {
    return (
      <div className="flex flex-col items-end">
        <p className="text-xs text-white/30">-</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <p
        className={`text-[13px] font-normal tracking-[-0.26px] text-right ${
          pnl.unrealisedPnLUSDC >= 0 ? 'text-[#4ADE80]' : 'text-[#EF4444]'
        }`}
      >
        {pnl.unrealisedPnLUSDC >= 0 ? '+' : ''}$
        {formatExponentialSmallNumber(
          limitDigitsNumber(Math.abs(pnl.unrealisedPnLUSDC))
        )}
      </p>
      <p
        className={`text-xs font-normal tracking-[-0.24px] text-right ${
          pnl.unrealisedPnLPct >= 0 ? 'text-[#4ADE80]' : 'text-[#EF4444]'
        }`}
      >
        {pnl.unrealisedPnLPct >= 0 ? '+' : ''}
        {pnl.unrealisedPnLPct.toFixed(2)}%
      </p>
    </div>
  );
};

export default TokenPnLCell;
