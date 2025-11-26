import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

// utils
import { getNativeAssetForChainId } from '../../../utils/blockchain';
import { getEIP7702AuthorizationIfNeeded } from '../../../utils/eip7702Authorization';

// hooks
import useTransactionKit from '../../../hooks/useTransactionKit';
import useTopUp, { TopUpParams } from './useTopUp';

interface UseGasEstimationTopUpProps extends TopUpParams {
  isPaused?: boolean;
}

export default function useGasEstimationTopUp({
  selectedToken,
  amount,
  allocateAmount,
  sellOffer,
  userPortfolio,
  isPaused = false,
}: UseGasEstimationTopUpProps) {
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const [gasEstimationError, setGasEstimationError] = useState<string | null>(
    null
  );
  const [gasCostNative, setGasCostNative] = useState<string | null>(null);
  const [nativeTokenSymbol, setNativeTokenSymbol] = useState<string>('');

  const isEstimatingRef = useRef(false);
  const estimateGasFeesRef = useRef<() => Promise<void>>();

  const { kit } = useTransactionKit();
  const { buildTopUpTransactionsForEstimation, isInitialized } = useTopUp();

  const estimateGasFees = useCallback(async () => {
    if (!selectedToken || !kit || !amount) {
      return;
    }

    // Wait for Relay SDK to be initialized
    if (!isInitialized) {
      return;
    }

    // Prevent multiple simultaneous estimations
    if (isEstimatingRef.current || isPaused) {
      return;
    }

    isEstimatingRef.current = true;
    setIsEstimatingGas(true);
    setGasEstimationError(null);

    try {
      // Build the transactions without executing them
      const transactions = await buildTopUpTransactionsForEstimation({
        selectedToken,
        amount,
        allocateAmount,
        sellOffer,
        userPortfolio,
      });

      if (transactions.length === 0) {
        setGasCostNative('0');
        setNativeTokenSymbol('');
        return;
      }

      // Clean up any existing batch first
      const batchName = `pulse-topup-batch-${selectedToken.chainId}`;
      try {
        kit.batch({ batchName }).remove();
      } catch (cleanupErr) {
        // Batch may not exist, which is fine
      }

      // Add each transaction to the batch
      for (let i = 0; i < transactions.length; i += 1) {
        const tx = transactions[i];
        const transactionName = `pulse-topup-${selectedToken.chainId}-${tx.data.slice(0, 10)}-${i}`;

        kit
          .transaction({
            chainId: tx.chainId,
            to: tx.to,
            value: tx.value,
            data: tx.data,
          })
          .name({ transactionName })
          .addToBatch({ batchName });
      }

      const authorization = await getEIP7702AuthorizationIfNeeded(
        kit,
        selectedToken.chainId
      );
      const estimation = await kit.estimateBatches({
        onlyBatchNames: [batchName],
        authorization: authorization || undefined,
      });

      const batchEst = estimation.batches[batchName];
      if (
        estimation.isEstimatedSuccessfully &&
        batchEst &&
        !batchEst.errorMessage
      ) {
        // Use the totalCost from the batch estimation (more accurate)
        const totalCostBN = batchEst.totalCost;
        if (totalCostBN) {
          // Get the native asset for the chain
          const nativeAsset = getNativeAssetForChainId(selectedToken.chainId);

          // Convert from wei to native token units using the correct decimals
          const estimatedCostInNativeToken = formatUnits(
            totalCostBN,
            nativeAsset.decimals
          );

          // Store the native token amount and symbol
          setGasCostNative(estimatedCostInNativeToken);
          setNativeTokenSymbol(nativeAsset.symbol);
        } else {
          setGasCostNative('0');
          setNativeTokenSymbol('');
        }
      } else {
        setGasCostNative('0');
        setNativeTokenSymbol('');
      }

      // Clean up the batch after estimation
      try {
        kit.batch({ batchName }).remove();
      } catch (cleanupErr) {
        // Batch may not exist, which is fine
      }
    } catch (err) {
      console.error('Failed to estimate gas fees for top-up:', err);
      setGasEstimationError('Failed to estimate gas fees');
      setGasCostNative(null);
    } finally {
      isEstimatingRef.current = false;
      setIsEstimatingGas(false);
    }
  }, [
    selectedToken,
    kit,
    amount,
    allocateAmount,
    sellOffer,
    buildTopUpTransactionsForEstimation,
    isPaused,
    isInitialized,
    userPortfolio,
  ]);

  // Store the latest function in ref to avoid infinite loops
  estimateGasFeesRef.current = estimateGasFees;

  // Estimate gas fees when dependencies change
  useEffect(() => {
    const isReadyForEstimation =
      selectedToken &&
      kit &&
      amount &&
      estimateGasFeesRef.current &&
      !isPaused &&
      isInitialized;

    if (isReadyForEstimation && estimateGasFeesRef.current) {
      estimateGasFeesRef.current();
    }
  }, [
    selectedToken,
    kit,
    amount,
    allocateAmount,
    sellOffer,
    isPaused,
    isInitialized,
  ]);

  return {
    isEstimatingGas,
    gasEstimationError,
    gasCostNative,
    nativeTokenSymbol,
    estimateGasFees,
  };
}
