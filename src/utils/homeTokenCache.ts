import { ApiResponse } from '../types/api';
import { isTestnet } from './blockchain';

const HOME_TOKEN_CACHE_PREFIX = 'pillarx:homeTokens:v1';

export type HomeTokenListKind = 'trending' | 'fresh';

export type CachedHomeTokenList = {
  fetchedAt: number;
  data: ApiResponse;
};

const getStorage = () => {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const isApiResponse = (value: unknown): value is ApiResponse => {
  if (!value || typeof value !== 'object') return false;

  return Array.isArray((value as ApiResponse).projection);
};

const isCachedHomeTokenList = (
  value: unknown
): value is CachedHomeTokenList => {
  if (!value || typeof value !== 'object') return false;

  const cacheRecord = value as CachedHomeTokenList;

  return (
    typeof cacheRecord.fetchedAt === 'number' && isApiResponse(cacheRecord.data)
  );
};

export const getHomeTokenCacheKey = (kind: HomeTokenListKind) =>
  [HOME_TOKEN_CACHE_PREFIX, kind, `testnet:${String(isTestnet)}`].join(':');

export const readCachedHomeTokenList = (
  kind: HomeTokenListKind
): CachedHomeTokenList | undefined => {
  const storage = getStorage();
  if (!storage) return undefined;

  const cacheKey = getHomeTokenCacheKey(kind);
  const cachedValue = storage.getItem(cacheKey);

  if (!cachedValue) return undefined;

  try {
    const parsedValue = JSON.parse(cachedValue);

    if (isCachedHomeTokenList(parsedValue)) {
      return parsedValue;
    }
  } catch {
    // Ignore malformed cache entries and clear them below.
  }

  storage.removeItem(cacheKey);
  return undefined;
};

export const writeCachedHomeTokenList = ({
  kind,
  data,
}: {
  kind: HomeTokenListKind;
  data: ApiResponse;
}) => {
  const storage = getStorage();
  if (!storage) return;

  const cacheRecord: CachedHomeTokenList = {
    fetchedAt: Date.now(),
    data,
  };

  try {
    storage.setItem(getHomeTokenCacheKey(kind), JSON.stringify(cacheRecord));
  } catch {
    // If storage is unavailable or full, fall back to network-only behavior.
  }
};
