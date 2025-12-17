import { describe, expect, it } from 'vitest';
import { calculatePnLFromRelay } from '../pnl';
import { RelayRequest } from '../../services/relayApi';

// WBNB Address on BSC
const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const STABLE_ADDRESS = '0xe02D8d0ADf04E960Dc95d6c0c3ed7F21C1Ba082d';

const mockRelayRequest: RelayRequest = {
    id: '0x123',
    status: 'filled',
    user: '0xUser',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    in: { chainId: 56, currency: 'BNB', amount: '1', amountUsd: '300.00' },
    out: { chainId: 56, currency: 'STA', amount: '100', amountUsd: '300.00' },
    data: {
        inTxs: [],
        outTxs: [{
            timestamp: 1672531200000,
            stateChanges: [
                {
                    change: {
                        data: { tokenAddress: WBNB_ADDRESS },
                        balanceDiff: '-1000000000000000000' // -1 BNB
                    },
                    address: '0xUser'
                },
                {
                    change: {
                        data: { tokenAddress: STABLE_ADDRESS },
                        balanceDiff: '100000000000000000000' // +100 STABLE
                    },
                    address: '0xUser'
                }
            ]
        }]
    },
    metadata: {
        currencyIn: { // Sold WBNB
            currency: { address: WBNB_ADDRESS, symbol: 'WBNB', decimals: 18 },
            amountUsd: '300.00'
        },
        currencyOut: { // Bought STABLE
            currency: { address: STABLE_ADDRESS, symbol: 'STA', decimals: 18 },
            amountUsd: '300.00'
        }
    }
};

describe('PnL BNB Issue Reproduction', () => {

    it('should correctly use WBNB metadata value for cost basis when state changes miss USDC', () => {
        const trades = calculatePnLFromRelay([mockRelayRequest], {
            address: STABLE_ADDRESS,
            symbol: 'STA',
            decimals: 18,
            chainId: 56,
            price: 10.0 // Current Price ($10). 
            // If logic falls back to current price, Cost Basis = 100 * 10 = $1000.
            // If logic works correctly using metadata, Cost Basis = $300.
        });

        expect(trades).toHaveLength(1);
        const trade = trades[0];

        expect(trade.side).toBe('BUY');
        expect(trade.amountToken).toBe(100);

        // This assertion should FAIL if the bug exists.
        // Bug outcome: It uses current price fallback -> 1000.
        expect(trade.amountQuoteUSDC).toBe(300);
    });
});
