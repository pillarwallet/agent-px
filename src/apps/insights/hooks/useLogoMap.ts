/**
 * Hook for fetching and managing token logos
 */

import { useEffect, useState } from 'react';
import { normalizeSymbol } from '../utils/formatUtils';
import {
  loadLogoCache,
  saveLogoCache,
  getCachedLogo,
  fetchLogoFromMobula,
} from '../utils/logoUtils';
import type { TradingSignal } from '../types';

export const useLogoMap = (signals: TradingSignal[]) => {
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (signals.length === 0) return;

    const fetchLogos = async () => {
      try {
        // Get unique normalized symbols from all signals
        const symbols = Array.from(
          new Set(signals.map((s) => normalizeSymbol(s.ticker)))
        );

        // Load cache
        const cache = loadLogoCache();
        const newLogoMap: Record<string, string> = {};
        const missingSymbols: string[] = [];

        // Load from cache first for instant display
        symbols.forEach((symbol) => {
          const cachedUrl = getCachedLogo(symbol, cache);
          if (cachedUrl) {
            newLogoMap[symbol] = cachedUrl;
            console.log(`✓ Using cached logo for ${symbol}:`, cachedUrl);
          } else {
            missingSymbols.push(symbol);
          }
        });

        // Set initial logoMap with cached values
        if (Object.keys(newLogoMap).length > 0) {
          setLogoMap((prev) => ({ ...prev, ...newLogoMap }));
        }

        // Fetch missing symbols with concurrency limit
        if (missingSymbols.length > 0) {
          console.log(
            `📡 Fetching ${missingSymbols.length} missing logos from Mobula:`,
            missingSymbols
          );

          const CONCURRENCY = 4;
          const chunks: string[][] = [];
          for (let i = 0; i < missingSymbols.length; i += CONCURRENCY) {
            chunks.push(missingSymbols.slice(i, i + CONCURRENCY));
          }

          for (const chunk of chunks) {
            await Promise.all(
              chunk.map(async (symbol) => {
                try {
                  const logoUrl = await fetchLogoFromMobula(symbol);

                  if (logoUrl) {
                    // Update logoMap progressively
                    setLogoMap((prev) => ({ ...prev, [symbol]: logoUrl }));

                    // Update cache
                    cache[symbol] = { url: logoUrl, updatedAt: Date.now() };
                    saveLogoCache(cache);
                    console.log(`✓ ${symbol} logo cached:`, logoUrl);
                  } else {
                    console.log(`❌ No logo found for ${symbol}`);
                    // Mark as miss in cache
                    cache[symbol] = { miss: true, updatedAt: Date.now() };
                    saveLogoCache(cache);
                  }
                } catch (err) {
                  console.error(`❌ Failed to fetch logo for ${symbol}:`, err);
                  cache[symbol] = { miss: true, updatedAt: Date.now() };
                  saveLogoCache(cache);
                }
              })
            );
          }

          console.log('✅ Logo fetching complete');
        } else {
          console.log('✅ All logos loaded from cache');
        }
      } catch (error) {
        console.error('Error in logo fetching system:', error);
      }
    };

    fetchLogos();
  }, [signals]);

  return logoMap;
};
