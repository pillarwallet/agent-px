import React from 'react';
import { PnLMetrics } from '../../../../types/api';

interface PnLStatsProps {
  metrics: PnLMetrics | null;
  isLoading: boolean;
}

const StatGroup = ({
  topLabel,
  topValue,
  bottomLabel,
  bottomValue,
  align = 'left',
  valueColor = 'white',
  topValueColor = 'white',
}: {
  topLabel: string;
  topValue: string;
  bottomLabel: string;
  bottomValue: string;
  align?: 'left' | 'right';
  valueColor?: string;
  topValueColor?: string;
}) => (
  <div
    className={`flex flex-col h-[72px] justify-between ${align === 'right' ? 'items-end' : 'items-start'}`}
  >
    <div
      className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      <span className="text-[10px] text-white opacity-30 font-poppins leading-[10px] mb-[6px]">
        {topLabel}
      </span>
      <span
        className="text-[12px] font-poppins leading-[12px]"
        style={{ color: topValueColor }}
      >
        {topValue}
      </span>
    </div>
    <div
      className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}
    >
      <span className="text-[10px] text-white opacity-30 font-poppins leading-[10px] mb-[6px]">
        {bottomLabel}
      </span>
      <span
        className="text-[12px] font-poppins leading-[12px]"
        style={{ color: valueColor }}
      >
        {bottomValue}
      </span>
    </div>
  </div>
);

// Skeleton loader for PnL stats
const PnLStatsSkeleton = () => (
  <div className="relative w-auto h-[92px] bg-[#121116] mx-2.5 mt-1 mb-2.5 rounded-[10px] border-t border-b border-[#121116]">
    <div className="flex flex-row justify-between items-center h-full px-3 py-[10px] animate-pulse">
      {/* Column 1 */}
      <div className="flex flex-col h-[72px] justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-12 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-14 bg-white/10 rounded" />
          <div className="h-3 w-16 bg-white/10 rounded" />
        </div>
      </div>

      {/* Column 2 */}
      <div className="flex flex-col h-[72px] justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-2 w-12 bg-white/10 rounded" />
          <div className="h-3 w-14 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-16 bg-white/10 rounded" />
        </div>
      </div>

      {/* Column 3 */}
      <div className="flex flex-col h-[72px] justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-2 w-10 bg-white/10 rounded" />
          <div className="h-3 w-8 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-8 bg-white/10 rounded" />
        </div>
      </div>

      {/* Column 4 */}
      <div className="flex flex-col h-[72px] justify-between items-end">
        <div className="flex flex-col gap-2 items-end">
          <div className="h-2 w-20 bg-white/10 rounded" />
          <div className="h-3 w-24 bg-white/10 rounded" />
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="h-2 w-16 bg-white/10 rounded" />
          <div className="h-3 w-20 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  </div>
);

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
  const formatPnLWithPercent = (usdValue: number, pctValue: number) => {
    const usdSign = usdValue > 0 ? '+' : usdValue < 0 ? '-' : '';
    const pctSign = pctValue > 0 ? '+' : pctValue < 0 ? '-' : '';
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
