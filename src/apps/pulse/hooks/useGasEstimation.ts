import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

// utils
import { getNativeAssetForChainId } from '../../../utils/blockchain';
import { getEIP7702AuthorizationIfNeeded } from '../../../utils/eip7702Authorization';

// hooks
import useTransactionKit from '../../../hooks/useTransactionKit';
import useRelaySell, { SellOffer } from './useRelaySell';

// types
import { SelectedToken } from '../types/tokens';
import { Token } from '../../../services/tokensData';

interface UseGasEstimationProps {
  sellToken: SelectedToken | null;
  sellOffer: SellOffer | null;
  tokenAmount: string;
  toChainId: number;
  isPaused?: boolean;
  userPortfolio?: Token[];
}

export default function useGasEstimation({
  sellToken,
  sellOffer,
  tokenAmount,
  toChainId,
  isPaused = false,
  userPortfolio,
}: UseGasEstimationProps) {
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const [gasEstimationError, setGasEstimationError] = useState<string | null>(
    null
  );
  const [gasCostNative, setGasCostNative] = useState<string | null>(null);
  const [nativeTokenSymbol, setNativeTokenSymbol] = useState<string>('');
  const [gasCostUSD, setGasCostUSD] = useState<string | null>(null);

  const isEstimatingRef = useRef(false);
  const estimateGasFeesRef = useRef<() => Promise<void>>();

  const { kit } = useTransactionKit();
  const {
    buildSellTransactions,
    buildSellTransactionWithBridge,
    isInitialized,
  } = useRelaySell();

  const estimateGasFees = useCallback(async () => {
    if (!sellToken || !kit || !sellOffer || !tokenAmount) {
      return;
    }

    // For cross-chain sells, wait for Relay SDK to be initialized
    if (sellToken.chainId !== toChainId && !isInitialized) {
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
      let transactions = [];
      if (sellToken.chainId === toChainId) {
        // Build the transactions without executing them
        transactions = await buildSellTransactions(
          sellOffer,
          sellToken,
          tokenAmount,
          userPortfolio
        );
      } else {
        const { transactions: bridgeTransactions } =
          await buildSellTransactionWithBridge(
            tokenAmount,
            sellToken,
            toChainId,
            userPortfolio
          );
        transactions = bridgeTransactions;
      }

      if (transactions.length === 0) {
        setGasCostNative('0');
        setNativeTokenSymbol('');
        return;
      }

      // Clean up any existing batch first
      const batchName = `pulse-sell-batch-${sellToken.chainId}`;
      try {
        kit.batch({ batchName }).remove();
      } catch (cleanupErr) {
        // Batch may not exist, which is fine
      }

      // Add each transaction to the batch
      for (let i = 0; i < transactions.length; i += 1) {
        const tx = transactions[i];
        const transactionName = `pulse-sell-${sellToken.chainId}-${tx.data.slice(0, 10)}-${i}`;

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
        sellToken.chainId
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
          const nativeAsset = getNativeAssetForChainId(sellToken.chainId);

          // Convert from wei to native token units using the correct decimals
          const estimatedCostInNativeToken = formatUnits(
            totalCostBN,
            nativeAsset.decimals
          );

          // Store the native token amount and symbol
          setGasCostNative(estimatedCostInNativeToken);
          setNativeTokenSymbol(nativeAsset.symbol);

          // Fetch native price USD from REST API to calculate USD cost
          try {
            const nativePriceUrl = `${
              import.meta.env.VITE_PAYMASTER_URL
            }/getNativePriceUSD?chainId=${sellToken.chainId}`;
            const nativePriceResponse = await fetch(nativePriceUrl);
            const nativePriceData = await nativePriceResponse.json();

            if (nativePriceData?.priceUSD) {
              const totalCostInUSD =
                parseFloat(estimatedCostInNativeToken) *
                nativePriceData.priceUSD;
              setGasCostUSD(totalCostInUSD.toString());
            }
          } catch (fetchErr) {
            console.error(
              'Failed to fetch native price USD for gas estimation:',
              fetchErr
            );
          }
        } else {
          setGasCostNative('0');
          setNativeTokenSymbol('');
          setGasCostUSD(null);
        }
      } else {
        setGasCostNative('0');
        setNativeTokenSymbol('');
        setGasCostUSD(null);
      }

      // Clean up the batch after estimation
      try {
        kit.batch({ batchName }).remove();
      } catch (cleanupErr) {
        // Batch may not exist, which is fine
      }
    } catch (err) {
      console.error('Failed to estimate gas fees:', err);
      setGasEstimationError('Failed to estimate gas fees');
      setGasCostNative(null);
    } finally {
      isEstimatingRef.current = false;
      setIsEstimatingGas(false);
    }
  }, [
    sellToken,
    kit,
    sellOffer,
    tokenAmount,
    buildSellTransactions,
    buildSellTransactionWithBridge,
    isPaused,
    toChainId,
    isInitialized,
    userPortfolio,
  ]);

  // Store the latest function in ref to avoid infinite loops
  estimateGasFeesRef.current = estimateGasFees;

  // Estimate gas fees when dependencies change
  useEffect(() => {
    // For cross-chain, also wait for isInitialized
    const isReadyForEstimation =
      sellOffer &&
      sellToken &&
      kit &&
      tokenAmount &&
      estimateGasFeesRef.current &&
      !isPaused &&
      (sellToken.chainId === toChainId || isInitialized);

    if (isReadyForEstimation && estimateGasFeesRef.current) {
      estimateGasFeesRef.current();
    }
  }, [
    sellOffer,
    sellToken,
    kit,
    tokenAmount,
    isPaused,
    isInitialized,
    toChainId,
  ]);

  return {
    isEstimatingGas,
    gasEstimationError,
    gasCostNative,
    nativeTokenSymbol,
    gasCostUSD,
    estimateGasFees,
  };
}
