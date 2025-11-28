import { useState, useEffect, useCallback } from 'react';
import { fetchRelayRequestByHash, RelayRequest } from '../services/relayApi';
import {
  calculatePnLFromRelay,
  calculatePnL as computePnLMetrics,
} from '../utils/pnl';
import { Token } from '../services/tokensData';
import { PnLMetrics, WalletTransactionsMobulaResponse } from '../types/api';

interface UseTokenPnLProps {
  token: Token;
  transactionsData: WalletTransactionsMobulaResponse | undefined;
  walletAddress: string | undefined;
  chainId: number;
}

export interface TokenPnLResult {
  pnl: PnLMetrics | null;
  isLoading: boolean;
  refetch: () => void;
  debug: {
    mobulaTxCount: number;
    relayRequestCount: number;
    relayResponseCount: number;
    status: string;
  };
}

export const useTokenPnL = (props: UseTokenPnLProps | null): TokenPnLResult => {
  const [result, setResult] = useState<TokenPnLResult>({
    pnl: null,
    isLoading: false,
    refetch: () => { },
    debug: {
      mobulaTxCount: 0,
      relayRequestCount: 0,
      relayResponseCount: 0,
      status: 'Idle',
    },
  });

  // eslint-disable-next-line no-console
  console.log('[useTokenPnL] Hook render', {
    tokenSymbol: props?.token?.symbol,
    isLoading: result.isLoading,
    pnl: result.pnl,
  });

  const token = props?.token;
  const tokenContract = props?.token?.contract;
  const tokenSymbol = props?.token?.symbol;
  const tokenDecimals = props?.token?.decimals;
  const tokenBalance = props?.token?.balance;
  const tokenPrice = props?.token?.price;
  const transactionsData = props?.transactionsData;
  const transactions = props?.transactionsData?.data?.transactions;
  const walletAddress = props?.walletAddress;
  const chainId = props?.chainId;

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetch = useCallback(() => {
    setResult((prev) => ({ ...prev, isLoading: true }));
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // Update refetch function in result
    setResult((prev) => ({ ...prev, refetch }));
  }, [refetch]);

  // Reset state when token changes
  useEffect(() => {
    if (tokenSymbol) {
      setResult((prev) => ({
        ...prev,
        pnl: null,
        isLoading: true,
        debug: { ...prev.debug, status: 'Resetting' },
      }));
    }
  }, [tokenSymbol]);

  useEffect(() => {
    // Early return if no token or wallet address
    if (!token || !walletAddress) {
      setResult((prev) => ({
        ...prev,
        pnl: null,
        isLoading: false,
        debug: {
          mobulaTxCount: 0,
          relayRequestCount: 0,
          relayResponseCount: 0,
          status: 'No Token',
        },
      }));
      return undefined;
    }

    let isMounted = true;

    const calculatePnL = async (): Promise<void> => {
      // eslint-disable-next-line no-console
      console.log('[useTokenPnL] calculatePnL start', {
        hasTransactions: !!transactions,
        walletAddress: !!walletAddress,
      });

      // Skip if no data
      if (!transactions || !walletAddress) {
        if (isMounted)
          setResult((prev) => ({
            ...prev,
            isLoading: false,
            debug: { ...prev.debug, status: 'No Data' },
          }));
        return;
      }

      if (isMounted)
        setResult((prev) => ({
          ...prev,
          isLoading: true,
          debug: { ...prev.debug, status: 'Starting' },
        }));

      // Starting PnL calculation

      try {
        // Find relevant transaction hashes for this token
        const relevantHashes: string[] = [];
        const contractAddress = tokenContract?.toLowerCase() || '';

        transactions.forEach((tx) => {
          const txContract =
            (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;

          if (txContract && txContract.toLowerCase() === contractAddress) {
            relevantHashes.push(tx.hash);
          }
        });

        if (isMounted)
          setResult((prev) => ({
            ...prev,
            debug: { ...prev.debug, mobulaTxCount: relevantHashes.length },
          }));

        if (relevantHashes.length === 0) {
          if (isMounted)
            setResult((prev) => ({
              ...prev,
              isLoading: false,
              debug: { ...prev.debug, status: 'No Mobula Txs' },
            }));
          return;
        }

        // Fetch Relay data for these hashes (limit to first 20 to avoid too many requests)
        const relayRequests: RelayRequest[] = [];
        const hashesToFetch = relevantHashes.slice(0, 20);

        if (isMounted)
          setResult((prev) => ({
            ...prev,
            debug: {
              ...prev.debug,
              relayRequestCount: hashesToFetch.length,
              status: 'Fetching Relay',
            },
          }));

        const relayResults = await Promise.all(
          hashesToFetch.map(async (hash) => {
            try {
              const relayRequest = await fetchRelayRequestByHash(hash);
              return relayRequest;
            } catch (e) {
              console.error(`Failed to fetch Relay for ${hash}:`, e);
              return null;
            }
          })
        );

        if (!isMounted) return;

        relayRequests.push(...relayResults.filter((req) => req !== null));

        if (!isMounted) return;

        if (isMounted)
          setResult((prev) => ({
            ...prev,
            debug: { ...prev.debug, relayResponseCount: relayRequests.length },
          }));

        if (relayRequests.length === 0) {
          if (isMounted)
            setResult((prev) => ({
              ...prev,
              isLoading: false,
              debug: { ...prev.debug, status: 'No Relay Data' },
            }));
          return;
        }

        // Calculate PnL from Relay data
        const trades = calculatePnLFromRelay(relayRequests, {
          address: tokenContract || '',
          symbol: tokenSymbol || '',
          decimals: tokenDecimals || 18,
          chainId: chainId!,
          price: tokenPrice,
        });

        if (trades.length === 0) {
          if (isMounted)
            setResult((prev) => ({
              ...prev,
              isLoading: false,
              debug: { ...prev.debug, status: 'No Trades Reconstructed' },
            }));
        } else {
          const pnlMetrics = computePnLMetrics(trades, tokenPrice || 0);

          if (isMounted) {
            // PnL calculation complete
            setResult((prev) => ({
              ...prev,
              pnl: pnlMetrics,
              isLoading: false,
              debug: { ...prev.debug, status: 'Complete' },
            }));
          }
          // eslint-disable-next-line no-console
          console.log('[useTokenPnL] Calculation complete', pnlMetrics);
        }
      } catch (error) {
        console.error(`Error calculating PnL for ${tokenSymbol}:`, error);
        if (isMounted)
          setResult((prev) => ({
            ...prev,
            isLoading: false,
            debug: { ...prev.debug, status: 'Error' },
          }));
      }
    };

    calculatePnL();

    return () => {
      isMounted = false;
    };
  }, [
    // Use specific dependencies to avoid infinite loops from unstable props object
    tokenContract,
    tokenSymbol,
    tokenDecimals,
    tokenBalance,
    tokenPrice,
    transactions,
    walletAddress,
    chainId,
    refreshTrigger,
    // Note: 'token' object is intentionally omitted to prevent re-renders
  ]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!props) return undefined;

    const interval = setInterval(() => {
      setResult((prev) => ({ ...prev, isLoading: true }));
      setRefreshTrigger((prev) => prev + 1);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [props]);

  return result;
};
