// @ts-ignore
const fetch = require('node-fetch');

const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_URL = 'https://api.relay.link';

// Simple PnL calculation
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

    const currentValueUSDC = totalTokens * currentPrice;
    const unrealisedPnLUSDC = currentValueUSDC - totalCostUSDC;
    const unrealisedPnLPct = totalCostUSDC > 0 ? (unrealisedPnLUSDC / totalCostUSDC) * 100 : 0;

    return { unrealisedPnLUSDC, unrealisedPnLPct, totalTokens, totalCostUSDC };
}

async function testPortfolioPnL() {
    console.log(`\n🔍 Testing Portfolio PnL for: ${WALLET}\n`);

    // 1. Fetch Portfolio
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
    console.log(`✓ Fetched portfolio: ${assets.length} assets\n`);

    // Filter assets > $0.50
    const significantAssets = assets.filter(a => {
        const usdValue = (a.price || 0) * (a.token_balance || 0);
        return usdValue >= 0.50;
    });
    console.log(`✓ Assets > $0.50: ${significantAssets.length}\n`);

    // 2. Fetch transaction history
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
    console.log(`✓ Fetched ${allTxs.length} transactions\n`);

    console.log(`📊 Processing assets for Relay validation...\n`);

    const results = [];

    // 3. For each significant asset, find its transactions and validate with Relay
    for (const asset of significantAssets) {
        const symbol = asset.asset.symbol;
        const contract = asset.asset.contracts[0];
        const price = asset.price;
        const usdValue = price * asset.token_balance;

        console.log(`  Processing ${symbol} (${contract?.substring(0, 10)}...) - $${usdValue.toFixed(2)}`);

        // Find transactions for this asset
        const assetTxs = allTxs.filter(tx =>
            tx.asset.symbol === symbol ||
            (contract && tx.asset.contract?.toLowerCase() === contract.toLowerCase())
        );

        if (assetTxs.length === 0) {
            console.log(`    ⚠ No transactions found`);
            continue;
        }

        // Get unique transaction hashes
        const uniqueHashes = [...new Set(assetTxs.map(tx => tx.hash))];
        console.log(`    - Found ${assetTxs.length} transactions (${uniqueHashes.length} unique hashes)`);

        // Validate with Relay
        let relayValidatedCount = 0;
        const validatedTrades = [];

        for (const txHash of uniqueHashes) {
            try {
                const relayResp = await fetch(`${RELAY_URL}/requests/v2?hash=${txHash}`);
                if (relayResp.ok) {
                    relayValidatedCount++;

                    // Analyze this transaction for USDC + token
                    const txGroup = assetTxs.filter(tx => tx.hash === txHash);
                    let usdcChange = 0;
                    let tokenChange = 0;
                    let hasUSDC = false;
                    let hasToken = false;

                    txGroup.forEach(tx => {
                        const isInbound = tx.to.toLowerCase() === WALLET.toLowerCase();
                        const isOutbound = tx.from.toLowerCase() === WALLET.toLowerCase();

                        if (tx.asset.symbol === 'USDC') {
                            hasUSDC = true;
                            usdcChange += tx.amount * (isInbound ? 1 : -1);
                        } else if (tx.asset.symbol === symbol) {
                            hasToken = true;
                            tokenChange += tx.amount * (isInbound ? 1 : -1);
                        }
                    });

                    if (hasUSDC && hasToken && tokenChange !== 0) {
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
                // Not in Relay or error
            }
        }

        console.log(`    - Relay-validated: ${relayValidatedCount} hashes`);
        console.log(`    - Valid trades (USDC + token): ${validatedTrades.length}`);

        if (validatedTrades.length > 0) {
            const pnl = calculatePnL(validatedTrades, price);
            results.push({ symbol, usdValue, trades: validatedTrades.length, pnl });
            console.log(`    ✅ Unrealized PnL: $${pnl.unrealisedPnLUSDC.toFixed(2)} (${pnl.unrealisedPnLPct.toFixed(2)}%)`);
        } else {
            console.log(`    ❌ No valid trades found`);
        }
        console.log('');
    }

    console.log(`\n📈 SUMMARY:\n`);
    console.log(`  Total assets > $0.50: ${significantAssets.length}`);
    console.log(`  Assets with PnL data: ${results.length}\n`);

    if (results.length > 0) {
        console.log(`  Assets with Unrealized PnL:`);
        results.forEach(r => {
            console.log(`    ${r.symbol}: $${r.pnl.unrealisedPnLUSDC.toFixed(2)} (${r.pnl.unrealisedPnLPct.toFixed(2)}%) - ${r.trades} trades`);
        });
    }
}

testPortfolioPnL().catch(console.error);
