import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';

// store
import { addMiddleware } from '../../../store';

// types
import { ApiResponse, Projection } from '../../../types/api';

// utils
import { allCompatibleChains, isTestnet } from '../../../utils/blockchain';
import {
  HomeTokenListKind,
  writeCachedHomeTokenList,
} from '../../../utils/homeTokenCache';

const endpointUrls: Record<
  HomeTokenListKind,
  { testnet: string; mainnet: string }
> = {
  trending: {
    testnet: 'https://trendingtokens-nubpgwxpiq-uc.a.run.app',
    mainnet: 'https://trendingtokens-7eu4izffpa-uc.a.run.app',
  },
  fresh: {
    testnet: 'https://freshtokens-nubpgwxpiq-uc.a.run.app',
    mainnet: 'https://freshtokens-7eu4izffpa-uc.a.run.app',
  },
};

const chainIdsQuery = allCompatibleChains
  .map((chain) => chain.chainId)
  .join(',');

const getHomeTokenUrl = (kind: HomeTokenListKind) => {
  const endpoint = isTestnet
    ? endpointUrls[kind].testnet
    : endpointUrls[kind].mainnet;

  return `${endpoint}?chainIds=${chainIdsQuery}`;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeHomeTokenResponse = (response: unknown): ApiResponse => {
  if (Array.isArray(response)) {
    return { projection: response as Projection[] };
  }

  if (isObject(response) && Array.isArray(response.projection)) {
    return { projection: response.projection as Projection[] };
  }

  return { projection: [] };
};

const baseQueryWithRetry = retry(
  fetchBaseQuery({
    baseUrl: '',
  }),
  {
    maxRetries: 5,
  }
);

export const homeTokensApi = createApi({
  reducerPath: 'homeTokensApi',
  baseQuery: baseQueryWithRetry,
  endpoints: (builder) => ({
    getTrendingHomeTokens: builder.query<ApiResponse, void>({
      query: () => getHomeTokenUrl('trending'),
      transformResponse: (response: unknown) => {
        const data = normalizeHomeTokenResponse(response);
        writeCachedHomeTokenList({ kind: 'trending', data });

        return data;
      },
    }),
    getFreshHomeTokens: builder.query<ApiResponse, void>({
      query: () => getHomeTokenUrl('fresh'),
      transformResponse: (response: unknown) => {
        const data = normalizeHomeTokenResponse(response);
        writeCachedHomeTokenList({ kind: 'fresh', data });

        return data;
      },
    }),
  }),
});

addMiddleware(homeTokensApi);

export const { useGetFreshHomeTokensQuery, useGetTrendingHomeTokensQuery } =
  homeTokensApi;
