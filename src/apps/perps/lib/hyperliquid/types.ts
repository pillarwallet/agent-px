import { z } from 'zod';

export const CopyTileSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['long', 'short']),
  entry: z.union([
    z.number().positive(),
    z.tuple([z.number().positive(), z.number().positive()]),
  ]),
  stopLoss: z.number().positive(),
  takeProfits: z.union([
    z.array(z.number().positive()).min(1),
    z.tuple([z.number().positive(), z.number().positive()]),
  ]),
});

export type CopyTileEntry = number | [number, number];
export type CopyTileTakeProfits = number[] | [number, number];

export interface CopyTile {
  symbol: string;
  side: 'long' | 'short';
  entry: CopyTileEntry;
  stopLoss: number;
  takeProfits: CopyTileTakeProfits;
}

export interface UserState {
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      leverage: {
        value: number;
      };
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
    };
  }>;
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
}

export interface HyperliquidAction {
  type: string;
  [key: string]: any;
}

export interface SignedAction {
  action: HyperliquidAction;
  nonce: number;
  signature: {
    r: string;
    s: string;
    v: number;
  };
  vaultAddress?: string | null;
}

export interface AssetInfo {
  id: number;
  symbol: string;
  szDecimals: number;
  maxLeverage: number;
}

export interface EnhancedAsset extends AssetInfo {
  price: number;
  volume: number;
  priceChange: number;
  priceChangePercent: number;
}
