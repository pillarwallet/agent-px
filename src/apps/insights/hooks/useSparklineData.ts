/**
 * Hook for fetching and managing sparkline data for trading signals
 */

import { useState, useCallback, useRef } from 'react';
import { fetchSparklineData } from '../api/insightsApi';
import type { TradingSignal, SparklineDataPoint } from '../types';

export const useSparklineData = () => {
  const [sparklineDataMap, setSparklineDataMap] = useState<Record<string, SparklineDataPoint[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  
  // Use ref to track loading state without causing dependency loops
  const loadingRef = useRef<Record<string, boolean>>({});

  const fetchSparkline = useCallback(async (signal: TradingSignal) => {
    // Check ref instead of state to avoid dependency issues
    if (loadingRef.current[signal.id]) {
      console.log(`⏭️ [Sparkline] Skipping ${signal.ticker} - already loading`);
      return; // Already loading
    }

    try {
      loadingRef.current[signal.id] = true;
      setLoading(prev => ({ ...prev, [signal.id]: true }));
      
      const startTime = new Date(signal.created_at).getTime();
      const endTime = Date.now();
      
      console.log(`📊 [Sparkline] Fetching ${signal.ticker} (${signal.id})`);
      const result = await fetchSparklineData(signal.ticker, startTime, endTime);
      
      if (result.error) {
        throw result.error;
      }
      
      setSparklineDataMap(prev => ({
        ...prev,
        [signal.id]: (result.data?.candles || []) as SparklineDataPoint[],
      }));
      console.log(`✅ [Sparkline] Fetched ${signal.ticker} - ${result.data?.candles?.length || 0} candles`);
    } catch (error) {
      console.error(`❌ [Sparkline] Error fetching sparkline for ${signal.ticker}:`, error);
    } finally {
      loadingRef.current[signal.id] = false;
      setLoading(prev => ({ ...prev, [signal.id]: false }));
    }
  }, []); // No dependencies - stable function

  const fetchSparklines = useCallback((signals: TradingSignal[]) => {
    const activeSignals = signals.filter(s => s.status === 'active');
    console.log(`🔄 [Sparkline] Fetching sparklines for ${activeSignals.length} active signals`);
    
    activeSignals.forEach(signal => {
      fetchSparkline(signal);
    });
  }, [fetchSparkline]);

  return {
    sparklineDataMap,
    loading,
    fetchSparkline,
    fetchSparklines,
  };
};

