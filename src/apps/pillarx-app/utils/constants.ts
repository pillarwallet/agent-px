import { PrimeAssetType } from '../../../types/api';

export const PAGE_LIMIT: number = 4;

export const PRIME_ASSETS_MOBULA: PrimeAssetType[] = [
  { name: 'Ethereum', symbol: 'ETH' },
  { name: 'USDC', symbol: 'USDC' },
  { name: 'Binance Bridged USDC (BNB Smart Chain)', symbol: 'USDC' },
  { name: 'Tether', symbol: 'USDT' },
  { name: 'Binance Bridged USDT (BNB Smart Chain)', symbol: 'BSC-USD' },
  { name: 'Polygon', symbol: 'MATIC' },
  { name: 'POL (ex-MATIC)', symbol: 'POL' },
  { name: 'MATIC (migrated to POL)', symbol: 'MATIC' },
  { name: 'BNB', symbol: 'BNB' },
  { name: 'Dai', symbol: 'DAI' },
];
