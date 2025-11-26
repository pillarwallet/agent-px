// Optimized test - query Relay once per unique hash
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

async function testAllAssetsOptimized() {
    console.log('\n🔍 Testing PnL for all portfolio assets (OPTIMIZED)\n');

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

    const significantAssets = assets.filter(a => {
        const usdValue = (a.price || 0) * (a.token_balance || 0);
        return usdValue >= 0.50;
    });

    console.log(`Portfolio: ${assets.length} assets, ${significantAssets.length} > $0.50\n`);

    // 2. Get ALL transactions
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

    // 3. Get ALL unique transaction hashes
    const uniqueHashes = [...new Set(allTxs.map(tx => tx.hash))];
    console.log(`Unique transaction hashes: ${uniqueHashes.length}\n`);

    // 4. Query Relay for ALL hashes ONCE and cache results
    console.log('Querying Relay for all transaction hashes...\n');
    const relayCache = new Map();

    let processed = 0;
    for (const hash of uniqueHashes) {
        try {
            const relayResp = await fetch(`${RELAY_URL}/requests/v2?hash=${hash}`);
            if (relayResp.ok) {
                const relayData = await relayResp.json();
                const relayReq = relayData.requests?.[0];
                if (relayReq) {
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

                    if (hasUSDC) {
                        relayCache.set(hash, relayReq);
                    }
                }
            }
        } catch (e) { }

        processed++;
        if (processed % 50 === 0) {
            console.log(`  Processed ${processed}/${uniqueHashes.length} hashes...`);
        }
    }

    console.log(`\n✅ Relay cache built: ${relayCache.size} transactions with USDC\n`);
    console.log('━'.repeat(80));

    // 5. Process each asset using cached Relay data
    const results = [];

    for (const asset of significantAssets) {
        const symbol = asset.asset.symbol;
        const contract = (asset.asset.contracts && asset.asset.contracts[0]) || asset.asset.contract;
        const price = asset.price;
        const balance = asset.token_balance;
        const usdValue = price * balance;

        // Filter transactions for this token
        const tokenTxs = allTxs.filter(tx => {
            const txContract = (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;
            return tx.asset.symbol === symbol &&
                txContract?.toLowerCase() === contract?.toLowerCase();
        });

        // Build trades from cached Relay data
        const trades = [];
        const groupedByHash = {};
        tokenTxs.forEach(tx => {
            if (!groupedByHash[tx.hash]) groupedByHash[tx.hash] = [];
            groupedByHash[tx.hash].push(tx);
        });

        for (const hash of Object.keys(groupedByHash)) {
            if (!relayCache.has(hash)) continue; // Skip if not in Relay with USDC

            const group = groupedByHash[hash];
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
                txHash: hash,
                amountToken: Math.abs(tokenChange),
                amountQuoteUSDC: usdcAmount,
            });
        }

        if (trades.length > 0) {
            const pnl = calculatePnL(trades, price);
            console.log(`\n${symbol.padEnd(10)} ($${usdValue.toFixed(2).padStart(8)}) | ${trades.length} trades | PnL: $${pnl.unrealisedPnLUSDC.toFixed(2)} (${pnl.unrealisedPnLPct.toFixed(2)}%)`);
            results.push({ symbol, usdValue, trades: trades.length, pnl });
        }
    }

    console.log('\n' + '━'.repeat(80));
    console.log('\n📊 FINAL RESULTS\n');
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
    } else {
        console.log('⚠ No assets found with Relay-validated PnL');
    }
}

testAllAssetsOptimized().catch(console.error);
