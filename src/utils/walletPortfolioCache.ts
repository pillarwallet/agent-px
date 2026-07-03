import { PortfolioData } from '../types/api';
import { isTestnet } from './blockchain';

const WALLET_PORTFOLIO_CACHE_PREFIX = 'pillarx:walletPortfolio:v1';

type WalletPortfolioCacheParams = {
  wallet: string;
  isPnl: boolean;
};

export type CachedWalletPortfolio = {
  fetchedAt: number;
  data: PortfolioData;
};

const getStorage = () => {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const isPortfolioData = (value: unknown): value is PortfolioData => {
  if (!value || typeof value !== 'object') return false;

  return Array.isArray((value as PortfolioData).assets);
};

const isCachedWalletPortfolio = (
  value: unknown
): value is CachedWalletPortfolio => {
  if (!value || typeof value !== 'object') return false;

  const cacheRecord = value as CachedWalletPortfolio;

  return (
    typeof cacheRecord.fetchedAt === 'number' &&
    isPortfolioData(cacheRecord.data)
  );
};

export const getWalletPortfolioCacheKey = ({
  wallet,
  isPnl,
}: WalletPortfolioCacheParams) =>
  [
    WALLET_PORTFOLIO_CACHE_PREFIX,
    wallet.toLowerCase(),
    `testnet:${String(isTestnet)}`,
    `pnl:${String(isPnl)}`,
  ].join(':');

export const readCachedWalletPortfolio = (
  params: WalletPortfolioCacheParams
): CachedWalletPortfolio | undefined => {
  const storage = getStorage();
  if (!storage || !params.wallet) return undefined;

  const cacheKey = getWalletPortfolioCacheKey(params);
  const cachedValue = storage.getItem(cacheKey);

  if (!cachedValue) return undefined;

  try {
    const parsedValue = JSON.parse(cachedValue);

    if (isCachedWalletPortfolio(parsedValue)) {
      return parsedValue;
    }
  } catch {
    // Ignore malformed cache entries and clear them below.
  }

  storage.removeItem(cacheKey);
  return undefined;
};

export const writeCachedWalletPortfolio = ({
  wallet,
  isPnl,
  data,
}: WalletPortfolioCacheParams & { data: PortfolioData }) => {
  const storage = getStorage();
  if (!storage || !wallet) return;

  const cacheRecord: CachedWalletPortfolio = {
    fetchedAt: Date.now(),
    data,
  };

  try {
    storage.setItem(
      getWalletPortfolioCacheKey({ wallet, isPnl }),
      JSON.stringify(cacheRecord)
    );
  } catch {
    // If storage is unavailable or full, fall back to network-only behavior.
  }
};
