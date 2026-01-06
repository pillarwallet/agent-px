/**
 * Supabase to Firebase API Adapter
 *
 * This adapter provides a Supabase-compatible interface that translates
 * calls to Firebase Functions API. This allows the _lovable components
 * to work without modification while we migrate to Firebase.
 */

import {
  fetchSparklineData,
  getTradingSignals,
  updateSignalPrices,
} from '../api/insightsApi';

/**
 * Mock Supabase client that translates calls to Firebase API
 */
export const createSupabaseAdapter = () => {
  const sortByColumn = (
    data: any[],
    column: string | undefined,
    options?: { ascending?: boolean }
  ) => {
    if (!column) {
      return data;
    }

    const ascending = options?.ascending !== false;
    const sentinel = ascending
      ? Number.POSITIVE_INFINITY
      : Number.NEGATIVE_INFINITY;

    return data.sort((a: any, b: any) => {
      const aRaw = a?.[column];
      const bRaw = b?.[column];

      const aVal =
        aRaw === null || aRaw === undefined
          ? sentinel
          : typeof aRaw === 'string'
            ? aRaw
            : Number(aRaw);
      const bVal =
        bRaw === null || bRaw === undefined
          ? sentinel
          : typeof bRaw === 'string'
            ? bRaw
            : Number(bRaw);

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (aVal < bVal) return ascending ? -1 : 1;
        if (aVal > bVal) return ascending ? 1 : -1;
        return 0;
      }

      const result = String(aVal).localeCompare(String(bVal));
      return ascending ? result : -result;
    });
  };

  return {
    from: (table: string) => ({
      select: (columns = '*') => ({
        order: (column: string, options?: { ascending?: boolean }) => {
          const runQuery = async (
            filter?: (item: any) => boolean
          ): Promise<{ data: any; error: any }> => {
            try {
              const result = await getTradingSignals();
              let data = result.data || [];

              if (filter) {
                data = data.filter(filter);
              }

              sortByColumn(data, column, options);
              return { data, error: null };
            } catch (error: any) {
              return { data: null, error };
            }
          };

          return {
            eq: (filterColumn: string, value: any) =>
              runQuery((item) => item[filterColumn] === value),
            exec: () => runQuery(),
          };
        },
      }),
    }),
    functions: {
      invoke: async (functionName: string, options?: { body?: any }) => {
        try {
          const body = options?.body;

          if (functionName === 'fetch-sparkline-data') {
            const { ticker, startTime, endTime } = body || {};
            const result = await fetchSparklineData(ticker, startTime, endTime);
            return { data: result, error: null };
          }

          if (functionName === 'update-signal-prices') {
            const result = await updateSignalPrices();
            return result;
          }

          if (functionName === 'recalculate-historical-pnl') {
            // TODO: Implement when function is ready
            return { data: null, error: new Error('Not yet implemented') };
          }

          return {
            data: null,
            error: new Error(`Unknown function: ${functionName}`),
          };
        } catch (error: any) {
          return { data: null, error };
        }
      },
    },
    channel: () => ({
      on: () => ({
        subscribe: () => ({
          // Return a mock subscription - realtime will be handled by polling
        }),
      }),
      remove: () => {},
    }),
    removeChannel: () => {},
  };
};
