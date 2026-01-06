import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { getAgentWallet } from '../lib/hyperliquid/keystore';
import { getMarkPrice, getUserState } from '../lib/hyperliquid/client';
import { useWalletClient } from 'wagmi';
import useTransactionKit from '../../../hooks/useTransactionKit';
import { computeSizeUSD, splitTPs, roundToSzDecimals } from '../lib/hyperliquid/order';
import { placeMarketOrderAgent, placeLimitOrderAgent } from '../lib/hyperliquid/sdk';
import { parsePositionForSymbol } from '../lib/hyperliquid/parsers';
import type { AssetInfo } from '../lib/hyperliquid/types';

const tradeSchema = z.object({
  side: z.enum(['long', 'short']),
  entryPrice: z.number().positive().optional(),
  amountUSD: z.number().positive(),
  leverage: z.number().min(1).max(50),
  stopLoss: z.number().positive().optional(),
  takeProfits: z.string().optional(),
}).refine((data) => {
  // Only validate if values are provided
  if (data.entryPrice && data.stopLoss) {
    if (data.side === 'long') {
      return data.stopLoss < data.entryPrice;
    } else {
      return data.stopLoss > data.entryPrice;
    }
  }
  if (data.entryPrice && data.takeProfits) {
    const tps = data.takeProfits.split(',').map(tp => parseFloat(tp.trim())).filter(n => !isNaN(n));
    if (data.side === 'long') {
      return tps.every(tp => tp > data.entryPrice!);
    } else {
      return tps.every(tp => tp < data.entryPrice!);
    }
  }
  return true;
}, {
  message: "Stop loss and take profits must be valid for the trade direction",
  path: ['stopLoss'],
});

type TradeFormData = z.infer<typeof tradeSchema>;

interface TradeFormProps {
  selectedAsset: AssetInfo | null;
  onTradeComplete?: () => void;
  prefilledData?: {
    side?: 'long' | 'short';
    entryPrice?: number;
    stopLoss?: number;
    takeProfits?: string;
  };
}

