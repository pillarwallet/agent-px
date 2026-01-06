import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { RefreshCw } from 'lucide-react';
import { getUserState } from '../lib/hyperliquid/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface PositionsCardProps {
  masterAddress: string;
}

export function PositionsCard({ masterAddress }: PositionsCardProps) {
  const [positions, setPositions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const fetchPositions = async () => {
    if (!masterAddress) return;

    setIsLoading(true);
    try {
      const userState = await getUserState(masterAddress);

      if (userState?.assetPositions) {
        const openPositions = userState.assetPositions
          .map((pos: any) => pos.position)
          .filter((p: any) => parseFloat(p.szi) !== 0);

        setPositions(openPositions);
      }
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [masterAddress]);

  const formatNumber = (value: string | number, decimals: number = 2): string => {
    return parseFloat(value.toString()).toFixed(decimals);
  };

  const formatPnl = (pnl: string) => {
    const pnlNum = parseFloat(pnl);
    const formatted = formatNumber(pnlNum, 2);
    const className = pnlNum >= 0 ? 'text-green-600' : 'text-red-600';
    return { formatted, className };
  };

  const calculateLeverage = (position: any): string => {
    const positionValue = Math.abs(parseFloat(position.szi)) * parseFloat(position.entryPx);
    const marginUsed = parseFloat(position.marginUsed);
    if (marginUsed === 0) return '0x';
    return `${formatNumber(positionValue / marginUsed, 1)}x`;
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <CardTitle className="text-lg">Open Positions</CardTitle>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchPositions}
            disabled={isLoading}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            {positions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No open positions
              </p>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Coin</th>
                        <th className="text-right py-2 px-2">Size</th>
                        <th className="text-right py-2 px-2">Entry</th>
                        <th className="text-right py-2 px-2">Mark</th>
                        <th className="text-right py-2 px-2">PNL (ROE%)</th>
                        <th className="text-right py-2 px-2">Liq. Price</th>
                        <th className="text-right py-2 px-2">Leverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((position, index) => {
                        const pnl = formatPnl(position.unrealizedPnl);
                        const roe = (parseFloat(position.unrealizedPnl) / parseFloat(position.marginUsed)) * 100;
                        const isLong = parseFloat(position.szi) > 0;

                        return (
                          <tr key={index} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 px-2 font-medium">{position.coin}</td>
                            <td className="text-right py-2 px-2">
                              <span className={isLong ? 'text-green-600' : 'text-red-600'}>
                                {isLong ? '+' : ''}{formatNumber(position.szi, 4)}
                              </span>
                            </td>
                            <td className="text-right py-2 px-2">${formatNumber(position.entryPx)}</td>
                            <td className="text-right py-2 px-2">${formatNumber(Math.abs(parseFloat(position.markPx || '0')), 2)}</td>
                            <td className={`text-right py-2 px-2 ${pnl.className}`}>
                              ${pnl.formatted} ({formatNumber(roe, 2)}%)
                            </td>
                            <td className="text-right py-2 px-2">
                              {position.liquidationPx ? `$${formatNumber(position.liquidationPx)}` : '-'}
                            </td>
                            <td className="text-right py-2 px-2">{calculateLeverage(position)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {positions.map((position, index) => {
                    const pnl = formatPnl(position.unrealizedPnl);
                    const roe = (parseFloat(position.unrealizedPnl) / parseFloat(position.marginUsed)) * 100;
                    const isLong = parseFloat(position.szi) > 0;

                    return (
                      <div key={index} className="border rounded-md p-3 space-y-3 bg-card">
                        {/* Header: Coin and Size */}
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-base">{position.coin}</span>
                          <span className={`${isLong ? 'text-green-600' : 'text-red-600'} font-medium`}>
                            {isLong ? 'Long' : 'Short'} {formatNumber(Math.abs(parseFloat(position.szi)), 4)}
                          </span>
                        </div>

                        {/* Data Grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground block">Entry Price</span>
                            <span className="font-medium">${formatNumber(position.entryPx)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground block">Mark Price</span>
                            <span className="font-medium">${formatNumber(Math.abs(parseFloat(position.markPx || '0')), 2)}</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground block">Liq. Price</span>
                            <span className="font-medium">{position.liquidationPx ? `$${formatNumber(position.liquidationPx)}` : '-'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground block">Leverage</span>
                            <span className="font-medium">{calculateLeverage(position)}</span>
                          </div>
                        </div>

                        {/* Footer: PNL */}
                        <div className="pt-2 border-t flex justify-between items-center">
                          <span className="text-sm font-medium text-muted-foreground">PNL (ROE%)</span>
                          <div className={`text-right font-medium ${pnl.className}`}>
                            ${pnl.formatted} <span className="opacity-80">({formatNumber(roe, 2)}%)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
