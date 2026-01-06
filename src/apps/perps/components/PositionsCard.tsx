import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { RefreshCw, X, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '../hooks/use-mobile';
import { getUserState } from '../lib/hyperliquid/client';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Slider } from '../components/ui/slider';
import { toast } from 'sonner';
import { getAgentWallet } from '../lib/hyperliquid/keystore';
import { placeMarketOrderAgent } from '../lib/hyperliquid/sdk';
import { getMarkPrice } from '../lib/hyperliquid/client';
import { TokenIcon } from './TokenIcon';

interface PositionsCardProps {
  masterAddress: string;
}

export function PositionsCard({ masterAddress }: PositionsCardProps) {
  const isMobile = useIsMobile();
  const [positions, setPositions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  // Mobile Interaction State
  const [expandedPositionIndex, setExpandedPositionIndex] = useState<
    number | null
  >(null);

  // Close Position State
  const [positionToClose, setPositionToClose] = useState<any>(null);
  const [closePercentage, setClosePercentage] = useState<number>(100);
  const [isClosing, setIsClosing] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

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

  const formatNumber = (
    value: string | number,
    decimals: number = 2
  ): string => {
    return parseFloat(value.toString()).toFixed(decimals);
  };

  const formatPnl = (pnl: string) => {
    const pnlNum = parseFloat(pnl);
    const formatted = formatNumber(pnlNum, 2);
    const className = pnlNum >= 0 ? 'text-green-500' : 'text-red-500';
    return { formatted, className };
  };

  const calculateLeverage = (position: any): string => {
    const positionValue =
      Math.abs(parseFloat(position.szi)) * parseFloat(position.entryPx);
    const marginUsed = parseFloat(position.marginUsed);
    if (marginUsed === 0) return '0x';
    return `${formatNumber(positionValue / marginUsed, 1)}x`;
  };

  const handleOpenCloseDialog = (position: any) => {
    setPositionToClose(position);
    setClosePercentage(100);
    setCloseDialogOpen(true);
  };

  // Helper to get Coin ID
  const getCoinId = async (symbol: string) => {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });
      const data = await response.json();
      const assetIndex = data.universe.findIndex((a: any) => a.name === symbol);
      return assetIndex;
    } catch (e) {
      console.error('Failed to fetch meta', e);
      return -1;
    }
  };

  const handleExecuteClose = async () => {
    if (!positionToClose) return;
    setIsClosing(true);
    try {
      const agent = await getAgentWallet(masterAddress);
      if (!agent) throw new Error('Agent not found');

      const coinId = await getCoinId(positionToClose.coin);
      if (coinId === -1 || coinId === undefined)
        throw new Error('Asset not found');

      const totalSize = Math.abs(parseFloat(positionToClose.szi));
      const sizeToClose = totalSize * (closePercentage / 100);
      // Truncate to avoid precision errors
      const sizeStr = sizeToClose.toFixed(6);
      const size = parseFloat(sizeStr);

      const currentPrice =
        parseFloat(positionToClose.markPx) ||
        parseFloat(positionToClose.entryPx);
      const isLong = parseFloat(positionToClose.szi) > 0;

      await placeMarketOrderAgent(agent.privateKey, {
        coinId,
        isBuy: !isLong, // Close Long = Sell (false), Close Short = Buy (true)
        size,
        currentPrice,
        reduceOnly: true,
      });

      toast.success('Order submitted');
      setCloseDialogOpen(false);
      setTimeout(fetchPositions, 1000);
      setExpandedPositionIndex(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <Card className="w-full">
      {/* Close Position Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Close {positionToClose?.coin}</DialogTitle>
            <DialogDescription>Select amount to close.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Amount</Label>
              <span className="font-mono">{closePercentage}%</span>
            </div>
            <Slider
              defaultValue={[100]}
              max={100}
              step={25}
              value={[closePercentage]}
              onValueChange={(vals) => setClosePercentage(vals[0])}
            />
            <div className="flex justify-between gap-2 mt-2">
              {[25, 50, 75, 100].map((pct) => (
                <Button
                  key={pct}
                  variant={closePercentage === pct ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setClosePercentage(pct)}
                  className="flex-1"
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleExecuteClose}
              disabled={isClosing}
            >
              {isClosing ? 'Closing...' : 'Confirm Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <CardTitle className="text-lg">Open Positions</CardTitle>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchPositions}
            disabled={isLoading}
            className="h-8 w-8"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className={isMobile ? 'p-4' : ''}>
            {positions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No open positions
              </p>
            ) : expandedPositionIndex !== null &&
              positions[expandedPositionIndex] ? (
              /* --- DETAILED VIEW (Expanded) --- */
              (() => {
                const position = positions[expandedPositionIndex];
                const pnl = formatPnl(position.unrealizedPnl);
                const roe =
                  (parseFloat(position.unrealizedPnl) /
                    parseFloat(position.marginUsed)) *
                  100;
                const isLong = parseFloat(position.szi) > 0;
                const leverage = calculateLeverage(position);

                return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                    {/* Navigation Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-border/50">
                      <Button
                        variant="ghost"
                        className="pl-0 gap-1 hover:bg-transparent hover:text-primary"
                        onClick={() => setExpandedPositionIndex(null)}
                      >
                        <ChevronLeft className="h-5 w-5" />
                        <span className="text-base font-semibold">Back</span>
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Open Position
                      </span>
                    </div>

                    {/* Position Title Card */}
                    <div className="flex justify-between items-center py-2">
                      <div className="flex items-center gap-3">
                        <TokenIcon symbol={position.coin} size={32} />
                        <div>
                          <div className="font-bold text-lg">
                            {position.coin}
                          </div>
                          <div
                            className={`text-sm font-medium ${isLong ? 'text-green-500' : 'text-red-500'}`}
                          >
                            {isLong ? 'Long' : 'Short'} {leverage}
                          </div>
                        </div>
                      </div>
                      <div className={`text-right ${pnl.className}`}>
                        <div className="font-bold text-lg">
                          ${pnl.formatted}
                        </div>
                        <div className="text-sm">{formatNumber(roe, 2)}%</div>
                      </div>
                    </div>

                    {/* Trade Details Grid */}
                    <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        Trade Details
                      </h4>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm">
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Entry Price
                          </span>
                          <span className="font-medium text-base">
                            ${formatNumber(position.entryPx)}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Mark Price
                          </span>
                          <span className="font-medium text-base">
                            $
                            {formatNumber(
                              Math.abs(parseFloat(position.markPx || '0')),
                              2
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Size ({position.coin})
                          </span>
                          <span className="font-medium text-base">
                            {formatNumber(
                              Math.abs(parseFloat(position.szi)),
                              4
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">
                            Liq. Price
                          </span>
                          <span className="font-medium text-base text-orange-500">
                            {position.liquidationPx
                              ? `$${formatNumber(position.liquidationPx)}`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4">
                      <Button
                        variant="destructive"
                        className="w-full py-6 text-base font-semibold shadow-lg shadow-destructive/20"
                        onClick={() => handleOpenCloseDialog(position)}
                      >
                        Close Position
                      </Button>
                    </div>
                  </div>
                );
              })()
            ) : (
              /* --- COMPACT LIST VIEW --- */
              <div className="space-y-1">
                {/* Column Headers */}
                <div className="grid grid-cols-[0.8fr_1fr_1fr_1fr_1.2fr] gap-2 px-2 pb-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider text-right">
                  <div className="text-left">Coin</div>
                  <div>Size</div>
                  <div>Entry</div>
                  <div>Mark</div>
                  <div>PnL</div>
                </div>

                {/* Rows */}
                {positions.map((position, index) => {
                  const pnl = formatPnl(position.unrealizedPnl);
                  const roe =
                    (parseFloat(position.unrealizedPnl) /
                      parseFloat(position.marginUsed)) *
                    100;
                  const isLong = parseFloat(position.szi) > 0;

                  return (
                    <div
                      key={index}
                      onClick={() => setExpandedPositionIndex(index)}
                      className="grid grid-cols-[0.8fr_1fr_1fr_1fr_1.2fr] gap-2 p-3 bg-card/50 hover:bg-muted/50 active:bg-muted transition-colors rounded-lg items-center text-xs cursor-pointer border border-transparent hover:border-border/50 text-right"
                    >
                      <div className="flex items-center gap-2 text-left font-bold text-sm text-foreground overflow-hidden">
                        <TokenIcon
                          symbol={position.coin}
                          size={20}
                          className="shrink-0"
                        />
                        <span className="truncate">{position.coin}</span>
                      </div>
                      <div
                        className={
                          isLong
                            ? 'text-green-500 font-medium'
                            : 'text-red-500 font-medium'
                        }
                      >
                        {formatNumber(position.szi, 3)}
                      </div>
                      <div className="font-medium text-muted-foreground">
                        ${formatNumber(position.entryPx, 1)}
                      </div>
                      <div className="font-medium text-muted-foreground">
                        $
                        {formatNumber(
                          Math.abs(parseFloat(position.markPx || '0')),
                          1
                        )}
                      </div>
                      <div
                        className={`flex flex-col items-end ${pnl.className}`}
                      >
                        <span className="font-bold">${pnl.formatted}</span>
                        <span className="text-[10px] opacity-80">
                          ({formatNumber(roe, 1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
