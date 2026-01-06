import { useEffect, useState, useCallback } from 'react';
import type { AssetInfo } from '../lib/hyperliquid/types';
import { Card, CardContent } from './ui/card';

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

    const fetchMarketData = useCallback(async (symbol: string) => {
        try {
            const response = await fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
            });

            if (!response.ok) throw new Error('Failed to fetch market data');

            const data = await response.json();
            if (data && Array.isArray(data) && data[0]?.universe && Array.isArray(data[1])) {
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

    const fetchCandles = useCallback(async (symbol: string) => {
        try {
            setIsLoading(true);
            setError(null);

            const now = Date.now();
            const twelveHoursAgo = now - (12 * 60 * 60 * 1000);

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
                .filter(c => c && c.t && c.c)
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
    }, [fetchMarketData]);

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
        }, 2000);

        return () => clearInterval(interval);
    }, [selectedAsset, fetchCandles]);

    const getSparklinePath = () => {
        if (candles.length < 2) return '';

        const width = 800;
        const height = 100;
        const padding = 5;

        const prices = candles.map(c => c.close);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || 1;

        const points = candles.map((candle, index) => {
            const x = padding + (index / (candles.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((candle.close - minPrice) / priceRange) * (height - 2 * padding);
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

    const formatNumber = (value: string, decimals: number = 2): string => {
        const num = parseFloat(value);
        return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };

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

    return (
        <Card>
            <CardContent className="p-6">
                {/* Header with current price and market data */}
                <div className="mb-6 flex flex-col xl:flex-row xl:items-start justify-between gap-6">
                    {/* Left: Current Price */}
                    <div>
                        <div className="text-sm text-muted-foreground mb-2">
                            {selectedAsset.symbol} Price (12H)
                        </div>
                        {currentPrice !== null && (
                            <div className="flex items-baseline gap-3">
                                <div className="text-4xl font-bold">
                                    ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className={`text-lg font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                                    {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Market Data Ticker */}
                    {marketData && (
                        <div className="flex flex-wrap items-start justify-end gap-x-8 gap-y-4 text-sm pt-0 mt-0">
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 cursor-help mb-1">Mark</div>
                                <div className="font-semibold">${formatNumber(marketData.markPx)}</div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 cursor-help mb-1">Oracle</div>
                                <div className="font-semibold">${formatNumber(marketData.oraclePx)}</div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">24H Change</div>
                                <div className={`font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                                    {formatNumber(String(parseFloat(marketData.markPx) - parseFloat(marketData.prevDayPx)))} / {percentChange.toFixed(2)}%
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">24H Volume</div>
                                <div className="font-semibold">{formatVolume(marketData.dayNtlVlm)}</div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 cursor-help mb-1">Open Interest</div>
                                <div className="font-semibold">${formatNumber(marketData.openInterest, 2)}</div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 cursor-help mb-1">Funding / Countdown</div>
                                <div className="flex items-center justify-end gap-2">
                                    <span className={`font-semibold ${parseFloat(marketData.funding) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {(parseFloat(marketData.funding) * 100).toFixed(4)}%
                                    </span>
                                    <span className="text-muted-foreground">
                                        00:51:51
                                    </span>
                                </div>
                            </div>
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
                    <div className="relative">
                        <svg
                            width="100%"
                            height="100"
                            viewBox="0 0 800 100"
                            preserveAspectRatio="none"
                            className="w-full"
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
                                fill={isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
                            />
                        </svg>

                        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                            <span>12h ago</span>
                            <span>Now</span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
