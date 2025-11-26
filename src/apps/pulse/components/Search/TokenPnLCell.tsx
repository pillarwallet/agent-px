import { useTokenPnL } from '../../../../hooks/useTokenPnL';
import { Token } from '../../../../services/tokensData';
import { WalletTransactionsMobulaResponse } from '../../../../types/api';
import {
  formatExponentialSmallNumber,
  limitDigitsNumber,
} from '../../../../utils/number';

interface TokenPnLCellProps {
  token: Token;
  chainId: number;
  transactionsData: WalletTransactionsMobulaResponse | undefined;
  walletAddress: string | undefined;
}

const TokenPnLCell = ({
  token,
  chainId,
  transactionsData,
  walletAddress,
}: TokenPnLCellProps) => {
  const { pnl, isLoading } = useTokenPnL({
    token,
    transactionsData,
    walletAddress,
    chainId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-end">
        <p className="text-xs text-white/30">-</p>
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
        className={`text-[13px] font-normal tracking-[-0.26px] text-right ${pnl.unrealisedPnLUSDC >= 0 ? 'text-[#4ADE80]' : 'text-[#EF4444]'
          }`}
      >
        {pnl.unrealisedPnLUSDC >= 0 ? '+' : ''}$
        {formatExponentialSmallNumber(
          limitDigitsNumber(Math.abs(pnl.unrealisedPnLUSDC))
        )}
      </p>
      <p
        className={`text-xs font-normal tracking-[-0.24px] text-right ${pnl.unrealisedPnLPct >= 0 ? 'text-[#4ADE80]' : 'text-[#EF4444]'
          }`}
      >
        {pnl.unrealisedPnLPct >= 0 ? '+' : ''}
        {pnl.unrealisedPnLPct.toFixed(2)}%
      </p>
    </div>
  );
};

export default TokenPnLCell;
