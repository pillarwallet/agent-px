import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';

// types
import { WalletTransactionsMobulaResponse } from '../types/api';

// utils
import { isTestnet } from '../utils/blockchain';

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

export const pillarXApiWalletTransactions = createApi({
  reducerPath: 'pillarXApiWalletTransactions',
  baseQuery: fetchBaseQueryWithRetry,
  endpoints: (builder) => ({
    getWalletTransactions: builder.query<
      WalletTransactionsMobulaResponse,
      { wallet: string; limit?: number; page?: number }
    >({
      query: ({ wallet, limit = 500, page = 1 }) => {
        return {
          url: `?testnets=${String(isTestnet)}`,
          method: 'POST',
          body: {
            path: 'wallet/transactions',
            params: {
              wallet,
              limit,
              page,
              filterSpam: false,
            },
          },
        };
      },
      transformResponse: (response: {
        result: WalletTransactionsMobulaResponse;
      }) => response.result,
    }),
  }),
});

export const { useGetWalletTransactionsQuery } = pillarXApiWalletTransactions;
