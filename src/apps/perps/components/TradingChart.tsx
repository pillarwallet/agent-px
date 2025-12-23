import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import type { AssetInfo } from '../lib/hyperliquid/types';
import { PriceTicker } from './PriceTicker';

interface TradingChartProps {
  selectedAsset: AssetInfo | null;
}

type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface CandleResponse {
  t: number; // timestamp
  o: string; // open (API returns as string)
  h: string; // high (API returns as string)
  l: string; // low (API returns as string)
  c: string; // close (API returns as string)
  v: string; // volume (API returns as string)
}

export function TradingChart({ selectedAsset }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [isLoading, setIsLoading] = useState(false);

  const fetchCandles = useCallback(async (symbol: string, intervalStr: Interval) => {
    try {
      setIsLoading(true);
      const now = Date.now();
      const intervalMs: Record<Interval, number> = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
      };

      const startTime = now - (300 * intervalMs[intervalStr]); // Last 300 candles in milliseconds

      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: {
            coin: symbol,
            interval: intervalStr,
            startTime,
            endTime: now,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Chart] API error:', { status: response.status, error: errorText, symbol, intervalStr });
        throw new Error(`Candles API error: ${response.status} ${errorText}`);
      }

      const raw: CandleResponse[] = await response.json();

      if (!Array.isArray(raw)) {
        console.error('[Chart] Invalid response format:', raw);
        return [];
      }

      const candlestickData: CandlestickData<Time>[] = raw
        .filter(c => c && c.t && c.o && c.h && c.l && c.c)
        .map((candle) => ({
          time: Math.floor(Number(candle.t) / 1000) as Time,
          open: parseFloat(candle.o),
          high: parseFloat(candle.h),
          low: parseFloat(candle.l),
          close: parseFloat(candle.c),
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      console.log(`[Chart] ${symbol} ${intervalStr}:`, {
        fetched: raw.length,
        rendered: candlestickData.length,
        first: candlestickData[0]?.time,
        last: candlestickData[candlestickData.length - 1]?.time
      });

      return candlestickData;
    } catch (error) {
      console.error('Error fetching candles:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: '#1F2937' },
        horzLines: { color: '#1F2937' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      crosshair: {
        mode: 1,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!selectedAsset) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

      ws.onopen = () => {
        console.log('[Chart] WebSocket connected');
        // Subscribe to candles - Hyperliquid format
        const subscribeMsg = {
          method: 'subscribe',
          subscription: {
            type: 'candle',
            coin: selectedAsset.symbol,
            interval: interval,
          }
        };
        console.log('[Chart] Sending subscription:', JSON.stringify(subscribeMsg));
        ws?.send(JSON.stringify(subscribeMsg));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[Chart] WebSocket message:', message);

          if (message.channel === 'candle' && message.data) {
            const candle = message.data;
            if (candlestickSeriesRef.current) {
              // Update the last candle or add a new one
              // API returns: { t, o, h, l, c, v, ... }
              const update: CandlestickData<Time> = {
                time: Math.floor(candle.t / 1000) as Time,
                open: parseFloat(candle.o),
                high: parseFloat(candle.h),
                low: parseFloat(candle.l),
                close: parseFloat(candle.c),
              };
              candlestickSeriesRef.current.update(update);
            }
          }
        } catch (e) {
          console.error('[Chart] WebSocket message error:', e);
        }
      };

      ws.onclose = () => {
        console.log('[Chart] WebSocket disconnected. Reconnecting...');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[Chart] WebSocket error:', err);
        ws?.close();
      };
    };

    connect();

    return () => {
      if (ws) {
        ws.onclose = null; // Prevent reconnection attempt on cleanup
        ws.close();
      }
      clearTimeout(reconnectTimer);
    };
  }, [selectedAsset, interval]);

  // Initial Data Load (Rest API)
  useEffect(() => {
    if (!selectedAsset || !candlestickSeriesRef.current) return;

    const loadData = async () => {
      const data = await fetchCandles(selectedAsset.symbol, interval);
      if (data.length > 0 && candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
      }
    };

    loadData();
    // No polling needed anymore due to WS
  }, [selectedAsset, interval, fetchCandles]);

  const intervals: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

  return (
    <Card>
      {/* Price Ticker */}
      <PriceTicker selectedAsset={selectedAsset} />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {selectedAsset ? selectedAsset.symbol : 'Select an asset'}
          </CardTitle>
          <div className="flex gap-1">
            {intervals.map((int) => (
              <Button
                key={int}
                variant={interval === int ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setInterval(int)}
                disabled={isLoading || !selectedAsset}
                className="h-7 px-2 text-xs"
              >
                {int}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!selectedAsset ? (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            Select an asset to view the chart
          </div>
        ) : (
          <div className="relative">
            <div ref={chartContainerRef} className="w-full h-[400px]" />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                <div className="text-sm text-muted-foreground">Loading chart data...</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
