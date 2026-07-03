import { WalletHistory } from '../types/api';
import { isTestnet } from './blockchain';

const WALLET_HISTORY_CACHE_PREFIX = 'pillarx:walletHistory:v1';
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

type WalletHistoryCacheParams = {
  wallet: string;
  period: string;
  from: number;
  to?: number;
};

export type CachedWalletHistory = {
  fetchedAt: number;
  data: WalletHistory;
};

const getStorage = () => {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const isWalletHistory = (value: unknown): value is WalletHistory => {
  if (!value || typeof value !== 'object') return false;

  return Array.isArray((value as WalletHistory).balance_history);
};

const isCachedWalletHistory = (
  value: unknown
): value is CachedWalletHistory => {
  if (!value || typeof value !== 'object') return false;

  const cacheRecord = value as CachedWalletHistory;

  return (
    typeof cacheRecord.fetchedAt === 'number' &&
    isWalletHistory(cacheRecord.data)
  );
};

const getWalletHistoryRangeKey = ({
  from,
  to,
}: Pick<WalletHistoryCacheParams, 'from' | 'to'>) => {
  if (to) return `custom:${from}:${to}`;

  const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - from);

  if (ageSeconds <= 90 * 60) return '1h';
  if (ageSeconds <= 36 * HOUR_SECONDS) return '24h';
  if (ageSeconds <= 10 * DAY_SECONDS) return '1w';
  if (ageSeconds <= 45 * DAY_SECONDS) return '1mo';
  if (ageSeconds <= 210 * DAY_SECONDS) return '6mo';

  return `from:${from}`;
};

export const getWalletHistoryCacheKey = ({
  wallet,
  period,
  from,
  to,
}: WalletHistoryCacheParams) =>
  [
    WALLET_HISTORY_CACHE_PREFIX,
    wallet.toLowerCase(),
    `testnet:${String(isTestnet)}`,
    `period:${period}`,
    `range:${getWalletHistoryRangeKey({ from, to })}`,
  ].join(':');

export const readCachedWalletHistory = (
  params: WalletHistoryCacheParams
): CachedWalletHistory | undefined => {
  const storage = getStorage();
  if (!storage || !params.wallet) return undefined;

  const cacheKey = getWalletHistoryCacheKey(params);
  const cachedValue = storage.getItem(cacheKey);

  if (!cachedValue) return undefined;

  try {
    const parsedValue = JSON.parse(cachedValue);

    if (isCachedWalletHistory(parsedValue)) {
      return parsedValue;
    }
  } catch {
    // Ignore malformed cache entries and clear them below.
  }

  storage.removeItem(cacheKey);
  return undefined;
};

export const writeCachedWalletHistory = ({
  wallet,
  period,
  from,
  to,
  data,
}: WalletHistoryCacheParams & { data: WalletHistory }) => {
  const storage = getStorage();
  if (!storage || !wallet) return;

  const cacheRecord: CachedWalletHistory = {
    fetchedAt: Date.now(),
    data,
  };

  try {
    storage.setItem(
      getWalletHistoryCacheKey({ wallet, period, from, to }),
      JSON.stringify(cacheRecord)
    );
  } catch {
    // If storage is unavailable or full, fall back to network-only behavior.
  }
};
