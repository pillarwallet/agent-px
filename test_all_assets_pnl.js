// Complete test matching the app's logic
const fetch = require('node-fetch');

const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_URL = 'https://api.relay.link';

const USDC_ADDRESSES = [
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0x3c499c54b84a76ad7e9c93437bfc5ac33e2ddae9',
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
];

function calculatePnL(trades, currentPrice) {
    let totalTokens = 0;
    let totalCostUSDC = 0;

    trades.forEach(trade => {
        if (trade.side === 'BUY') {
            totalTokens += trade.amountToken;
            totalCostUSDC += trade.amountQuoteUSDC;
        } else {
            const wac = totalTokens > 0 ? totalCostUSDC / totalTokens : 0;
            const costBasis = trade.amountToken * wac;
            totalTokens -= trade.amountToken;
            totalCostUSDC -= costBasis;
        }
    });

    if (totalTokens < 0) totalTokens = 0;
    if (totalCostUSDC < 0) totalCostUSDC = 0;

    const currentValueUSDC = totalTokens * currentPrice;
    const unrealisedPnLUSDC = currentValueUSDC - totalCostUSDC;
    const unrealisedPnLPct = totalCostUSDC > 0 ? (unrealisedPnLUSDC / totalCostUSDC) * 100 : 0;

    return { unrealisedPnLUSDC, unrealisedPnLPct, totalTokens, totalCostUSDC };
}

async function getRelayValidatedTrades(allTxs, token) {
    const trades = [];

    // Filter transactions for this token
    const tokenTxs = allTxs.filter(tx => {
        const txContract = (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;
        return tx.asset.symbol === token.symbol &&
            txContract?.toLowerCase() === token.contract.toLowerCase();
    });

    // Group by hash
    const groupedByHash = {};
    tokenTxs.forEach(tx => {
        if (!groupedByHash[tx.hash]) groupedByHash[tx.hash] = [];
        groupedByHash[tx.hash].push(tx);
    });

    const txHashes = Object.keys(groupedByHash);

    for (const txHash of txHashes) {
        // Query Relay
        try {
            const relayResp = await fetch(`${RELAY_URL}/requests/v2?hash=${txHash}`);
            if (!relayResp.ok) continue;

            const relayData = await relayResp.json();
            const relayReq = relayData.requests?.[0];
            if (!relayReq) continue;

            // Check for USDC in stateChanges
            let hasUSDC = false;
            if (relayReq.data?.inTxs) {
                for (const inTx of relayReq.data.inTxs) {
                    if (inTx.stateChanges) {
                        for (const sc of inTx.stateChanges) {
                            const addr = sc.change?.data?.tokenAddress?.toLowerCase();
                            if (addr && USDC_ADDRESSES.some(u => u.toLowerCase() === addr)) {
                                hasUSDC = true;
                                break;
                            }
                        }
                    }
                    if (hasUSDC) break;
                }
            }

            if (!hasUSDC) continue;

            // Analyze token movement
            const group = groupedByHash[txHash];
            let tokenChange = 0;

            group.forEach(tx => {
                const isInbound = tx.to.toLowerCase() === WALLET.toLowerCase();
                const isOutbound = tx.from.toLowerCase() === WALLET.toLowerCase();
                if (!isInbound && !isOutbound) return;

                if (isInbound) tokenChange += tx.amount;
                if (isOutbound) tokenChange -= tx.amount;
            });

            if (tokenChange === 0) continue;

            const side = tokenChange > 0 ? 'BUY' : 'SELL';
            const usdcAmount = Math.abs(tokenChange) * (group[0].token_price || 0);

            trades.push({
                side,
                txHash,
                amountToken: Math.abs(tokenChange),
                amountQuoteUSDC: usdcAmount,
            });
        } catch (e) {
            // Skip on error
        }
    }

    return trades;
}

async function testAllAssets() {
    console.log('\n🔍 Testing PnL for all portfolio assets\n');

    // 1. Get portfolio
    const portfolioResp = await fetch(`${API_URL}?testnets=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/portfolio',
            params: { wallet: WALLET },
        }),
    });
    const portfolioData = await portfolioResp.json();
    const assets = portfolioData?.result?.data?.assets || [];

    // Filter > $0.50
    const significantAssets = assets.filter(a => {
        const usdValue = (a.price || 0) * (a.token_balance || 0);
        return usdValue >= 0.50;
    });

    console.log(`Portfolio: ${assets.length} assets, ${significantAssets.length} > $0.50\n`);

    // 2. Get transactions
    const txResp = await fetch(`${API_URL}?testnets=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: { wallet: WALLET, limit: 500, page: 1, filterSpam: true },
        }),
    });
    const txData = await txResp.json();
    const allTxs = txData?.result?.data?.transactions || [];

    console.log(`Transactions: ${allTxs.length}\n`);
    console.log('━'.repeat(80));

    // 3. Process each asset
    const results = [];

    for (const asset of significantAssets) {
        const symbol = asset.asset.symbol;
        const contract = asset.asset.contracts[0] || asset.asset.contract;
        const price = asset.price;
        const balance = asset.token_balance;
        const usdValue = price * balance;

        process.stdout.write(`\nProcessing ${symbol.padEnd(10)} ($${usdValue.toFixed(2).padStart(8)})... `);

        const validatedTrades = await getRelayValidatedTrades(allTxs, {
            symbol,
            contract,
        });

        if (validatedTrades.length > 0) {
            const pnl = calculatePnL(validatedTrades, price);
            console.log(`✅ ${validatedTrades.length} trades | PnL: $${pnl.unrealisedPnLUSDC.toFixed(2)} (${pnl.unrealisedPnLPct.toFixed(2)}%)`);
            results.push({ symbol, usdValue, trades: validatedTrades.length, pnl });
        } else {
            console.log('❌ No validated trades');
        }
    }

    console.log('\n' + '━'.repeat(80));
    console.log('\n📊 SUMMARY\n');
    console.log(`Assets with PnL: ${results.length} / ${significantAssets.length}\n`);

    if (results.length > 0) {
        console.log('Asset      | USD Value | Trades | Unrealized PnL      | %');
        console.log('-'.repeat(70));
        results.forEach(r => {
            const pnlStr = `$${r.pnl.unrealisedPnLUSDC >= 0 ? '+' : ''}${r.pnl.unrealisedPnLUSDC.toFixed(2)}`;
            const pctStr = `${r.pnl.unrealisedPnLPct >= 0 ? '+' : ''}${r.pnl.unrealisedPnLPct.toFixed(2)}%`;
            console.log(
                `${r.symbol.padEnd(10)} | $${r.usdValue.toFixed(2).padStart(8)} | ${String(r.trades).padStart(6)} | ${pnlStr.padStart(18)} | ${pctStr}`
            );
        });
    }
}

testAllAssets().catch(console.error);
