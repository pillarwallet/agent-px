import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';

// types
import { WalletHistoryMobulaResponse } from '../types/api';

// store
import { addMiddleware } from '../store';

// utils
import { CompatibleChains, isTestnet } from '../utils/blockchain';
import { writeCachedWalletHistory } from '../utils/walletHistoryCache';

type WalletHistoryQueryArgs = {
  wallet: string;
  period: string;
  from: number;
  to?: number;
};

const fetchBaseQueryWithRetry = retry(
  fetchBaseQuery({
    baseUrl: isTestnet
      ? 'https://hifidata-nubpgwxpiq-uc.a.run.app'
      : 'https://hifidata-7eu4izffpa-uc.a.run.app',
    headers: {
      'Content-Type': 'application/json',
    },
  }),
  { maxRetries: 5 }
);

export const pillarXApiWalletHistory = createApi({
  reducerPath: 'pillarXApiWalletHistory',
  baseQuery: fetchBaseQueryWithRetry,
  endpoints: (builder) => ({
    getWalletHistory: builder.query<
      WalletHistoryMobulaResponse,
      WalletHistoryQueryArgs
    >({
      query: ({ wallet, period, from, to }) => {
        const chainIds = isTestnet
          ? [11155111]
          : CompatibleChains.map((chain) => chain.chainId);
        const chainIdsQuery = chainIds.map((id) => `chainIds=${id}`).join('&');

        return {
          url: `?${chainIdsQuery}&testnets=${String(isTestnet)}`,
          method: 'POST',
          body: {
            path: 'wallet/history',
            params: {
              wallet,
              blockchains: CompatibleChains.map((chain) => chain.chainId).join(
                ','
              ),
              period,
              from: from * 1000,
              to: to ? to * 1000 : undefined,
              unlistedAssets: 'true',
              filterSpam: 'true',
            },
          },
        };
      },
      transformResponse: (
        response: WalletHistoryMobulaResponse,
        _meta,
        { wallet, period, from, to }
      ) => {
        const walletHistory = response?.result?.data;

        if (walletHistory) {
          writeCachedWalletHistory({
            wallet,
            period,
            from,
            to,
            data: walletHistory,
          });
        }

        return response;
      },
    }),
  }),
});

addMiddleware(pillarXApiWalletHistory);

export const { useGetWalletHistoryQuery } = pillarXApiWalletHistory;
