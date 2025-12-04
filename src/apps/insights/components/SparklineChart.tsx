import { useMemo } from "react";
import type { SparklineDataPoint } from "../types";

interface SparklineChartProps {
  data: SparklineDataPoint[];
  currentPrice: number;
  stopLoss: number;
  nextTP: number;
  orderSide: 'buy' | 'sell';
}

export const SparklineChart = ({ 
  data, 
  currentPrice, 
  stopLoss, 
  nextTP, 
  orderSide 
}: SparklineChartProps) => {
  const { minPrice, maxPrice, lineData, slPosition, tpPosition, currentPricePosition, lastPointYPosition, chartWidth } = useMemo(() => {
    if (!data || data.length === 0) {
      return { minPrice: 0, maxPrice: 0, lineData: '', slPosition: 0, tpPosition: 0, currentPricePosition: 0, lastPointYPosition: 0, chartWidth: 94 };
    }

    // Calculate price range including SL and TP
    const prices = data.map(d => d.price);
    const min = Math.min(...prices, stopLoss, nextTP);
    const max = Math.max(...prices, stopLoss, nextTP);
    const range = max - min;
    const padding = range * 0.1; // 10% padding

    const minPrice = min - padding;
    const maxPrice = max + padding;
    const priceRange = maxPrice - minPrice;

    // Calculate SVG path for price line with right padding
    const RIGHT_PADDING_PCT = 6;
    const chartWidth = 100 - RIGHT_PADDING_PCT; // Leave space on right
    const height = 100; // percentage

    const safePointDivisor = data.length > 1 ? data.length - 1 : 1;
    const safePriceRange = priceRange === 0 ? 1 : priceRange;

    const points = data.map((d, i) => {
      const x = (i / safePointDivisor) * chartWidth;
      const y = height - ((d.price - minPrice) / safePriceRange) * height;
      return `${x},${y}`;
    });

    const lineData = points.length > 0 ? `M ${points.join(' L ')}` : '';

    // Calculate positions for horizontal lines (as percentage from top)
    // Clamp values between 5% and 95% to ensure visibility
    const slPosition = Math.max(5, Math.min(95, ((maxPrice - stopLoss) / safePriceRange) * 100));
    const tpPosition = Math.max(5, Math.min(95, ((maxPrice - nextTP) / safePriceRange) * 100));
    const currentPricePosition = Math.max(5, Math.min(95, ((maxPrice - currentPrice) / safePriceRange) * 100));

    // Calculate the Y position of the last data point on the blue line
    // This ensures the blue dot sits exactly on the line's endpoint
    const lastDataPoint = data[data.length - 1];
    const lastPointYPosition = Math.max(5, Math.min(95, ((maxPrice - lastDataPoint.price) / safePriceRange) * 100));

    console.log('Sparkline positions:', { 
      slPosition, 
      tpPosition, 
      currentPricePosition, 
      lastPointYPosition,
      lastDataPointPrice: lastDataPoint.price,
      chartWidth,
      minPrice, 
      maxPrice, 
      stopLoss, 
      nextTP, 
      currentPrice 
    });

    return { minPrice, maxPrice, lineData, slPosition, tpPosition, currentPricePosition, lastPointYPosition, chartWidth };
  }, [data, stopLoss, nextTP, currentPrice]);

  const calculateDistance = (from: number, to: number): string => {
    const percent = ((to - from) / from) * 100;
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const slDistance = calculateDistance(currentPrice, stopLoss);
  const tpDistance = calculateDistance(currentPrice, nextTP);

  if (!data || data.length === 0) {
    return (
      <div className="relative h-[120px] w-full rounded-xl border border-border/30 bg-[hsl(235,45%,6%)]/50 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Loading price data...</p>
      </div>
    );
  }

  return (
    <div className="relative h-[140px] w-full rounded-xl border border-border/30 bg-[hsl(235,45%,6%)]/50 overflow-hidden">
      {/* Red Stop Loss Line */}
      <div 
        className="absolute left-0 right-0 z-10 pointer-events-none" 
        style={{ top: `${slPosition}%`, transform: 'translateY(-50%)' }}
      >
        {/* Horizontal red line with labels on it */}
        <div className="h-[2px] bg-rose-500/70 shadow-[0_0_8px_rgba(239,68,68,0.5)] relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 bg-rose-500/90 text-white px-2 py-0.5 rounded text-[10px] font-semibold border border-rose-600">
            Stop Loss: ${stopLoss.toFixed(4)}
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-rose-500/90 text-white px-2 py-0.5 rounded text-[10px] font-semibold border border-rose-600">
            {slDistance}
          </div>
        </div>
      </div>

      {/* Orange Next TP Line */}
      <div 
        className="absolute left-0 right-0 z-10 pointer-events-none" 
        style={{ top: `${tpPosition}%`, transform: 'translateY(-50%)' }}
      >
        {/* Horizontal orange line with labels on it */}
        <div className="h-[2px] bg-orange-500/70 shadow-[0_0_8px_rgba(249,115,22,0.5)] relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 bg-orange-500/90 text-white px-2 py-0.5 rounded text-[10px] font-semibold border border-orange-600">
            Next TP: ${nextTP.toFixed(4)}
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-orange-500/90 text-white px-2 py-0.5 rounded text-[10px] font-semibold border border-orange-600">
            {tpDistance}
          </div>
        </div>
      </div>

      {/* Blue Price Line Chart */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path 
          d={lineData} 
          stroke="#60a5fa" 
          strokeWidth="2" 
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Current Price Indicator (blue dot on the price line) */}
      <div 
        className="absolute z-20 pointer-events-none" 
        style={{ 
          left: `${chartWidth}%`, 
          top: `${lastPointYPosition}%`, 
          transform: 'translate(-50%, -50%)' 
        }}
      >
        <div className="w-3 h-3 rounded-full bg-blue-400 border-2 border-white shadow-lg" />
      </div>
    </div>
  );
};