export function TradeForm({ selectedAsset, onTradeComplete, prefilledData }: TradeFormProps) {
  const { walletAddress: masterAddress } = useTransactionKit();
  const [isMarketOrder, setIsMarketOrder] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [minUSD, setMinUSD] = useState<number | null>(null);

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<TradeFormData>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      side: 'long',
      amountUSD: 25,
      leverage: 5,
    },
  });

  const side = watch('side');
  const amountUSD = watch('amountUSD');
  const leverage = watch('leverage');

  // Fetch market price for minimum calculation
  useEffect(() => {
    if (selectedAsset && isMarketOrder) {
      getMarkPrice(selectedAsset.symbol).then(price => {
        if (price) setMarketPrice(price);
      });
    }
  }, [selectedAsset, isMarketOrder]);

  // Calculate minimum USD required
  useEffect(() => {
    if (!selectedAsset) return;

    const price = marketPrice || 1; // Use 1 as fallback for estimation
    const minSize = Math.pow(10, -selectedAsset.szDecimals);
    const minRequired = (minSize * price) / (leverage || 1);
    setMinUSD(minRequired);
  }, [selectedAsset, marketPrice, leverage]);

  // Apply prefilled data when it changes
  useEffect(() => {
    if (prefilledData) {
      if (prefilledData.side) {
        setValue('side', prefilledData.side);
      }
      if (prefilledData.entryPrice) {
        setValue('entryPrice', prefilledData.entryPrice);
        setIsMarketOrder(false);
      }
      if (prefilledData.stopLoss) {
        setValue('stopLoss', prefilledData.stopLoss);
      }
      if (prefilledData.takeProfits) {
        setValue('takeProfits', prefilledData.takeProfits);
      }
    }
  }, [prefilledData, setValue]);

  // Check if amount is below minimum
  const isBelowMinimum = minUSD !== null && amountUSD > 0 && amountUSD < minUSD;

  // Verify position was opened after trade (check master wallet, not agent)
  const verifyPositionOpened = async (
    symbol: string,
    masterWalletAddress: string,
    maxAttempts = 5,
    delayMs = 1000
  ): Promise<boolean> => {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, delayMs));

      const state = await getUserState(masterWalletAddress);
      if (!state) continue;

      const position = parsePositionForSymbol(state, symbol);
      if (position && position.size > 0) {
        return true; // Position found!
      }
    }
    return false; // Position not found after all attempts
  };

  const onSubmit = async (data: TradeFormData) => {
    console.log('Form submitted with data:', data);
    toast.info('Submitting trade...');

    if (!selectedAsset) {
      toast.error('Please select an asset');
      return;
    }

    if (!masterAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    const agent = await getAgentWallet(masterAddress);
    console.log('Agent wallet:', agent);

    if (!agent) {
      toast.error('Please create and approve an agent wallet first');
      return;
    }

    if (!agent.approved) {
      toast.error('Please approve the agent wallet first');
      return;
    }

    setIsSubmitting(true);
    try {
      // Get entry price
      let entryPrice = data.entryPrice;
      if (isMarketOrder || !entryPrice) {
        toast.info('Fetching market price...');
        entryPrice = await getMarkPrice(selectedAsset.symbol);
        if (!entryPrice) {
          throw new Error('Failed to fetch market price');
        }
      }

      // Calculate size
      const size = computeSizeUSD(data.amountUSD, data.leverage, entryPrice, selectedAsset.szDecimals);

      if (size <= 0) {
        const minSize = Math.pow(10, -selectedAsset.szDecimals);
        const minRequired = (minSize * entryPrice) / data.leverage;
        toast.error(`Amount too small for ${selectedAsset.symbol}`, {
          description: `Minimum required: $${minRequired.toFixed(2)} at ${data.leverage}x leverage`,
        });
        return;
      }

      // Parse take profits if provided
      const tpPrices = data.takeProfits
        ? data.takeProfits.split(',').map(tp => parseFloat(tp.trim())).filter(n => !isNaN(n))
        : [];

      // Place entry order via SDK
      toast.info('Placing entry order...');

      if (isMarketOrder) {
        await placeMarketOrderAgent(agent.privateKey, {
          coinId: selectedAsset.id,
          isBuy: data.side === 'long',
          size,
          currentPrice: entryPrice,
        });
      } else {
        await placeLimitOrderAgent(agent.privateKey, {
          coinId: selectedAsset.id,
          isBuy: data.side === 'long',
          size,
          limitPrice: entryPrice,
          reduceOnly: false,
        });
      }

      // Place stop loss if provided
      if (data.stopLoss) {
        toast.info('Placing stop loss...');
        await placeLimitOrderAgent(agent.privateKey, {
          coinId: selectedAsset.id,
          isBuy: data.side === 'short', // Opposite side for reduce-only
          size,
          limitPrice: data.stopLoss,
          reduceOnly: true,
        });
      }

      // Place take profits if provided
      if (tpPrices.length > 0) {
        const tpSplits = splitTPs(size, tpPrices);
        for (let i = 0; i < tpSplits.length; i++) {
          const tp = tpSplits[i];
          toast.info(`Placing take profit ${i + 1}/${tpSplits.length}...`);

          const tpSize = roundToSzDecimals(tp.size, selectedAsset.szDecimals);
          await placeLimitOrderAgent(agent.privateKey, {
            coinId: selectedAsset.id,
            isBuy: data.side === 'short', // Opposite side for reduce-only
            size: tpSize,
            limitPrice: tp.price,
            reduceOnly: true,
          });
        }
      }

      toast.success('Trade placed successfully!', {
        description: `${data.side.toUpperCase()} ${size} ${selectedAsset.symbol}`,
      });

      // Verify position was opened (check master wallet)
      if (masterAddress) {
        toast.info('Verifying position...', { id: 'verify-position' });

        const positionOpened = await verifyPositionOpened(
          selectedAsset.symbol,
          masterAddress
        );

        if (positionOpened) {
          toast.success('Position confirmed on exchange', { id: 'verify-position' });
          onTradeComplete?.();
        } else {
          toast.warning('Position not found on exchange', {
            id: 'verify-position',
            description: 'The order was submitted but position is not visible yet. Check your orders manually.',
            duration: 8000,
          });
          onTradeComplete?.(); // Still call this to refresh UI
        }
      } else {
        onTradeComplete?.(); // No master address, still refresh
      }
    } catch (error: any) {
      console.error('Trade error:', error);
      toast.error(error.message || 'Failed to place trade');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!selectedAsset) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Select an asset to start trading
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit(onSubmit, () => toast.error('Please fix the form errors'))} className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Trade {selectedAsset.symbol}</h3>
          <span className="text-sm text-muted-foreground">Max {selectedAsset.maxLeverage}x</span>
        </div>

        <div>
          <Label>Side</Label>
          <div className="flex gap-2 mt-1">
            <Button
              type="button"
              variant={side === 'long' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setValue('side', 'long')}
            >
              Long
            </Button>
            <Button
              type="button"
              variant={side === 'short' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setValue('side', 'short')}
            >
              Short
            </Button>
          </div>
          <input type="hidden" {...register('side')} />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="marketToggle">Market Order</Label>
          <Switch
            id="marketToggle"
            checked={isMarketOrder}
            onCheckedChange={setIsMarketOrder}
          />
        </div>

        {!isMarketOrder && (
          <div>
            <Label htmlFor="entryPrice">Entry Price</Label>
            <Input
              id="entryPrice"
              type="number"
              step="any"
              placeholder="0.00"
              {...register('entryPrice', {
                setValueAs: (v) => v === '' ? undefined : parseFloat(v)
              })}
            />
            {errors.entryPrice && (
              <p className="text-xs text-destructive mt-1">{errors.entryPrice.message}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amountUSD">Amount (USD)</Label>
            <Input
              id="amountUSD"
              type="number"
              step="any"
              placeholder="25"
              {...register('amountUSD', { valueAsNumber: true })}
            />
            {errors.amountUSD && (
              <p className="text-xs text-destructive mt-1">{errors.amountUSD.message}</p>
            )}
            {isBelowMinimum && minUSD && (
              <p className="text-xs text-destructive mt-1">
                Minimum: ${minUSD.toFixed(2)} at {leverage}x leverage
              </p>
            )}
            {!isBelowMinimum && minUSD && (
              <p className="text-xs text-muted-foreground mt-1">
                Min: ~${minUSD.toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="leverage">Leverage (×)</Label>
            <div className="flex gap-2 mt-1 mb-2">
              {[2, 5, 10, 20].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={leverage === preset ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setValue('leverage', preset)}
                  disabled={preset > selectedAsset.maxLeverage}
                >
                  {preset}x
                </Button>
              ))}
            </div>
            <Input
              id="leverage"
              type="number"
              step="1"
              min="1"
              max={selectedAsset.maxLeverage}
              placeholder="Custom"
              {...register('leverage', { valueAsNumber: true })}
            />
            {errors.leverage && (
              <p className="text-xs text-destructive mt-1">{errors.leverage.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="stopLoss">Stop Loss (optional)</Label>
          <Input
            id="stopLoss"
            type="number"
            step="any"
            placeholder={side === 'long' ? '< Entry (optional)' : '> Entry (optional)'}
            {...register('stopLoss', {
              setValueAs: (v) => v === '' ? undefined : parseFloat(v)
            })}
          />
          {errors.stopLoss && (
            <p className="text-xs text-destructive mt-1">{errors.stopLoss.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="takeProfits">Take Profits (optional, comma-separated)</Label>
          <Input
            id="takeProfits"
            type="text"
            placeholder={side === 'long' ? 'e.g., 100, 110, 120 (optional)' : 'e.g., 90, 80, 70 (optional)'}
            {...register('takeProfits')}
          />
          {errors.takeProfits && (
            <p className="text-xs text-destructive mt-1">{errors.takeProfits.message}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || isBelowMinimum}
          className="w-full"
        >
          {isSubmitting ? 'Placing Trade...' : `Place ${side === 'long' ? 'Long' : 'Short'} Order`}
        </Button>
      </form>
    </Card>
  );
}
