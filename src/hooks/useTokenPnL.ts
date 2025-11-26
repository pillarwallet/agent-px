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
    refetch: () => {},
    debug: {
      mobulaTxCount: 0,
      relayRequestCount: 0,
      relayResponseCount: 0,
      status: 'Idle',
    },
  });

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetch = useCallback(() => {
    setResult((prev) => ({ ...prev, isLoading: true }));
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // Update refetch function in result
    setResult((prev) => ({ ...prev, refetch }));
  }, [refetch]);

  useEffect(() => {
    // Early return if no props
    if (!props) {
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
      return;
    }

    const { token, transactionsData, walletAddress, chainId } = props;
    let isMounted = true;

    const calculatePnL = async () => {
      // Skip if no data
      if (!transactionsData?.data?.transactions || !walletAddress) {
        if (isMounted)
          setResult((prev) => ({
            ...prev,
            debug: { ...prev.debug, status: 'No Data' },
          }));
        return;
      }

      // Skip small balances
      const valueUSD = (token.balance || 0) * (token.price || 0);

      if (valueUSD < 0.5) {
        if (isMounted)
          setResult((prev) => ({
            ...prev,
            debug: { ...prev.debug, status: 'Small Balance' },
          }));
        return;
      }

      if (isMounted)
        setResult((prev) => ({
          ...prev,
          isLoading: true,
          debug: { ...prev.debug, status: 'Starting' },
        }));

      try {
        // Find relevant transaction hashes for this token
        const relevantHashes: string[] = [];
        const tokenContract = token.contract.toLowerCase();

        transactionsData.data.transactions.forEach((tx) => {
          const txContract =
            (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;

          if (txContract && txContract.toLowerCase() === tokenContract) {
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
              const req = await fetchRelayRequestByHash(hash);
              return req;
            } catch (e) {
              console.error(`Failed to fetch Relay for ${hash}:`, e);
              return null;
            }
          })
        );

        if (!isMounted) return undefined;

        relayRequests.push(...relayResults.filter((req) => req !== null));

        if (!isMounted) return undefined;

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
          address: token.contract,
          symbol: token.symbol,
          decimals: token.decimals,
          chainId,
          price: token.price,
        });

        if (trades.length === 0) {
          if (isMounted)
            setResult((prev) => ({
              ...prev,
              isLoading: false,
              debug: { ...prev.debug, status: 'No Trades Reconstructed' },
            }));
        } else {
          const metrics = computePnLMetrics(trades, token.price || 0);
          if (isMounted)
            setResult((prev) => ({
              ...prev,
              pnl: metrics,
              isLoading: false,
              debug: { ...prev.debug, status: 'Success' },
            }));
        }
      } catch (error) {
        console.error(`Error calculating PnL for ${token.symbol}:`, error);
        if (isMounted)
          setResult((prev) => ({
            ...prev,
            isLoading: false,
            debug: { ...prev.debug, status: 'Error' },
          }));
        return undefined;
      }
    };

    calculatePnL();

    return () => {
      isMounted = false;
      return undefined;
    };
  }, [props, refreshTrigger]);

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
