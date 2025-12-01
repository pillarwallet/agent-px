import { describe, expect, it } from 'vitest';
import { MobulaTransactionRow } from '../../types/api';
import { calculatePnL, reconstructTrades } from '../pnl';

describe('PnL Logic', () => {
  const walletAddress = '0x123';
  const tokenAddress = '0xToken';
  const usdcAddress = '0xUSDC';

  const buyTxHash = '0xBuyTx';
  const sellTxHash = '0xSellTx';

  // Mock Data based on User Example
  // BUY: User receives 48.197243 ETHDYDX, sends 14.381553 USDC
  const buyRows: MobulaTransactionRow[] = [
    {
      timestamp: 1000,
      asset: {
        name: 'USDC',
        symbol: 'USDC',
        id: 1,
        contracts: [usdcAddress],
        contract: usdcAddress,
        logo: '',
        decimals: 6,
      },
      type: 'transfer',
      amount: 14.381553,
      amount_usd: 14.38,
      token_price: 1,
      from: walletAddress, // Outbound
      to: '0xPool',
      tx_hash: buyTxHash,
      hash: buyTxHash,
      method_label: 'Transfer',
      blockchain: 'Ethereum',
    },
    {
      timestamp: 1000,
      asset: {
        name: 'ETHDYDX',
        symbol: 'ETHDYDX',
        id: 2,
        contracts: [tokenAddress],
        contract: tokenAddress,
        logo: '',
        decimals: 18,
      },
      type: 'transfer',
      amount: 48.197243,
      amount_usd: 14.38,
      token_price: 0.2984,
      from: '0xPool',
      to: walletAddress, // Inbound
      tx_hash: buyTxHash,
      hash: buyTxHash,
      method_label: 'Transfer',
      blockchain: 'Ethereum',
    },
    // Gas row (ignored for amounts but present)
    {
      timestamp: 1000,
      asset: {
        name: 'Ethereum',
        symbol: 'ETH',
        id: 3,
        contracts: [],
        contract: '',
        logo: '',
        decimals: 18,
      },
      type: 'native',
      amount: 0.001,
      amount_usd: 2.0,
      token_price: 2000,
      from: walletAddress,
      to: '0xMiner',
      tx_hash: buyTxHash,
      hash: buyTxHash,
      method_label: 'Transfer',
      blockchain: 'Ethereum',
    },
  ];

  // SELL: User sends 12.049311 ETHDYDX, receives 0.473808 USDC
  const sellRows: MobulaTransactionRow[] = [
    {
      timestamp: 2000,
      asset: {
        name: 'ETHDYDX',
        symbol: 'ETHDYDX',
        id: 2,
        contracts: [tokenAddress],
        contract: tokenAddress,
        logo: '',
        decimals: 18,
      },
      type: 'transfer',
      amount: 12.049311,
      amount_usd: 0.47,
      token_price: 0.0393,
      from: walletAddress, // Outbound
      to: '0xPool',
      tx_hash: sellTxHash,
      hash: sellTxHash,
      method_label: 'Transfer',
      blockchain: 'Ethereum',
    },
    {
      timestamp: 2000,
      asset: {
        name: 'USDC',
        symbol: 'USDC',
        id: 1,
        contracts: [usdcAddress],
        contract: usdcAddress,
        logo: '',
        decimals: 6,
      },
      type: 'transfer',
      amount: 0.473808,
      amount_usd: 0.47,
      token_price: 1,
      from: '0xPool',
      to: walletAddress, // Inbound
      tx_hash: sellTxHash,
      hash: sellTxHash,
      method_label: 'Transfer',
      blockchain: 'Ethereum',
    },
  ];

  it('should reconstruct trades correctly', () => {
    const transactions = [...buyRows, ...sellRows];
    const trades = reconstructTrades(transactions, walletAddress);

    expect(trades).toHaveLength(2);

    const buyTrade = trades[0];
    expect(buyTrade.side).toBe('BUY');
    expect(buyTrade.amountToken).toBeCloseTo(48.197243);
    expect(buyTrade.amountQuoteUSDC).toBeCloseTo(14.381553);
    expect(buyTrade.tokenSymbol).toBe('ETHDYDX');

    const sellTrade = trades[1];
    expect(sellTrade.side).toBe('SELL');
    expect(sellTrade.amountToken).toBeCloseTo(12.049311);
    expect(sellTrade.amountQuoteUSDC).toBeCloseTo(0.473808);
  });

  it('should calculate PnL correctly', () => {
    const transactions = [...buyRows, ...sellRows];
    const trades = reconstructTrades(transactions, walletAddress);

    // Current Price for Unrealised PnL
    // Remaining tokens = 48.197243 - 12.049311 = 36.147932
    // WAC = 14.381553 / 48.197243 = 0.2983895...
    // Cost Basis Sold = 12.049311 * WAC = 3.595...
    // Realised PnL = 0.473808 - 3.595... = -3.12...

    // Let's check exact numbers from user example if provided, or calculate.
    // User said: "Remaining = 36.147932"
    // "Remaining cost basis = WAC * remaining tokens"

    const currentPrice = 0.1; // Hypothetical current price
    const metrics = calculatePnL(trades, currentPrice);

    // Verify Realised PnL
    const totalTokensBought = 48.197243;
    const totalCostUSDC = 14.381553;
    const wac = totalCostUSDC / totalTokensBought;

    const tokensSold = 12.049311;
    const costBasisSold = tokensSold * wac;
    const proceeds = 0.473808;
    const expectedRealisedPnL = proceeds - costBasisSold;

    expect(metrics!.realisedPnLUSDC).toBeCloseTo(expectedRealisedPnL);
    expect(metrics!.totalSoldUSDC).toBeCloseTo(proceeds);

    // Verify Unrealised PnL
    const remainingTokens = totalTokensBought - tokensSold;
    const remainingCostBasis = remainingTokens * wac;
    const currentValue = remainingTokens * currentPrice;
    const expectedUnrealisedPnL = currentValue - remainingCostBasis;

    expect(metrics!.unrealisedPnLUSDC).toBeCloseTo(expectedUnrealisedPnL);
    expect(metrics!.balanceToken).toBeCloseTo(remainingTokens);

    // Verify Avg Buy Price (Historical)
    // "Average Buy Price = totalHistoricalBuyUSDC / totalHistoricalBuyTokens"
    // Here only 1 buy, so it should match WAC
    expect(metrics!.avgBuyPrice).toBeCloseTo(wac);
  });

  it('should return null when there are only SELL transactions (no BUY history)', () => {
    const transactions = [...sellRows];
    const trades = reconstructTrades(transactions, walletAddress);

    // Should have 1 SELL trade
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('SELL');

    const currentPrice = 0.1;
    const metrics = calculatePnL(trades, currentPrice);

    // Should return null because we can't calculate cost basis without BUYs
    expect(metrics).toBeNull();
  });
});
