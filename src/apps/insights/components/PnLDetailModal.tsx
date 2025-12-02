import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "./ui/drawer";
import { ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { format } from "date-fns";
import { getEffectiveStopLoss, normalizeTrailingHistory } from "../lib/stopLossUtils";
import { formatPrice } from "../utils/formatUtils";
import { useIsMobile } from "../hooks/use-mobile";
import type { TradingSignal } from "../types";
import { X } from "lucide-react";

interface PnLDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: 'floating' | 'open' | 'closed' | null;
  signals: TradingSignal[];
}

export const PnLDetailModal = ({ open, onOpenChange, view, signals }: PnLDetailModalProps) => {
  if (!view) return null;

  const isMobile = useIsMobile();

  const filteredSignals = useMemo(() => {
    switch (view) {
      case 'floating':
        return signals.filter(s => s.status === 'active');
      case 'open':
        return signals.filter(s => s.status === 'active');
      case 'closed':
        return signals.filter(s => 
          ['completed', 'stopped', 'closed'].includes(s.status || 'active')
        );
      default:
        return [];
    }
  }, [view, signals]);

  const chartData = useMemo(() => {
    if (view === 'open') {
      const openSignals = filteredSignals
        .filter(s => typeof s.profit_loss_percent === 'number')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      let cumulative = 0;
      const data = openSignals.map(s => {
        cumulative += s.profit_loss_percent || 0;
        return {
          ts: new Date(s.created_at).getTime(),
          value: cumulative,
          label: s.ticker,
        };
      });

      if (data.length > 0) {
        data.push({
          ts: Date.now(),
          value: cumulative,
          label: 'Now',
          isNow: true,
        } as any);
      }
      return data;
    } else {
      const closedSignals = filteredSignals
        .filter(s => typeof s.realized_pnl_percent === 'number')
        .sort((a, b) => {
          const dateA = a.closed_at || a.last_price_update || a.created_at;
          const dateB = b.closed_at || b.last_price_update || b.created_at;
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });
      
      let cumulative = 0;
      return closedSignals.map(s => {
        cumulative += s.realized_pnl_percent || 0;
        return {
          ts: new Date(s.closed_at || s.last_price_update || s.created_at).getTime(),
          value: cumulative,
          label: s.ticker,
        };
      });
    }
  }, [view, filteredSignals]);
  const totalPnL = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;
  const isPositive = totalPnL >= 0;

  const getTitle = () => {
    switch (view) {
      case 'floating':
        return 'Floating P&L Performance';
      case 'open':
        return 'Open Positions Details';
      case 'closed':
        return 'Closed Trades History';
      default:
        return '';
    }
  };

  const getDescriptionData = () => {
    const count = filteredSignals.length;
    const winCount = filteredSignals.filter(s => 
      view === 'open' 
        ? (s.profit_loss_percent || 0) > 0 
        : (s.realized_pnl_percent || 0) > 0
    ).length;
    const winRate = count > 0 ? ((winCount / count) * 100).toFixed(1) : '0.0';
    
    return { count, winRate };
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    
    const p = payload[0]?.payload;
    if (!p) return null;
    
    const dateText = p.isNow ? 'Now' : format(new Date(p.ts), 'MMM dd, yyyy HH:mm');
    const val = typeof payload[0].value === 'number' ? payload[0].value : 0;
    
    return (
      <div className="glass-card p-4 rounded-2xl border border-primary/20 backdrop-blur-2xl">
        <p className="text-sm font-semibold text-white mb-1">{dateText}</p>
        <p className="text-sm text-muted-foreground mb-1">{p.label}</p>
        <p className={`text-sm font-bold ${val >= 0 ? 'text-[hsl(142,76%,58%)]' : 'text-[hsl(348,83%,58%)]'}`}>
          {val >= 0 ? '+' : ''}{val.toFixed(2)}%
        </p>
      </div>
    );
  };

  const ModalContent = () => (
    <>
      {/* Chart Section */}
      <div className="mt-3 sm:mt-4">
        <div className="glass-card rounded-3xl p-5 sm:p-7 border border-primary/15">
          <h3 className="text-base sm:text-lg font-semibold mb-4 text-white">Cumulative P&L Over Time</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180} className="sm:h-[240px]">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? 'hsl(142,76%,58%)' : 'hsl(348,83%,58%)'} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={isPositive ? 'hsl(142,76%,58%)' : 'hsl(348,83%,58%)'} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="ts"
                  type="number"
                  domain={['auto', 'auto']}
                  tickFormatter={(ts) => format(new Date(ts), 'MMM dd')}
                  minTickGap={8}
                  tickMargin={6}
                  stroke="hsl(var(--muted-foreground))"
                  className="text-[10px] sm:text-xs"
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  className="text-[10px] sm:text-xs"
                  tickFormatter={(value) => `${value.toFixed(1)}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isPositive ? 'hsl(142,76%,58%)' : 'hsl(348,83%,58%)'}
                  strokeWidth={2}
                  fill="url(#colorPnL)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-muted-foreground py-12">
              No data available for this view
            </div>
          )}
        </div>
      </div>

      {/* Trades Table */}
      <div className="mt-4 sm:mt-6">
        <h3 className="text-base sm:text-lg font-semibold mb-4 text-white">Trade Breakdown</h3>
        
        {/* Trade Timeline - only for closed trades */}
        {view === 'closed' && filteredSignals.length > 0 && (
          <div className="mb-6 glass-card rounded-3xl p-4 border border-amber-500/20">
            <h4 className="text-sm font-semibold mb-3 text-amber-400">📍 Trade Timeline</h4>
            <div className="space-y-6">
              {filteredSignals
                .sort((a, b) => {
                  const dateA = new Date(a.closed_at || a.last_price_update || a.created_at);
                  const dateB = new Date(b.closed_at || b.last_price_update || b.created_at);
                  return dateB.getTime() - dateA.getTime(); // Most recent first
                })
                .map(signal => {
                  const { events, latestStop } = normalizeTrailingHistory(signal);
                  
                  return (
                    <div key={signal.id} className="border-l-2 border-amber-500/30 pl-3">
                      <div className="text-xs font-medium text-white mb-3">{signal.ticker}</div>
                      <div className="space-y-2">
                        {events.map((event, idx) => {
                          if (event.type === 'opened') {
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <span className="text-green-400">🟢 Opened</span>
                                <span className="text-muted-foreground">
                                  Original SL: <span className="font-mono text-red-400">${formatPrice(event.original_stop!, signal.ticker)}</span>
                                </span>
                                <span className="text-muted-foreground text-[10px]">
                                  {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                                </span>
                              </div>
                            );
                          }
                          
                          if (event.type === 'tp_hit') {
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-amber-400">🎯 {event.tp_level?.toUpperCase()} hit</span>
                                  {event.tp_price && (
                                    <span className="font-mono text-white">${formatPrice(event.tp_price, signal.ticker)}</span>
                                  )}
                                  <span className="text-muted-foreground text-[10px]">
                                    {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                                  </span>
                                </div>
                                {event.moved ? (
                                  <div className="flex items-center gap-2 text-xs pl-4">
                                    <span className="text-blue-400">📈 SL moved:</span>
                                    <span className="font-mono text-muted-foreground">${formatPrice(event.old_stop!, signal.ticker)}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="font-mono text-green-400">${formatPrice(event.new_stop!, signal.ticker)}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-xs pl-4">
                                    <span className="text-muted-foreground">SL unchanged at</span>
                                    <span className="font-mono text-white">${formatPrice(event.old_stop!, signal.ticker)}</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          
                          if (event.type === 'stop_loss_hit') {
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <span className="text-red-400">🛑 Stop Loss Hit</span>
                                <span className="font-mono text-red-400">${formatPrice(event.stop_price!, signal.ticker)}</span>
                                <span className="text-muted-foreground text-[10px]">
                                  {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                                </span>
                              </div>
                            );
                          }
                          
                          if (event.type === 'closed') {
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                <span className="text-blue-400">✅ Closed</span>
                                {event.exit_price && (
                                  <span className="font-mono text-white">${formatPrice(event.exit_price, signal.ticker)}</span>
                                )}
                                <span className="text-muted-foreground text-[10px]">
                                  {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                                </span>
                              </div>
                            );
                          }
                          
                          return null;
                        })}
                        <div className="flex items-center gap-2 text-xs pt-2 border-t border-amber-500/20">
                          <span className="text-amber-400">Latest SL:</span>
                          <span className="font-mono text-white font-semibold">${formatPrice(latestStop, signal.ticker)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        <div className="glass-card rounded-3xl overflow-hidden border border-primary/15">
          <div className="overflow-x-auto">
            <Table className="w-full text-xs sm:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="hidden sm:table-cell">Entry</TableHead>
                  <TableHead>{view === 'open' ? 'Current' : 'Exit'}</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead className="hidden md:table-cell">TPs Hit</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSignals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No trades in this category
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSignals
                    .sort((a, b) => {
                      const dateA = view === 'open' 
                        ? new Date(a.created_at) 
                        : new Date(a.closed_at || a.last_price_update || a.created_at);
                      const dateB = view === 'open' 
                        ? new Date(b.created_at) 
                        : new Date(b.closed_at || b.last_price_update || b.created_at);
                      return dateB.getTime() - dateA.getTime();
                    })
                    .map(signal => {
                      const pnl = view === 'open' 
                        ? (signal.profit_loss_percent || 0) 
                        : (signal.realized_pnl_percent || 0);
                      const isPositivePnL = pnl >= 0;
                      
                      // Count TP hits
                      const tpHits = [
                        signal.tp1_hit,
                        signal.tp2_hit,
                        signal.tp3_hit,
                      ].filter(Boolean).length;
                      
                      return (
                        <TableRow key={signal.id}>
                          <TableCell className="font-medium">{signal.ticker}</TableCell>
                          <TableCell className="hidden sm:table-cell">${formatPrice(signal.entry_price, signal.ticker)}</TableCell>
                          <TableCell>
                            ${view === 'open' 
                              ? formatPrice(signal.current_price || signal.entry_price, signal.ticker)
                              : signal.stop_loss_hit 
                                ? formatPrice(getEffectiveStopLoss(signal), signal.ticker)
                                : formatPrice(signal.current_price || signal.entry_price, signal.ticker)
                            }
                          </TableCell>
                           <TableCell>
                             <div className="flex flex-col gap-1">
                               <span className={isPositivePnL ? 'text-[hsl(142,76%,58%)]' : 'text-[hsl(348,83%,58%)]'}>
                                 {isPositivePnL ? '+' : ''}{pnl.toFixed(2)}%
                               </span>
                                {view === 'closed' && signal.status === 'closed' && (
                                  <details className="text-[10px] text-muted-foreground cursor-pointer">
                                    <summary className="hover:text-white transition-colors">How calculated?</summary>
                                    <div className="mt-2 space-y-1 text-[9px] bg-background/50 rounded p-2">
                                      {signal.tp1_hit && (
                                        <div>TP1: {(
                                          signal.order_side === 'buy' 
                                            ? (((signal.tp1 - signal.entry_price) / signal.entry_price) * 100 * 0.3333)
                                            : (((signal.entry_price - signal.tp1) / signal.entry_price) * 100 * 0.3333)
                                        ).toFixed(2)}% (33.33%)</div>
                                      )}
                                      {signal.tp2_hit && (
                                        <div>TP2: {(
                                          signal.order_side === 'buy' 
                                            ? (((signal.tp2 - signal.entry_price) / signal.entry_price) * 100 * 0.3333)
                                            : (((signal.entry_price - signal.tp2) / signal.entry_price) * 100 * 0.3333)
                                        ).toFixed(2)}% (33.33%)</div>
                                      )}
                                      {signal.tp3_hit && (
                                        <div>TP3: {(
                                          signal.order_side === 'buy' 
                                            ? (((signal.tp3 - signal.entry_price) / signal.entry_price) * 100 * 0.3333)
                                            : (((signal.entry_price - signal.tp3) / signal.entry_price) * 100 * 0.3333)
                                        ).toFixed(2)}% (33.33%)</div>
                                      )}
                                      {(() => {
                                        const tpCount = [signal.tp1_hit, signal.tp2_hit, signal.tp3_hit].filter(Boolean).length;
                                        const remaining = 1 - (tpCount * 0.3333);
                                        if (remaining > 0) {
                                          const exitPrice = signal.stop_loss_hit ? getEffectiveStopLoss(signal) : (signal.current_price || signal.entry_price);
                                          const remainingPnL = signal.order_side === 'buy'
                                            ? ((exitPrice - signal.entry_price) / signal.entry_price) * 100 * remaining
                                            : ((signal.entry_price - exitPrice) / signal.entry_price) * 100 * remaining;
                                          return <div className="text-amber-400">Remaining: {remainingPnL.toFixed(2)}% ({(remaining * 100).toFixed(0)}%)</div>;
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </details>
                                )}
                             </div>
                           </TableCell>
                           <TableCell className="hidden md:table-cell">
                            <div className="flex gap-1">
                              {[1, 2, 3].map(i => (
                                <div
                                  key={i}
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                                    signal[`tp${i}_hit` as keyof typeof signal]
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-slate-500/10 text-slate-600 border border-slate-500/20'
                                  }`}
                                >
                                  {i}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge 
                              className={
                                signal.status === 'active' 
                                  ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                                  : signal.status === 'completed'
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                              }
                            >
                              {signal.status?.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="hidden sm:inline">
                              {format(
                                new Date(view === 'open' ? signal.created_at : (signal.closed_at || signal.last_price_update || signal.created_at)),
                                'MMM dd, yyyy'
                              )}
                            </span>
                            <span className="sm:hidden">
                              {format(
                                new Date(view === 'open' ? signal.created_at : (signal.closed_at || signal.last_price_update || signal.created_at)),
                                'MMM dd'
                              )}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );

  // Mobile: Full-screen Drawer
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[95vh] flex flex-col glass-card border-primary/20">
          <DrawerClose className="absolute right-4 top-4 z-50 rounded-full p-2 opacity-70 hover:opacity-100 bg-muted/50 transition-opacity">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DrawerClose>
          <DrawerHeader className="px-4 pt-4 pb-2">
            <DrawerTitle className="text-lg leading-tight">{getTitle()}</DrawerTitle>
            <DrawerDescription className="text-xs flex flex-col gap-1">
              {(() => {
                const { count, winRate } = getDescriptionData();
                return (
                  <>
                    <span>{count} total {count === 1 ? 'trade' : 'trades'}</span>
                    <span>{winRate}% win rate</span>
                    <span>{isPositive ? '+' : ''}{totalPnL.toFixed(2)}% cumulative P&L</span>
                  </>
                );
              })()}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ModalContent />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Centered Dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:w-full max-w-[calc(100vw-2rem)] sm:max-w-4xl mx-4 sm:mx-0 h-[92vh] sm:h-auto max-h-[90vh] overflow-y-auto rounded-3xl sm:rounded-3xl p-5 sm:p-7 glass-card border-primary/20">::
        <DialogHeader className="pr-10 sm:pr-0">
          <DialogTitle className="text-lg sm:text-2xl leading-tight">{getTitle()}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm flex flex-col sm:flex-row gap-1 sm:gap-0">
            {(() => {
              const { count, winRate } = getDescriptionData();
              return (
                <>
                  <span>{count} total {count === 1 ? 'trade' : 'trades'}</span>
                  <span className="hidden sm:inline"> • </span>
                  <span>{winRate}% win rate</span>
                  <span className="hidden sm:inline"> • </span>
                  <span>{isPositive ? '+' : ''}{totalPnL.toFixed(2)}% cumulative P&L</span>
                </>
              );
            })()}
          </DialogDescription>
        </DialogHeader>
        <ModalContent />
      </DialogContent>
    </Dialog>
  );
};
