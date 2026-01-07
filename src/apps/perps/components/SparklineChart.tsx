import { useEffect, useState, useCallback } from 'react';
import type { AssetInfo } from '../lib/hyperliquid/types';
import { Card, CardContent } from './ui/card';
import { useIsMobile } from '../hooks/use-mobile';
import { TokenIcon } from './TokenIcon';

interface SparklineChartProps {
  selectedAsset: AssetInfo | null;
}

interface CandleData {
  time: number;
  close: number;
}

interface MarketData {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  impactPxs: string[];
  dayBaseVlm: string;
}

export function SparklineChart({ selectedAsset }: SparklineChartProps) {
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverData, setHoverData] = useState<{
    x: number;
    y: number;
    price: number;
    time: number;
  } | null>(null);

  const fetchMarketData = useCallback(async (symbol: string) => {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });

      if (!response.ok) throw new Error('Failed to fetch market data');

      const data = await response.json();
      if (
        data &&
        Array.isArray(data) &&
        data[0]?.universe &&
        Array.isArray(data[1])
      ) {
        const universe = data[0].universe;
        const assetCtxs = data[1];

        // Find the index of our asset
        const assetIndex = universe.findIndex((a: any) => a.name === symbol);
        if (assetIndex !== -1 && assetCtxs[assetIndex]) {
          setMarketData(assetCtxs[assetIndex]);
        }
      }
    } catch (err) {
      console.error('[Sparkline] Error fetching market data:', err);
    }
  }, []);

  const fetchCandles = useCallback(
    async (symbol: string) => {
      try {
        setIsLoading(true);
        setError(null);

        const now = Date.now();
        const twelveHoursAgo = now - 12 * 60 * 60 * 1000;

        const response = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin: symbol,
              interval: '1m',
              startTime: twelveHoursAgo,
              endTime: now,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const raw = await response.json();

        if (!Array.isArray(raw)) {
          throw new Error('Invalid response format');
        }

        const candleData: CandleData[] = raw
          .filter((c) => c && c.t && c.c)
          .map((candle) => ({
            time: Number(candle.t),
            close: parseFloat(candle.c),
          }))
          .sort((a, b) => a.time - b.time);

        setCandles(candleData);

        if (candleData.length > 0) {
          setCurrentPrice(candleData[candleData.length - 1].close);
        }

        // Fetch market data
        await fetchMarketData(symbol);
      } catch (err) {
        console.error('[Sparkline] Error fetching candles:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setIsLoading(false);
      }
    },
    [fetchMarketData]
  );

  useEffect(() => {
    if (!selectedAsset) {
      setCandles([]);
      setCurrentPrice(null);
      setMarketData(null);
      return;
    }

    fetchCandles(selectedAsset.symbol);
  }, [selectedAsset, fetchCandles]);

  useEffect(() => {
    if (!selectedAsset) return;

    const interval = setInterval(() => {
      fetchCandles(selectedAsset.symbol);
    }, 15000);

    return () => clearInterval(interval);
  }, [selectedAsset, fetchCandles]);

  const getSparklinePath = () => {
    if (candles.length < 2) return '';

    const width = 800;
    const height = 100;
    const padding = 5;

    const prices = candles.map((c) => c.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const points = candles.map((candle, index) => {
      const x =
        padding + (index / (candles.length - 1)) * (width - 2 * padding);
      const y =
        height -
        padding -
        ((candle.close - minPrice) / priceRange) * (height - 2 * padding);
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  };

  const getPercentageChange = () => {
    if (candles.length < 2) return 0;
    const firstPrice = candles[0].close;
    const lastPrice = candles[candles.length - 1].close;
    return ((lastPrice - firstPrice) / firstPrice) * 100;
  };

  const formatVolume = (volume: string): string => {
    const num = parseFloat(volume);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatPrice = (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (Math.abs(num) < 1 && Math.abs(num) > 0) {
      return num.toFixed(5);
    }
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatNumber = (value: string, decimals: number = 2): string => {
    const num = parseFloat(value);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const isMobile = useIsMobile();
  const percentChange = getPercentageChange();
  const isPositive = percentChange >= 0;

  if (!selectedAsset) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-[150px] text-muted-foreground">
            Select an asset to view the price chart
          </div>
        </CardContent>
      </Card>
    );
  }

  /* Helper to format dates for X-axis */
  const formatAxisTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  /* Helper to get price levels for Y-axis */
  const getPriceLevels = () => {
    if (candles.length < 2) return null;
    const prices = candles.map((c) => c.close);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const mid = (min + max) / 2;
    return { min, mid, max };
  };

  const priceLevels = getPriceLevels();

  return (
    <Card className="h-full">
      <CardContent className="pt-6 px-6 pb-2 flex flex-col h-full">
        {/* Header with current price and market data */}
        <div className="mb-6">
          {/* --- MOBILE LAYOUT (< 1024px) --- */}
          {isMobile ? (
            <div className="flex flex-col gap-6">
              {/* Top Row: Symbol (Left) vs Price (Right) */}
              <div className="flex justify-between items-start">
                {/* Left: Symbol & Badge */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TokenIcon symbol={selectedAsset.symbol} size={32} />
                    <span className="text-3xl font-bold">
                      {selectedAsset.symbol}
                    </span>
                    <span className="text-xs font-medium text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded self-start mt-2">
                      {selectedAsset.maxLeverage}x
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground ml-1">
                    Price (12H)
                  </div>
                </div>

                {/* Right: Price & Change */}
                <div className="text-right">
                  {currentPrice !== null && (
                    <>
                      <div
                        className={`text-3xl font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                      >
                        ${formatPrice(currentPrice)}
                      </div>
                      <div
                        className={`text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                      >
                        {isPositive ? '+' : ''}
                        {percentChange.toFixed(2)}%
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Bottom Row: 3x2 Data Grid (Matching Desktop) */}
              {marketData && (
                <div className="grid grid-cols-3 gap-x-2 gap-y-2 text-[10px]">
                  <div className="text-left">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Mark
                    </div>
                    <div className="font-semibold text-[10px]">
                      ${formatPrice(marketData.markPx)}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      24H Change
                    </div>
                    <div
                      className={`font-semibold text-[10px] ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {formatPrice(
                        String(
                          parseFloat(marketData.markPx) -
                          parseFloat(marketData.prevDayPx)
                        )
                      )}{' '}
                      / {percentChange.toFixed(2)}%
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      24H Volume
                    </div>
                    <div className="font-semibold text-[10px]">
                      {formatVolume(marketData.dayNtlVlm)}
                    </div>
                  </div>

                  <div className="text-left">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Oracle
                    </div>
                    <div className="font-semibold text-[10px]">
                      ${formatPrice(marketData.oraclePx)}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Open Interest
                    </div>
                    <div className="font-semibold text-[10px]">
                      ${formatNumber(marketData.openInterest, 2)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Funding
                    </div>
                    <div
                      className={`font-semibold text-[10px] ${parseFloat(marketData.funding) >= 0 ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {(parseFloat(marketData.funding) * 100).toFixed(4)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* --- DESKTOP LAYOUT (>= 1024px) --- */
            <div className="flex flex-row justify-between items-center gap-4">
              {/* Left: Logo + Symbol + Price + Change - All on same line */}
              <div className="flex items-center gap-3">
                <TokenIcon symbol={selectedAsset.symbol} size={40} />
                <div className="text-4xl font-bold">{selectedAsset.symbol}</div>
                {currentPrice !== null && (
                  <div className="flex items-baseline gap-2 ml-2">
                    <span className="text-4xl font-bold">
                      ${formatPrice(currentPrice)}
                    </span>
                    <span
                      className={`text-sm font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {isPositive ? '+' : ''}
                      {percentChange.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Right: Compact Market Data - Grid 3x2 */}
              {marketData && (
                <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-[10px]">
                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Mark
                    </div>
                    <div className="font-semibold text-[10px]">
                      ${formatPrice(marketData.markPx)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      24H Change
                    </div>
                    <div
                      className={`font-semibold text-[10px] ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {formatPrice(
                        String(
                          parseFloat(marketData.markPx) -
                          parseFloat(marketData.prevDayPx)
                        )
                      )}{' '}
                      / {percentChange.toFixed(2)}%
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      24H Volume
                    </div>
                    <div className="font-semibold text-[10px]">
                      {formatVolume(marketData.dayNtlVlm)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Oracle
                    </div>
                    <div className="font-semibold text-[10px]">
                      ${formatPrice(marketData.oraclePx)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Open Interest
                    </div>
                    <div className="font-semibold text-[10px]">
                      ${formatNumber(marketData.openInterest, 2)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-muted-foreground mb-0.5 whitespace-nowrap text-[9px]">
                      Funding
                    </div>
                    <div
                      className={`font-semibold text-[10px] ${parseFloat(marketData.funding) >= 0 ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {(parseFloat(marketData.funding) * 100).toFixed(4)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sparkline Chart */}
        {error ? (
          <div className="flex items-center justify-center h-[100px] text-red-500 text-sm">
            Error: {error}
          </div>
        ) : candles.length < 2 ? (
          <div className="flex items-center justify-center h-[100px] text-muted-foreground text-sm">
            {isLoading ? 'Loading chart data...' : 'No data available'}
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-[200px]">
            <div
              className="relative flex-1 w-full"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const svgWidth = rect.width;
                const dataIndex = Math.round(
                  (x / svgWidth) * (candles.length - 1)
                );
                if (dataIndex >= 0 && dataIndex < candles.length) {
                  const candle = candles[dataIndex];
                  const prices = candles.map((c) => c.close);
                  const minPrice = Math.min(...prices);
                  const maxPrice = Math.max(...prices);
                  const normalizedY =
                    ((candle.close - minPrice) / (maxPrice - minPrice)) * 100;
                  setHoverData({
                    x: (dataIndex / (candles.length - 1)) * 100,
                    y: 100 - normalizedY,
                    price: candle.close,
                    time: candle.time,
                  });
                }
              }}
              onMouseLeave={() => setHoverData(null)}
            >
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 800 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <path
                  d={getSparklinePath()}
                  fill="none"
                  stroke={isPositive ? '#10B981' : '#EF4444'}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={`${getSparklinePath()} L 800,100 L 0,100 Z`}
                  fill={
                    isPositive
                      ? 'rgba(16, 185, 129, 0.1)'
                      : 'rgba(239, 68, 68, 0.1)'
                  }
                />
              </svg>

              {/* Hover Tooltip */}
              {hoverData && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${hoverData.x}%`,
                    top: `${hoverData.y}%`,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div className="bg-popover border border-border rounded-md px-2 py-1 shadow-lg mb-2 z-10">
                    <div className="text-xs font-semibold">
                      ${formatPrice(hoverData.price)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(hoverData.time).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="w-2 h-2 bg-primary rounded-full mx-auto"></div>
                </div>
              )}

              {/* Y-Axis (Right) */}
              {priceLevels && (
                <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-muted-foreground pointer-events-none">
                  <span className="bg-background/80 px-1 rounded-l">
                    ${formatPrice(priceLevels.max)}
                  </span>
                  <span className="bg-background/80 px-1 rounded-l">
                    ${formatPrice(priceLevels.mid)}
                  </span>
                  <span className="bg-background/80 px-1 rounded-l">
                    ${formatPrice(priceLevels.min)}
                  </span>
                </div>
              )}
            </div>

            {/* X-Axis (Bottom) */}
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              <span>{formatAxisTime(candles[0].time)}</span>
              <span>
                {formatAxisTime(candles[Math.floor(candles.length / 2)].time)}
              </span>
              <span>{formatAxisTime(candles[candles.length - 1].time)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
