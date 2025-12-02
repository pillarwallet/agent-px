// Async helper functions for relayApi
// Separated to avoid circular dependency with store.ts
import { store } from '../store';
import { relayApi, RelayRequest } from './relayApi';

// Export async functions for use in non-React contexts
// These use the store dispatch to execute queries programmatically
// Error handling matches the original axios implementation - returns fallback values instead of throwing
export const fetchRelayRequests = async (
  userAddress: string,
  status: string = 'filled'
): Promise<RelayRequest[]> => {
  try {
    const result = await store.dispatch(
      relayApi.endpoints.getRelayRequests.initiate({
        user: userAddress,
        status,
      })
    );
    // RTK Query returns data even on error, but we check for error status
    if (result.error) {
      console.error('Failed to fetch Relay requests:', result.error);
      return [];
    }
    return result.data || [];
  } catch (error) {
    console.error('Failed to fetch Relay requests:', error);
    return [];
  }
};

export const fetchRelayRequestByHash = async (
  txHash: string
): Promise<RelayRequest | null> => {
  try {
    const result = await store.dispatch(
      relayApi.endpoints.getRelayRequestByHash.initiate(txHash)
    );
    // RTK Query returns result with error property on failure
    // 404 means transaction not found in Relay, which is expected - return null
    if ('error' in result && result.error) {
      const error = result.error as { status?: number };
      if (error.status === 404) {
        // 404 is expected - transaction not in Relay
        return null;
      }
      console.error(
        `Failed to fetch Relay request for hash ${txHash}:`,
        result.error
      );
      return null;
    }
    // Success case - return data or null
    return result.data ?? null;
  } catch (error) {
    // Extra safety catch - should not happen with RTK Query but keeping for compatibility
    console.error(`Failed to fetch Relay request for hash ${txHash}:`, error);
    return null;
  }
};

export const fetchRelayRequestsByUser = async (
  userAddress: string
): Promise<RelayRequest[]> => {
  try {
    const result = await store.dispatch(
      relayApi.endpoints.getRelayRequestsByUser.initiate(userAddress)
    );
    // RTK Query returns data even on error, but we check for error status
    if (result.error) {
      console.error('Error fetching Relay requests by user:', result.error);
      return [];
    }
    return result.data || [];
  } catch (error) {
    console.error('Error fetching Relay requests by user:', error);
    return [];
  }
};
