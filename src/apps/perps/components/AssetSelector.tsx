import { useState, useEffect, useMemo } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { getMetaAndAssetCtxs } from '../lib/hyperliquid/client';
import type { AssetInfo } from '../lib/hyperliquid/types';
import { Skeleton } from './ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface AssetSelectorProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string, asset: AssetInfo) => void;
}

interface EnhancedAsset extends AssetInfo {
  price: number;
  volume: number;
  priceChange: number;
  priceChangePercent: number;
}

type SortBy = 'price' | 'volume' | 'change';

export function AssetSelector({ selectedSymbol, onSelect }: AssetSelectorProps) {
  const [assets, setAssets] = useState<EnhancedAsset[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('volume');

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setIsLoading(true);
    try {
      const data = await getMetaAndAssetCtxs();

      // API returns [metadata, assetContexts]
      // data[0] = { universe: [...], ... }
      // data[1] = [ctx0, ctx1, ...] with price/volume data
      if (data && Array.isArray(data) && data[0]?.universe && Array.isArray(data[1])) {
        const universe = data[0].universe;
        const assetCtxs = data[1];

        const enhancedAssets: EnhancedAsset[] = universe.map((asset: any, index: number) => {
          const ctx = assetCtxs[index] || {};
          const markPx = parseFloat(ctx.markPx || '0');
          const prevDayPx = parseFloat(ctx.prevDayPx || '0');

          return {
            id: index,
            symbol: asset.name,
            szDecimals: asset.szDecimals || 3,
            maxLeverage: asset.maxLeverage || 50,
            price: markPx,
            volume: parseFloat(ctx.dayNtlVlm || '0'),
            priceChange: prevDayPx > 0 ? markPx - prevDayPx : 0,
            priceChangePercent: prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0,
          };
        });

        setAssets(enhancedAssets);
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAndSortedAssets = useMemo(() => {
    let filtered = assets;

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = assets.filter(asset =>
        asset.symbol.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return b.price - a.price;
        case 'volume':
          return b.volume - a.volume;
        case 'change':
          return b.priceChangePercent - a.priceChangePercent;
        default:
          return 0;
      }
    });
  }, [assets, search, sortBy]);

  const formatPrice = (price: number): string => {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return price.toFixed(2);
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1e9) {
      return `$${(volume / 1e9).toFixed(1)}B`;
    }
    if (volume >= 1e6) {
      return `$${(volume / 1e6).toFixed(1)}M`;
    }
    if (volume >= 1e3) {
      return `$${(volume / 1e3).toFixed(1)}K`;
    }
    return `$${volume.toFixed(0)}`;
  };

  const getCoinColor = (symbol: string): string => {
    const colors: Record<string, string> = {
      'BTC': 'bg-orange-500',
      'ETH': 'bg-gray-700',
      'SOL': 'bg-purple-500',
      'ATOM': 'bg-blue-600',
      'MATIC': 'bg-purple-600',
      'DYDX': 'bg-gray-600',
    };
    return colors[symbol] || 'bg-gradient-to-br from-cyan-500 to-blue-600';
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets (e.g., BTC, ETH)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                title="Sort assets"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy('price')}>
                Sort by Price
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('volume')}>
                Sort by Volume
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('change')}>
                Sort by Change %
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ScrollArea className="h-64">
          <div className="space-y-1">
            {filteredAndSortedAssets.map((asset) => {
              const isPositive = asset.priceChangePercent >= 0;

              return (
                <button
                  key={asset.symbol}
                  onClick={() => onSelect(asset.symbol, asset)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${selectedSymbol === asset.symbol
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Token Logo */}
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${getCoinColor(asset.symbol)}`}>
                      <span className="text-white font-bold text-xs">
                        {asset.symbol.slice(0, 1)}
                      </span>
                    </div>

                    {/* Token Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold">{asset.symbol}</span>
                        <span className="text-xs text-muted-foreground">
                          {asset.maxLeverage}x max
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Vol {formatVolume(asset.volume)}
                        </span>
                        <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                          {isPositive ? '+' : ''}{asset.priceChangePercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold">
                        ${formatPrice(asset.price)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredAndSortedAssets.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No assets found
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
