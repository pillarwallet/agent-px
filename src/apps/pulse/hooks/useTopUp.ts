import { useCallback, useState } from 'react';

// hooks
import useTransactionKit from '../../../hooks/useTransactionKit';
import useRelaySell, { SellOffer } from './useRelaySell';
import { useTransactionDebugLogger } from '../../../hooks/useTransactionDebugLogger';

// utils
import { getEIP7702AuthorizationIfNeeded } from '../../../utils/eip7702Authorization';

// types
import { SelectedToken } from '../types/tokens';
import { Token } from '../../../services/tokensData';

interface Transactions {
  action: string;
  calldata: string;
  target: string;
}

interface FeeAsset {
  decimals: number;
  balance: number;
  tokenPrice?: string;
  asset: {
    symbol: string;
    contract: string;
    name: string;
    decimals: number;
    balance: number;
    price?: number;
  };
  paymasterAddress?: string;
  [key: string]: unknown;
}

export interface TopUpParams {
  selectedToken: SelectedToken;
  amount: string; // USD amount
  allocateAmount: number; // USDC amount to deposit to gas tank
  sellOffer: SellOffer | null; // Only needed for non-USDC tokens
  userPortfolio?: Token[];
  additionalTransactions?: Transactions[];
  // Gasless transaction support
  isGaslessSupported?: boolean;
  selectedFeeAsset?: FeeAsset | null;
  approveData?: string;
  paymasterAddress?: string;
}

