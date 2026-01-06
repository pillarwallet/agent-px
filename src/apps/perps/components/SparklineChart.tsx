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

export function SparklineChart({ selectedAsset }: SparklineChartProps) {
    const [candles, setCandles] = useState<CandleData[]>([]);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchCandles = useCallback(async (symbol: string) => {
        try {
            setIsLoading(true);
            setError(null);

            const now = Date.now();
            const twelveHoursAgo = now - (12 * 60 * 60 * 1000); // 12 hours in milliseconds

            console.log('[Sparkline] Fetching candles for', symbol, {
                startTime: new Date(twelveHoursAgo).toISOString(),
                endTime: new Date(now).toISOString()
            });

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
                const errorText = await response.text();
                console.error('[Sparkline] API error:', { status: response.status, error: errorText });
                throw new Error(`API error: ${response.status}`);
            }

            const raw = await response.json();

            if (!Array.isArray(raw)) {
                console.error('[Sparkline] Invalid response format:', raw);
                throw new Error('Invalid response format');
            }

            const candleData: CandleData[] = raw
                .filter(c => c && c.t && c.c)
                .map((candle) => ({
                    time: Number(candle.t),
                    close: parseFloat(candle.c),
                }))
                .sort((a, b) => a.time - b.time);

            console.log('[Sparkline] Fetched candles:', {
                count: candleData.length,
                first: candleData[0] ? new Date(candleData[0].time).toISOString() : null,
                last: candleData[candleData.length - 1] ? new Date(candleData[candleData.length - 1].time).toISOString() : null,
                firstPrice: candleData[0]?.close,
                lastPrice: candleData[candleData.length - 1]?.close,
            });

            setCandles(candleData);

            // Set current price to the most recent close price
            if (candleData.length > 0) {
                setCurrentPrice(candleData[candleData.length - 1].close);
            }
        } catch (err) {
            console.error('[Sparkline] Error fetching candles:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch data on mount and when asset changes
    useEffect(() => {
        if (!selectedAsset) {
            setCandles([]);
            setCurrentPrice(null);
            return;
        }

        fetchCandles(selectedAsset.symbol);
    }, [selectedAsset, fetchCandles]);

    // Refresh every 2 seconds
    useEffect(() => {
        if (!selectedAsset) return;

        const interval = setInterval(() => {
            fetchCandles(selectedAsset.symbol);
        }, 2000);

        return () => clearInterval(interval);
    }, [selectedAsset, fetchCandles]);

    // Calculate SVG path for sparkline
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
                {/* Header with current price */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-sm text-muted-foreground mb-1">
                            {selectedAsset.symbol} Price (12H)
                        </div>
                        {currentPrice !== null && (
                            <div className="flex items-baseline gap-3">
                                <div className="text-3xl font-bold">
                                    ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className={`text-sm font-semibold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                                    {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
                                </div>
                            </div>
                        )}
                    </div>
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
                            {/* Sparkline path */}
                            <path
                                d={getSparklinePath()}
                                fill="none"
                                stroke={isPositive ? '#10B981' : '#EF4444'}
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                            />

                            {/* Area under the line */}
                            <path
                                d={`${getSparklinePath()} L 800,100 L 0,100 Z`}
                                fill={isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
                            />
                        </svg>

                        {/* Time labels */}
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
