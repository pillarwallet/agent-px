import { PnLMetrics } from '../../../../types/api';
import PnLStatsSkeleton from './PnLStatsSkeleton';
import StatGroup from './StatGroup';

interface PnLStatsProps {
  metrics: PnLMetrics | null;
  isLoading: boolean;
}

export default function PnLStats({ metrics, isLoading }: PnLStatsProps) {
  if (isLoading) {
    return <PnLStatsSkeleton />;
  }

  const {
    balanceUSDC = 0,
    balanceToken = 0,
    totalBoughtUSDC = 0,
    avgBuyPrice = 0,
    totalSoldUSDC = 0,
    avgSellPrice = 0,
    realisedPnLUSDC = 0,
    realisedPnLPct = 0,
    unrealisedPnLUSDC = 0,
    unrealisedPnLPct = 0,
  } = metrics || {};

  const hasSells = totalSoldUSDC > 0;
  const hasRealisedPnL = hasSells && realisedPnLUSDC !== 0;

  const formatUSD = (val: number) =>
    `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatToken = (val: number) => {
    if (val === 0) return '0.00';
    // Limit to 6 decimals
    const formatted = val.toFixed(6);
    // Remove trailing zeros
    return parseFloat(formatted).toString();
  };

  // Format PnL with sign and percentage: -$0.80 (-0.5%) or +$1.20 (+2.3%)
  // Format PnL with sign and percentage: -$0.80 (-0.5%) or +$1.20 (+2.3%)
  // Format PnL with sign and percentage: -$0.80 (-0.5%) or +$1.20 (+2.3%)
  const formatPnLWithPercent = (usdValue: number, pctValue: number) => {
    let usdSign = '';
    if (usdValue > 0) {
      usdSign = '+';
    } else if (usdValue < 0) {
      usdSign = '-';
    }

    let pctSign = '';
    if (pctValue > 0) {
      pctSign = '+';
    } else if (pctValue < 0) {
      pctSign = '-';
    }

    const usdFormatted = `${usdSign}${formatUSD(Math.abs(usdValue))}`;
    const pctFormatted = `${pctSign}${Math.abs(pctValue).toFixed(2)}%`;
    return `${usdFormatted} (${pctFormatted})`;
  };

  const unrealisedColor = unrealisedPnLUSDC >= 0 ? '#5CFF93' : '#FF366C';
  const realisedColor = realisedPnLUSDC >= 0 ? '#5CFF93' : '#FF366C';

  return (
    <div className="relative w-full h-[92px] bg-[#121116] rounded-[10px]">
      <div className="flex flex-row justify-between items-center h-full px-3 py-[10px]">
        {/* Column 1: Balance */}
        <StatGroup
          topLabel="Balance USD"
          topValue={formatUSD(balanceUSDC)}
          bottomLabel="Balance"
          bottomValue={formatToken(balanceToken)}
        />

        {/* Column 2: Bought */}
        <StatGroup
          topLabel="Bought"
          topValue={formatUSD(totalBoughtUSDC)}
          bottomLabel="Buy Price"
          bottomValue={formatUSD(avgBuyPrice)}
        />

        {/* Column 3: Sold */}
        <StatGroup
          topLabel="Sold"
          topValue={hasSells ? formatUSD(totalSoldUSDC) : '-'}
          bottomLabel="Sell Price"
          bottomValue={hasSells ? formatUSD(avgSellPrice) : '-'}
        />

        {/* Column 4: PnL */}
        <StatGroup
          topLabel="Floating PnL"
          topValue={formatPnLWithPercent(unrealisedPnLUSDC, unrealisedPnLPct)}
          topValueColor={unrealisedColor}
          bottomLabel="Total PnL"
          bottomValue={
            hasRealisedPnL
              ? formatPnLWithPercent(realisedPnLUSDC, realisedPnLPct)
              : '-'
          }
          align="right"
          valueColor={hasRealisedPnL ? realisedColor : 'white'}
        />
      </div>
    </div>
  );
}
