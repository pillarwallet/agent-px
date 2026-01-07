
import { placeLimitOrderAgent } from './lib/hyperliquid/sdk';
import { getAllAssets } from './lib/hyperliquid/client';
import { privateKeyToAccount } from 'viem/accounts';

const PRIVATE_KEY = '0xfa77cd3562696b4369822d916f1ddab6a06559a9315d16f3e0b11617a07225aa';

async function run() {
    try {
        const account = privateKeyToAccount(PRIVATE_KEY);
        console.log('Derived Address:', account.address);
        console.log('Fetching assets...');
        const assets = await getAllAssets();
        const btcAsset = assets.find(a => a.symbol === 'BTC');

        if (!btcAsset) {
            throw new Error('BTC asset not found');
        }

        // User scenario inputs
        const userInputs = {
            symbol: 'BTC',
            leverage: 40,
            marginUSD: 25,
            entryPrice: 93177.5, // User's target price
            slPrice: 92214.54,
            tpPrice: 94077.46,
            tpRatio: 100
        };

        console.log('Validating User Scenario:', userInputs);

        // 1. Calculate Size
        // Logic from order.ts: totalNotional = marginUSD * leverage
        // size = totalNotional / entryPrice
        const totalNotional = userInputs.marginUSD * userInputs.leverage;
        const rawSize = totalNotional / userInputs.entryPrice;

        // BTC decimals usually 5
        const szDecimals = btcAsset.szDecimals;
        const step = Math.pow(10, -szDecimals);
        // Properly round to avoid floating point artifacts
        const size = parseFloat((Math.floor(rawSize / step) * step).toFixed(szDecimals));

        console.log(`Calculated Size: ${size} (Total Notional: $${totalNotional})`);

        // 2. Execute Orders (Safe Mode: Entry Price -10% to avoid fill)
        // We use the calculated size, but place the order deep in the book.
        const safePrice = parseFloat(Number(userInputs.entryPrice * 0.9).toPrecision(5));
        console.log(`Placing SAFE Limit Buy at $${safePrice} (Original Target: ${userInputs.entryPrice})...`);

        const entryResult = await placeLimitOrderAgent(PRIVATE_KEY, {
            coinId: btcAsset.id,
            isBuy: true,
            size: size,
            limitPrice: safePrice,
            reduceOnly: false
        });

        console.log('Entry Order Result:', JSON.stringify(entryResult, null, 2));

        // 3. Place SL (Reduce Only)
        // SL is Sell (since Long)
        console.log(`Placing Stop Loss at $${userInputs.slPrice}...`);
        const slResult = await placeLimitOrderAgent(PRIVATE_KEY, {
            coinId: btcAsset.id,
            isBuy: false, // Sell to close long
            size: size,
            limitPrice: parseFloat(Number(userInputs.slPrice).toPrecision(5)),
            reduceOnly: true
        });
        console.log('Stop Loss Order Result:', JSON.stringify(slResult, null, 2));

        // 4. Place TP (Reduce Only)
        // TP is Sell (since Long)
        console.log(`Placing Take Profit at $${userInputs.tpPrice}...`);
        const tpResult = await placeLimitOrderAgent(PRIVATE_KEY, {
            coinId: btcAsset.id,
            isBuy: false, // Sell to close long
            size: size,
            limitPrice: parseFloat(Number(userInputs.tpPrice).toPrecision(5)),
            reduceOnly: true
        });
        console.log('Take Profit Order Result:', JSON.stringify(tpResult, null, 2));

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

run();
