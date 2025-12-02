// services
import { RelayRequest } from '../services/relayApi';
import { fetchRelayRequestByHash } from '../services/relayApiAsync';

// types
import {
  MobulaTransactionRow,
  PnLMetrics,
  ReconstructedTrade,
} from '../types/api';

// constants
import { allStableCurrencies } from '../apps/pulse/constants/tokens';

// Extract USDC addresses from allStableCurrencies
const USDC_ADDRESSES = allStableCurrencies.map(
  (currency: { chainId: number; address: string }) =>
    currency.address.toLowerCase()
);

export const reconstructTrades = (
  transactions: MobulaTransactionRow[],
  walletAddress: string
): ReconstructedTrade[] => {
  const trades: ReconstructedTrade[] = [];
  const groupedByTxHash: { [txHash: string]: MobulaTransactionRow[] } = {};

  // Group by txHash
  transactions.forEach((tx) => {
    if (!groupedByTxHash[tx.tx_hash]) {
      groupedByTxHash[tx.tx_hash] = [];
    }
    groupedByTxHash[tx.tx_hash].push(tx);
  });

  // Process each group
  Object.keys(groupedByTxHash).forEach((txHash) => {
    const group = groupedByTxHash[txHash];
    let usdcChange = 0;
    let tokenChange = 0;
    let tokenSymbol = '';
    let tokenAddress = '';
    const feeUsd = 0;
    let timestamp = 0;

    // Identify assets and calculate net changes
    group.forEach((tx) => {
      timestamp = tx.timestamp; // Assume all rows have same timestamp or close enough
      const isInbound = tx.to.toLowerCase() === walletAddress.toLowerCase();
      const isOutbound = tx.from.toLowerCase() === walletAddress.toLowerCase();

      if (!isInbound && !isOutbound) return; // Not related to wallet directly? (Maybe fee payer?)

      const { amount } = tx;
      const { symbol } = tx.asset;

      if (tx.type === 'native') {
        // Gas fee usually
        return;
      }

      // Check if this is a USDC transaction by matching address
      const txContract =
        (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;
      const isUSDC =
        txContract && USDC_ADDRESSES.includes(txContract.toLowerCase());

      if (isUSDC) {
        if (isInbound) usdcChange += amount;
        if (isOutbound) usdcChange -= amount;
      } else if (tokenSymbol && tokenSymbol !== symbol) {
        // Base Token
        // If we already found a DIFFERENT base token in this tx, it's a multi-token trade (unsupported).
        // Mark as invalid/ignored
        tokenSymbol = 'INVALID';
      } else {
        tokenSymbol = symbol;
        tokenAddress = tx.asset.contracts?.[0] || '';
        if (isInbound) tokenChange += amount;
        if (isOutbound) tokenChange -= amount;
      }
    });

    if (tokenSymbol === 'INVALID' || !tokenSymbol) return; // Ignore multi-token or no-token txs
    if (usdcChange === 0) return; // No USDC leg, unsupported for this PnL logic

    // Determine direction
    // BUY: Token IN (+), USDC OUT (-)
    // SELL: Token OUT (-), USDC IN (+)

    let side: 'BUY' | 'SELL' | null = null;
    if (tokenChange > 0 && usdcChange < 0) side = 'BUY';
    else if (tokenChange < 0 && usdcChange > 0) side = 'SELL';

    if (!side) return; // Unsupported direction (e.g. both in or both out)

    const absTokenChange = Math.abs(tokenChange);
    const absUsdcChange = Math.abs(usdcChange);

    if (absTokenChange === 0) return; // Dust or zero value

    trades.push({
      side,
      txHash,
      timestamp,
      amountToken: absTokenChange,
      amountQuoteUSDC: absUsdcChange,
      execPriceUSD: absUsdcChange / absTokenChange,
      feesUSD: feeUsd, // Not implemented fully yet as per complexity
      tokenAddress: tokenAddress || '',
      tokenSymbol,
    });
  });

  return trades.sort((a, b) => a.timestamp - b.timestamp);
};

export const calculatePnL = (
  trades: ReconstructedTrade[],
  currentPrice: number
): PnLMetrics | null => {
  let totalTokens = 0;
  let totalCostUSDC = 0;
  let realisedPnLUSDC = 0;
  let totalCostBasisSold = 0;

  trades.forEach((trade) => {
    if (trade.side === 'BUY') {
      totalTokens += trade.amountToken;
      totalCostUSDC += trade.amountQuoteUSDC;
    } else {
      // SELL
      if (totalTokens === 0) return; // Selling without inventory (shouldn't happen in perfect history)

      const wac = totalCostUSDC / totalTokens;
      const costBasis = trade.amountToken * wac;

      totalTokens -= trade.amountToken;
      totalCostUSDC -= costBasis;

      totalCostBasisSold += costBasis;
      realisedPnLUSDC += trade.amountQuoteUSDC - costBasis;
    }
  });

  // Prevent negative dust
  if (totalTokens < 0) totalTokens = 0;
  if (totalCostUSDC < 0) totalCostUSDC = 0;

  const realisedPnLPct =
    totalCostBasisSold > 0 ? (realisedPnLUSDC / totalCostBasisSold) * 100 : 0;

  const currentValueUSDC = totalTokens * currentPrice;
  const unrealisedPnLUSDC = currentValueUSDC - totalCostUSDC;
  const unrealisedPnLPct =
    totalCostUSDC > 0 ? (unrealisedPnLUSDC / totalCostUSDC) * 100 : 0;

  let totalHistoricalBuyTokens = 0;
  let totalHistoricalBuyUSDC = 0;
  let totalHistoricalSellTokens = 0;
  let totalHistoricalSellUSDC = 0;

  trades.forEach((t) => {
    if (t.side === 'BUY') {
      totalHistoricalBuyTokens += t.amountToken;
      totalHistoricalBuyUSDC += t.amountQuoteUSDC;
    } else {
      totalHistoricalSellTokens += t.amountToken;
      totalHistoricalSellUSDC += t.amountQuoteUSDC;
    }
  });

  const avgBuyPriceHistorical =
    totalHistoricalBuyTokens > 0
      ? totalHistoricalBuyUSDC / totalHistoricalBuyTokens
      : 0;
  const avgSellPriceHistorical =
    totalHistoricalSellTokens > 0
      ? totalHistoricalSellUSDC / totalHistoricalSellTokens
      : 0;

  // If there are no BUY transactions, we cannot calculate a cost basis
  // Return null to indicate no valid PnL data (prevents showing +$0)
  if (totalHistoricalBuyTokens === 0) {
    return null;
  }

  return {
    realisedPnLUSDC,
    realisedPnLPct,
    unrealisedPnLUSDC,
    unrealisedPnLPct,
    avgBuyPrice: avgBuyPriceHistorical, // Using historical as requested
    avgSellPrice: avgSellPriceHistorical,
    totalBoughtUSDC: totalHistoricalBuyUSDC,
    totalSoldUSDC: totalHistoricalSellUSDC,
    balanceToken: totalTokens,
    balanceUSDC: currentValueUSDC, // Or just token balance? "Balance (tokens)" in UI.
  };
};

/**
 * Validates Mobula transactions against Relay by querying each transaction hash.
 * Only creates trades for transactions that exist in Relay and involve USDC.
 * This ensures we only show PnL for assets traded through our platform.
 */
export const getRelayValidatedTrades = async (
  mobulaTransactions: MobulaTransactionRow[],
  token: {
    address: string;
    contracts?: string[];
    symbol: string;
    decimals: number;
    chainId: number;
  },
  relayRequestsMap?: Map<string, RelayRequest | null>
): Promise<ReconstructedTrade[]> => {
  // Filter transactions for this token first to reduce processing
  const tokenTransactions = mobulaTransactions.filter((tx) => {
    const txContract =
      (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;

    // Check if transaction contract matches token address or any of its contracts
    const matchesAddress =
      txContract?.toLowerCase() === token.address.toLowerCase();
    const matchesContracts = token.contracts?.some(
      (c) => c.toLowerCase() === txContract?.toLowerCase()
    );

    return (
      tx.asset.symbol === token.symbol && (matchesAddress || matchesContracts)
    );
  });

  // Group by hash
  const groupedByTxHash: { [txHash: string]: MobulaTransactionRow[] } = {};
  tokenTransactions.forEach((tx) => {
    if (!groupedByTxHash[tx.tx_hash]) {
      groupedByTxHash[tx.tx_hash] = [];
    }
    groupedByTxHash[tx.tx_hash].push(tx);
  });

  const txHashes = Object.keys(groupedByTxHash);

  // Fetch all relay requests in parallel
  const relayRequestPromises = txHashes.map(async (txHash) => {
    if (relayRequestsMap && relayRequestsMap.has(txHash)) {
      return { txHash, relayReq: relayRequestsMap.get(txHash) };
    }
    const relayReq = await fetchRelayRequestByHash(txHash);
    return { txHash, relayReq };
  });

  const relayResults = await Promise.all(relayRequestPromises);

  // Process each transaction
  const trades = relayResults
    .filter(({ relayReq }) => relayReq) // Skip transactions not in Relay
    .map(({ txHash, relayReq }) => {
      if (!relayReq) return null;

      // Check if USDC is involved in the Relay transaction (via stateChanges)

      let hasUSDCInRelay = false;
      let usdcAmount = 0;
      const userAddress = relayReq.user?.toLowerCase();

      // Determine side from token movement in Mobula
      const group = groupedByTxHash[txHash];
      let tokenChange = 0;
      let hasToken = false;
      group.forEach((tx) => {
        const { symbol } = tx.asset;
        const { amount } = tx;
        const isInbound = tx.to.toLowerCase() === userAddress;
        const isOutbound = tx.from.toLowerCase() === userAddress;

        // Check for target token
        const txContract =
          (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;

        const matchesAddress =
          txContract?.toLowerCase() === token.address.toLowerCase();
        const matchesContracts = token.contracts?.some(
          (c) => c.toLowerCase() === txContract?.toLowerCase()
        );

        if (symbol === token.symbol && (matchesAddress || matchesContracts)) {
          hasToken = true;
          if (isInbound) tokenChange += amount;
          if (isOutbound) tokenChange -= amount;
        }
      });

      // Only create trade if token is involved
      if (!hasToken) return null;

      let side: 'BUY' | 'SELL' | null = null;
      if (tokenChange > 0) side = 'BUY';
      else if (tokenChange < 0) side = 'SELL';

      if (!side) return null;

      const absTokenChange = Math.abs(tokenChange);

      if (absTokenChange === 0) return null;

      // For USDC amount, extract it from Relay stateChanges
      usdcAmount = 0;
      if (relayReq.data?.inTxs) {
        relayReq.data.inTxs.forEach((inTx) => {
          if (inTx.stateChanges) {
            inTx.stateChanges.forEach((stateChange) => {
              const tokenAddr =
                stateChange.change?.data?.tokenAddress?.toLowerCase();
              const changeAddress = stateChange.address?.toLowerCase();

              // Check if this is a USDC state change for the user
              if (
                tokenAddr &&
                USDC_ADDRESSES.some((addr: string) => addr === tokenAddr) &&
                changeAddress === userAddress
              ) {
                hasUSDCInRelay = true;

                // Extract amount from balanceDiff
                const balanceDiffStr =
                  (stateChange.change as { balanceDiff?: string })
                    ?.balanceDiff || '0';
                const balanceDiff = parseFloat(balanceDiffStr);

                // For BUY, we expect negative USDC (spending)
                // For SELL, we expect positive USDC (receiving)
                if (side === 'BUY' && balanceDiff < 0) {
                  usdcAmount += Math.abs(balanceDiff) / 1e6; // USDC has 6 decimals
                } else if (side === 'SELL' && balanceDiff > 0) {
                  usdcAmount += balanceDiff / 1e6;
                }
              }
            });
          }
        });
      }

      if (!hasUSDCInRelay) {
        return null; // Skip if USDC is not involved in Relay
      }

      const timestamp = group[0]?.timestamp || 0;

      // Fallback: use token price if we couldn't extract USDC amount (e.g. complex swap)
      if (usdcAmount === 0) {
        usdcAmount = absTokenChange * (group[0]?.token_price || 0);
      }

      return {
        side,
        txHash,
        timestamp: timestamp / 1000, // Convert to seconds
        amountToken: absTokenChange,
        amountQuoteUSDC: usdcAmount,
        execPriceUSD: usdcAmount / absTokenChange,
        feesUSD: 0,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
      };
    })
    .filter((trade) => trade !== null) as ReconstructedTrade[];

  return trades.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Calculates PnL metrics directly from Relay requests, bypassing Mobula transactions.
 * Uses Relay as the source of truth for trade execution details.
 */
export const calculatePnLFromRelay = (
  relayRequests: RelayRequest[],
  token: {
    address: string; // Contract address
    symbol: string;
    decimals: number;
    chainId: number;
    price?: number; // Added for fallback
  }
): ReconstructedTrade[] => {
  const tokenContract = token.address.toLowerCase();

  // Known USDC addresses for matching quote currency

  const trades = relayRequests
    .map((req) => {
      let amountToken = 0;
      let amountUSDC = 0;
      let side: 'BUY' | 'SELL' | null = null;
      let timestamp = new Date(req.createdAt).getTime() / 1000;

      // Check both req.metadata and req.data.metadata (different API versions)
      const metadata = req.metadata || req.data?.metadata;

      // Strategy 1: Use Metadata (Preferred)
      if (metadata && metadata.currencyIn && metadata.currencyOut) {
        const { currencyIn, currencyOut } = metadata;
        const inAddress = currencyIn.currency?.address?.toLowerCase();
        const outAddress = currencyOut.currency?.address?.toLowerCase();

        const isBuy = outAddress === tokenContract;
        const isSell = inAddress === tokenContract;

        if (isBuy) {
          side = 'BUY';
          amountToken = parseFloat(currencyOut.amountFormatted || '0');
          if (
            inAddress &&
            (USDC_ADDRESSES.includes(inAddress) ||
              currencyIn.currency?.symbol === 'USDC')
          ) {
            amountUSDC = parseFloat(currencyIn.amountFormatted || '0');
          } else {
            amountUSDC = parseFloat(currencyIn.amountUsd || '0');
          }
        } else if (isSell) {
          side = 'SELL';
          amountToken = parseFloat(currencyIn.amountFormatted || '0');
          if (
            outAddress &&
            (USDC_ADDRESSES.includes(outAddress) ||
              currencyOut.currency?.symbol === 'USDC')
          ) {
            amountUSDC = parseFloat(currencyOut.amountFormatted || '0');
          } else {
            amountUSDC = parseFloat(currencyOut.amountUsd || '0');
          }
        }
      }
      // Strategy 2: Use State Changes (Fallback)
      else if (req.data?.inTxs || req.data?.outTxs) {
        const userAddress = req.user?.toLowerCase();
        const allTxs = [
          ...(req.data?.inTxs || []),
          ...(req.data?.outTxs || []),
        ];

        const { tokenChange, usdcChange, latestTimestamp } = allTxs.reduce(
          (acc, tx) => {
            if (tx.timestamp) acc.latestTimestamp = tx.timestamp;
            if (tx.stateChanges) {
              tx.stateChanges.forEach((sc) => {
                if (sc.address?.toLowerCase() === userAddress) {
                  const tokenAddr =
                    sc.change?.data?.tokenAddress?.toLowerCase();
                  const balanceDiff = parseFloat(sc.change?.balanceDiff || '0');

                  if (tokenAddr === tokenContract) {
                    acc.tokenChange += balanceDiff;
                  } else if (tokenAddr && USDC_ADDRESSES.includes(tokenAddr)) {
                    acc.usdcChange += balanceDiff;
                  }
                }
              });
            }
            return acc;
          },
          { tokenChange: 0, usdcChange: 0, latestTimestamp: timestamp }
        );

        timestamp = latestTimestamp;

        if (tokenChange !== 0) {
          const tokenDivisor = 10 ** token.decimals;
          const usdcDivisor = 1e6;

          const tokenAmountRaw = Math.abs(tokenChange) / tokenDivisor;
          const usdcAmountRaw = Math.abs(usdcChange) / usdcDivisor;

          if (tokenChange > 0) {
            side = 'BUY';
            amountToken = tokenAmountRaw;
            amountUSDC = usdcAmountRaw;
          } else {
            side = 'SELL';
            amountToken = tokenAmountRaw;
            amountUSDC = usdcAmountRaw;
          }
        }
      } else {
        // No metadata and no state changes - log warning
        console.warn(
          `[calculatePnLFromRelay] No metadata or state changes for request ${req.id}`
        );
      }

      if (!side || amountToken === 0) return null;

      // Fallback: use token price if we couldn't extract USDC amount
      if (amountUSDC === 0 && token.price) {
        amountUSDC = amountToken * token.price;
      }

      if (amountUSDC === 0) return null;

      // Validate USDC amount and execution price - reject absurdly large values
      const execPrice = amountUSDC / amountToken;

      // Sanity check: USDC amount shouldn't exceed $1 trillion
      if (amountUSDC > 1e12) {
        console.warn(
          `[calculatePnLFromRelay] Suspiciously large USDC amount for ${token.symbol}: $${amountUSDC.toLocaleString()}. Skipping trade ${req.id}`
        );
        return null;
      }

      // Sanity check: Execution price shouldn't exceed $1 million per token
      if (execPrice > 1e6) {
        console.warn(
          `[calculatePnLFromRelay] Suspiciously high execution price for ${token.symbol}: $${execPrice.toLocaleString()}/token. Skipping trade ${req.id}`
        );
        return null;
      }

      // Sanity check: Execution price shouldn't be negative or zero
      if (execPrice <= 0) {
        console.warn(
          `[calculatePnLFromRelay] Invalid execution price for ${token.symbol}: $${execPrice}. Skipping trade ${req.id}`
        );
        return null;
      }

      return {
        side,
        txHash: req.id,
        timestamp,
        amountToken,
        amountQuoteUSDC: amountUSDC,
        execPriceUSD: execPrice,
        feesUSD: 0,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
      };
    })
    .filter((trade) => trade !== null) as ReconstructedTrade[];

  return trades.sort((a, b) => a.timestamp - b.timestamp);
};
