// @ts-ignore
const fetch = require('node-fetch');

const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_URL = 'https://api.relay.link';

// Simple PnL calculation
function calculatePnL(trades, currentPrice) {
    let totalTokens = 0;
    let totalCostUSDC = 0;
    let realisedPnLUSDC = 0;

    trades.forEach(trade => {
        if (trade.side === 'BUY') {
            totalTokens += trade.amountToken;
            totalCostUSDC += trade.amountQuoteUSDC;
        } else {
            const wac = totalTokens > 0 ? totalCostUSDC / totalTokens : 0;
            const costBasis = trade.amountToken * wac;
            totalTokens -= trade.amountToken;
            totalCostUSDC -= costBasis;
            realisedPnLUSDC += trade.amountQuoteUSDC - costBasis;
        }
    });

    const currentValueUSDC = totalTokens * currentPrice;
    const unrealisedPnLUSDC = currentValueUSDC - totalCostUSDC;
    const unrealisedPnLPct = totalCostUSDC > 0 ? (unrealisedPnLUSDC / totalCostUSDC) * 100 : 0;

    return { unrealisedPnLUSDC, unrealisedPnLPct, totalTokens, totalCostUSDC };
}

async function testPnLCalculation() {
    console.log(`\n🔍 Testing PnL Calculation for: ${WALLET}\n`);

    // 1. Fetch Mobula transactions
    const mobResp = await fetch(`${API_URL}?testnets=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: { wallet: WALLET, limit: 500, page: 1, filterSpam: true },
        }),
    });
    const mobData = await mobResp.json();
    const txs = mobData?.result?.data?.transactions || [];
    console.log(`✓ Fetched ${txs.length} Mobula transactions\n`);

    // 2. Group by token
    const tokenTxs = new Map();
    txs.forEach(tx => {
        const symbol = tx.asset?.symbol;
        if (!symbol || !tx.asset.contracts || tx.asset.contracts.length === 0) return;
        if (!tokenTxs.has(symbol)) {
            tokenTxs.set(symbol, { txs: [], hashes: new Set(), contract: tx.asset.contracts[0], price: tx.token_price });
        }
        tokenTxs.get(symbol).txs.push(tx);
        tokenTxs.get(symbol).hashes.add(tx.tx_hash);
    });

    console.log(`✓ Found ${tokenTxs.size} unique tokens\n`);
    console.log(`📊 Validating transactions with Relay...\n`);

    // 3. For each token, validate with Relay
    const results = [];

    for (const [symbol, data] of tokenTxs.entries()) {
        const uniqueHashes = Array.from(data.hashes);
        let relayValidatedCount = 0;
        const validatedTrades = [];

        for (const hash of uniqueHashes) {
            try {
                const relayResp = await fetch(`${RELAY_URL}/requests/v2?hash=${hash}`);
                if (relayResp.ok) {
                    relayValidatedCount++;

                    // Analyze this transaction group for USDC + token
                    const txGroup = data.txs.filter(t => t.tx_hash === hash);
                    let usdcChange = 0;
                    let tokenChange = 0;
                    let hasUSDC = false;
                    let hasToken = false;

                    txGroup.forEach(tx => {
                        if (tx.asset.symbol === 'USDC') {
                            hasUSDC = true;
                            // Simplified: assume inbound = positive, outbound = negative
                            usdcChange += tx.amount * (tx.to.toLowerCase() === WALLET.toLowerCase() ? 1 : -1);
                        } else if (tx.asset.symbol === symbol) {
                            hasToken = true;
                            tokenChange += tx.amount * (tx.to.toLowerCase() === WALLET.toLowerCase() ? 1 : -1);
                        }
                    });

                    if (hasUSDC && hasToken) {
                        const side = tokenChange > 0 ? 'BUY' : 'SELL';
                        validatedTrades.push({
                            side,
                            amountToken: Math.abs(tokenChange),
                            amountQuoteUSDC: Math.abs(usdcChange),
                            timestamp: txGroup[0].timestamp,
                        });
                    }
                }
            } catch (e) {
                // 404 or error = not in Relay
            }
        }

        if (validatedTrades.length > 0) {
            const pnl = calculatePnL(validatedTrades, data.price || 0);
            results.push({
                symbol,
                totalTxs: uniqueHashes.length,
                relayValidated: relayValidatedCount,
                trades: validatedTrades.length,
                pnl,
            });
        }
    }

    console.log(`\n📈 ASSETS WITH RELAY-VALIDATED PNL:\n`);

    if (results.length === 0) {
        console.log('⚠ No assets found with Relay-validated transactions\n');
    } else {
        results.forEach(r => {
            console.log(`  ${r.symbol}:`);
            console.log(`    - Total unique tx hashes: ${r.totalTxs}`);
            console.log(`    - Relay-validated: ${r.relayValidated}`);
            console.log(`    - Valid trades (USDC + token): ${r.trades}`);
            console.log(`    - Unrealized PnL: $${r.pnl.unrealisedPnLUSDC.toFixed(2)} (${r.pnl.unrealisedPnLPct.toFixed(2)}%)`);
            console.log(`    - Holdings: ${r.pnl.totalTokens.toFixed(6)} tokens`);
            console.log('');
        });
    }

    console.log(`\n💡 Summary: ${results.length} assets with PnL data\n`);
}

testPnLCalculation().catch(console.error);
