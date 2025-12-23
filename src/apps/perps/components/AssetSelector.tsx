import { useState, useEffect, useMemo } from 'react';
import { Search, Download } from 'lucide-react';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { getAllAssets } from '../lib/hyperliquid/client';
import type { AssetInfo } from '../lib/hyperliquid/types';
import { Skeleton } from './ui/skeleton';
import { toast } from 'sonner';

interface AssetSelectorProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string, asset: AssetInfo) => void;
}

export function AssetSelector({ selectedSymbol, onSelect }: AssetSelectorProps) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setIsLoading(true);
    try {
      const data = await getAllAssets();
      setAssets(data);
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAssets = useMemo(() => {
    if (!search) return assets;
    const searchLower = search.toLowerCase();
    return assets.filter(asset => 
      asset.symbol.toLowerCase().includes(searchLower)
    );
  }, [assets, search]);

  const exportToCSV = () => {
    if (assets.length === 0) {
      toast.error('No assets to export');
      return;
    }

    // Create CSV content
    const headers = ['Symbol', 'ID', 'Max Leverage', 'Size Decimals'];
    const rows = assets.map(asset => [
      asset.symbol,
      asset.id,
      asset.maxLeverage,
      asset.szDecimals
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `hyperliquid-assets-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${assets.length} assets to CSV`);
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
          <Button
            onClick={exportToCSV}
            disabled={isLoading || assets.length === 0}
            variant="outline"
            size="icon"
            title="Export all assets to CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-64">
          <div className="space-y-1">
            {filteredAssets.map((asset) => (
              <button
                key={asset.symbol}
                onClick={() => onSelect(asset.symbol, asset)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  selectedSymbol === asset.symbol
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{asset.symbol}</span>
                  <span className="text-xs text-muted-foreground">
                    {asset.maxLeverage}x max
                  </span>
                </div>
              </button>
            ))}
            {filteredAssets.length === 0 && (
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