export default function useTopUp() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { kit, walletAddress } = useTransactionKit();
  const { buildSellTransactions, isInitialized: isRelayInitialized } =
    useRelaySell();
  const { transactionDebugLog } = useTransactionDebugLogger();

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Build all transactions needed for top-up:
   * 1. For non-USDC tokens: Sell token -> USDC
   * 2. Deposit USDC to gas tank using paymaster API
   */
  const buildTopUpTransactions = useCallback(
    async (params: TopUpParams) => {
      const { selectedToken, allocateAmount, sellOffer, userPortfolio } =
        params;

      if (!walletAddress) {
        throw new Error('Wallet address not available, Please relogin.');
      }

      const transactions = [];
      const { chainId } = selectedToken;

      // Step 1: If non-USDC token, add sell transactions
      if (sellOffer) {
        const tokenPrice = parseFloat(selectedToken.usdValue) || 0;
        if (tokenPrice <= 0) {
          throw new Error('Invalid token price, Please try again later.');
        }
        const actualTokenAmount = (
          parseFloat(params.amount) / tokenPrice
        ).toString();

        const sellTransactions = await buildSellTransactions(
          sellOffer,
          selectedToken,
          actualTokenAmount,
          userPortfolio
        );

        transactions.push(...sellTransactions);
      }

      // Step 2: Deposit USDC to gas tank using paymaster API
      const paymasterUrl = import.meta.env.VITE_PAYMASTER_URL;
      if (!paymasterUrl) {
        throw new Error(
          'Paymaster URL not configured. please try again later.'
        );
      }

      const response = await fetch(
        `${paymasterUrl}/getTransactionForDeposit?chainId=${chainId}&amount=${allocateAmount}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          'Error fetching gas tank deposit transaction:',
          errorText
        );
        throw new Error(
          'Failed to fetch gas tank deposit transaction. Please try again.'
        );
      }

      const transactionData = await response.json();

      // Add deposit transactions from paymaster API
      if (Array.isArray(transactionData.result)) {
        // Multiple transactions returned
        transactionData.result.forEach(
          (tx: { value?: string; to: string; data?: string }) => {
            transactions.push({
              chainId,
              to: tx.to,
              value: tx.value || '0',
              data: tx.data || '0x',
            });
          }
        );
      } else if (transactionData.result) {
        // Single transaction returned
        transactions.push({
          chainId,
          to: transactionData.result.to,
          value: transactionData.result.value || '0',
          data: transactionData.result.data || '0x',
        });
      } else {
        throw new Error(
          'Invalid response from paymaster API. please try again later.'
        );
      }

      // Verify all transactions are on the same chain
      const allSameChain = transactions.every((tx) => tx.chainId === chainId);
      if (!allSameChain) {
        throw new Error(
          'Cross-chain transactions detected. All top-up transactions must be on the same chain. please refresh and try again.'
        );
      }

      return transactions;
    },
    [walletAddress, buildSellTransactions]
  );

  /**
   * Execute the complete top-up flow:
   * Build and execute all transactions (swap + deposit)
   * Note: EIP-7702 upgrade and module installation should be handled before calling this
   */
  const executeTopUp = useCallback(
    async (
      params: TopUpParams
    ): Promise<{ userOperationHash: string } | null> => {
      if (!kit) {
        setError('Transaction kit not available. please relogin.');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const {
          selectedToken,
          additionalTransactions,
          isGaslessSupported,
          selectedFeeAsset,
          approveData,
          paymasterAddress,
        } = params;
        const { chainId } = selectedToken;

        // Build all transactions
        const transactions = await buildTopUpTransactions(params);

        if (
          transactions.length === 0 &&
          (!additionalTransactions || additionalTransactions.length === 0) &&
          !approveData
        ) {
          setIsLoading(false);
          setError('No transactions to execute. Please try again.');
          return null;
        }

        // Step 4: Create batch and add all transactions
        const batchName = `pulse-topup-batch-${chainId}`;

        // Clean up any existing batch first
        try {
          kit.batch({ batchName }).remove();
        } catch (cleanupErr) {
          // Batch may not exist, which is fine
        }

        // Add approval transaction FIRST if using gasless
        if (
          isGaslessSupported &&
          approveData &&
          selectedFeeAsset &&
          paymasterAddress
        ) {
          transactionDebugLog(
            'Adding approval transaction for gasless fee token',
            {
              to: selectedFeeAsset.asset.contract,
              paymasterAddress,
            }
          );
          kit
            .transaction({
              to: selectedFeeAsset.asset.contract,
              data: approveData,
              chainId,
            })
            .name({ transactionName: 'approve-paymaster-fee' })
            .addToBatch({ batchName });
        }

        // Add additional transactions (module installation, etc.)
        if (additionalTransactions) {
          transactionDebugLog(
            'Adding additional transactions to batch:',
            additionalTransactions
          );
          additionalTransactions.forEach((tx) => {
            transactionDebugLog(`Adding additional transaction: ${tx.action}`, {
              target: tx.target,
              calldata: tx.calldata,
              chainId,
            });
            kit
              .transaction({
                to: tx.target,
                data: tx.calldata,
                chainId,
              })
              .name({ transactionName: tx.action })
              .addToBatch({ batchName });
          });
        }

        // Add each transaction to the batch
        transactionDebugLog(
          `Adding ${transactions.length} top-up transactions to batch:`,
          transactions
        );
        transactions.forEach((tx, i) => {
          const transactionName = `pulse-topup-${chainId}-${tx.data.slice(0, 10)}-${i}`;
          transactionDebugLog(
            `Adding top-up transaction ${i + 1}/${transactions.length}`,
            {
              transactionName,
              to: tx.to,
              value: tx.value,
              data: tx.data.slice(0, 66),
              chainId: tx.chainId,
            }
          );

          kit
            .transaction({
              chainId: tx.chainId,
              to: tx.to,
              value: tx.value,
              data: tx.data,
            })
            .name({ transactionName })
            .addToBatch({ batchName });
        });

        // Step 5: Execute the batch
        const authorization = await getEIP7702AuthorizationIfNeeded(
          kit,
          chainId
        );

        // Prepare paymaster details if using gasless
        const paymasterUrl = import.meta.env.VITE_PAYMASTER_URL;
        const safePaymasterUrl = paymasterUrl?.endsWith('/')
          ? paymasterUrl.slice(0, -1)
          : paymasterUrl;

        const paymasterDetails =
          isGaslessSupported &&
          paymasterAddress &&
          safePaymasterUrl &&
          selectedFeeAsset
            ? {
                url: `${safePaymasterUrl}?chainId=${chainId}`,
                context: {
                  mode: 'commonerc20',
                  token: selectedFeeAsset.asset.contract,
                },
              }
            : undefined;

        const batchSend = await kit.sendBatches({
          onlyBatchNames: [batchName],
          authorization: authorization || undefined,
          paymasterDetails,
        });

        const sentBatch = batchSend.batches[batchName];

        if (batchSend.isSentSuccessfully && !sentBatch?.errorMessage) {
          const userOpHash = sentBatch?.chainGroups?.[chainId]?.userOpHash;

          if (userOpHash) {
            // Clean up the batch after successful execution
            try {
              kit.batch({ batchName }).remove();
            } catch (cleanupErr) {
              // Ignore cleanup errors
            }

            setIsLoading(false);
            return { userOperationHash: userOpHash };
          }

          throw new Error('No userOpHash returned after batch send');
        }

        throw new Error(sentBatch?.errorMessage || 'Batch send failed');
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to execute top-up';
        console.error(errorMessage);
        // Clean up the batch on error
        const { selectedToken } = params;
        const batchName = `pulse-topup-batch-${selectedToken.chainId}`;
        try {
          kit.batch({ batchName }).remove();
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }

        setError('Something went wrong. Please try again later');
        setIsLoading(false);
        return null;
      }
    },
    [kit, buildTopUpTransactions, transactionDebugLog]
  );

  /**
   * Build transactions for gas estimation only
   */
  const buildTopUpTransactionsForEstimation = useCallback(
    async (params: TopUpParams) => {
      return buildTopUpTransactions(params);
    },
    [buildTopUpTransactions]
  );

  return {
    executeTopUp,
    buildTopUpTransactionsForEstimation,
    isLoading,
    error,
    clearError,
    isInitialized: isRelayInitialized,
  };
}
