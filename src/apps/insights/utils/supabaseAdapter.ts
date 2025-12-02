/**
 * Supabase to Firebase API Adapter
 * 
 * This adapter provides a Supabase-compatible interface that translates
 * calls to Firebase Functions API. This allows the _lovable components
 * to work without modification while we migrate to Firebase.
 */

import { fetchSparklineData, getTradingSignals, updateSignalPrices } from '../api/insightsApi';

/**
 * Mock Supabase client that translates calls to Firebase API
 */
export const createSupabaseAdapter = () => {
  return {
    from: (table: string) => ({
      select: (columns = '*') => ({
        order: (column: string, options?: { ascending?: boolean }) => ({
          eq: (filterColumn: string, value: any) => ({
            // This is a simplified adapter - for now just return a promise
            // that calls the Firebase API
            then: async (onResolve?: any, onReject?: any) => {
              try {
                const result = await getTradingSignals();
                // Apply filtering if needed
                let data = result.data || [];
                
                // Simple filtering (can be enhanced)
                if (filterColumn && value !== undefined) {
                  data = data.filter((item: any) => item[filterColumn] === value);
                }
                
                // Simple sorting (can be enhanced)
                if (column) {
                  data.sort((a: any, b: any) => {
                    const aVal = a[column];
                    const bVal = b[column];
                    const ascending = options?.ascending !== false;
                    
                    if (aVal < bVal) return ascending ? -1 : 1;
                    if (aVal > bVal) return ascending ? 1 : -1;
                    return 0;
                  });
                }
                
                const response = { data, error: null };
                return onResolve ? onResolve(response) : response;
              } catch (error: any) {
                const response = { data: null, error };
                return onReject ? onReject(response) : response;
              }
            },
          }),
          // For queries without eq filter
          then: async (onResolve?: any, onReject?: any) => {
            try {
              const result = await getTradingSignals();
              let data = result.data || [];
              
              // Simple sorting
              if (column) {
                data.sort((a: any, b: any) => {
                  const aVal = a[column];
                  const bVal = b[column];
                  const ascending = options?.ascending !== false;
                  
                  if (aVal < bVal) return ascending ? -1 : 1;
                  if (aVal > bVal) return ascending ? 1 : -1;
                  return 0;
                });
              }
              
              const response = { data, error: null };
              return onResolve ? onResolve(response) : response;
            } catch (error: any) {
              const response = { data: null, error };
              return onReject ? onReject(response) : response;
            }
          },
        }),
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
          
          return { data: null, error: new Error(`Unknown function: ${functionName}`) };
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

