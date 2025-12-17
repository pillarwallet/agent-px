import { describe, expect, it } from 'vitest';
import { reconstructTrades } from '../pnl';
import { MobulaTransactionRow } from '../../types/api';

describe('reconstructTrades Fallback Logic', () => {
    it('should use token price fallback when USDC leg is missing', () => {
        const walletAddress = '0xUser';
        // Mock a transaction where user sells 1 BNB but USDC receipt is missing
        const transactions: MobulaTransactionRow[] = [
            {
                tx_hash: '0x123',
                timestamp: 1672531200000,
                type: 'token',
                from: '0xUser',        // Outbound (Sell)
                to: '0xPool',
                asset: {
                    symbol: 'BNB',
                    name: 'Binance Coin',
                    contract: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
                    price: 300 // Price $300
                },
                amount: 1, // 1 BNB
                amount_usd: 300,
                token_price: 300 // Price property that reconstructTrades checks
            } as any
        ];

        const trades = reconstructTrades(transactions, walletAddress);

        expect(trades).toHaveLength(1);
        const trade = trades[0];

        expect(trade.side).toBe('SELL');
        expect(trade.amountToken).toBe(1);
        // Should fallback to 1 * 300 = 300
        expect(trade.amountQuoteUSDC).toBe(300);
        expect(trade.execPriceUSD).toBe(300);
    });
});
