// Test with the actual implementation logic
const fetch = require('node-fetch');

const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_URL = 'https://api.relay.link';

// Exact PnL calculation from the codebase
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

async function fetchRelayByHash(txHash) {
    try {
        const response = await fetch(`${RELAY_URL}/requests/v2?hash=${txHash}`);
        if (response.ok) {
            const data = await response.json();
            const requests = data?.requests || [];
            return requests.length > 0 ? requests[0] : null;
        }
    } catch (e) { }
    return null;
}

async function testAAVEPnL() {
    console.log(`\n🔍 Testing AAVE PnL Calculation\n`);

    // Fetch transactions
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

    // Get AAVE price from portfolio
    const portfolioResp = await fetch(`${API_URL}?testnets=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/portfolio',
            params: { wallet: WALLET },
        }),
    });
    const portfolioData = await portfolioResp.json();
    const aaveAsset = portfolioData?.result?.data?.assets?.find(a => a.asset.symbol === 'AAVE');
    const aavePrice = aaveAsset?.price || 0;

    console.log(`AAVE current price: $${aavePrice}\n`);

    // Find AAVE transactions
    const aaveTxs = allTxs.filter(tx => tx.asset.symbol === 'AAVE');
    const uniqueHashes = [...new Set(aaveTxs.map(tx => tx.hash))];

    console.log(`Processing ${uniqueHashes.length} unique AAVE transaction hashes...\n`);

    const validatedTrades = [];

    for (const txHash of uniqueHashes) {
        const relayReq = await fetchRelayByHash(txHash);
        if (!relayReq) continue;

        const txGroup = allTxs.filter(tx => tx.hash === txHash);
        let usdcChange = 0;
        let aaveChange = 0;
        let hasUSDC = false;
        let hasAAVE = false;

        txGroup.forEach(tx => {
            const isInbound = tx.to.toLowerCase() === WALLET.toLowerCase();
            const isOutbound = tx.from.toLowerCase() === WALLET.toLowerCase();

            if (tx.asset.symbol === 'USDC') {
                hasUSDC = true;
                usdcChange += tx.amount * (isInbound ? 1 : -1);
            } else if (tx.asset.symbol === 'AAVE') {
                hasAAVE = true;
                aaveChange += tx.amount * (isInbound ? 1 : -1);
            }
        });

        if (hasUSDC && hasAAVE && aaveChange !== 0) {
            const side = aaveChange > 0 ? 'BUY' : 'SELL';
            validatedTrades.push({
                side,
                amountToken: Math.abs(aaveChange),
                amountQuoteUSDC: Math.abs(usdcChange),
                timestamp: txGroup[0].timestamp,
                txHash,
            });
            console.log(`✅ ${side}: ${Math.abs(aaveChange).toFixed(6)} AAVE for $${Math.abs(usdcChange).toFixed(2)} USDC (${txHash.substring(0, 10)}...)`);
        }
    }

    console.log(`\n📊 Total validated trades: ${validatedTrades.length}\n`);

    if (validatedTrades.length > 0) {
        const pnl = calculatePnL(validatedTrades, aavePrice);
        console.log(`PnL Results:`);
        console.log(`  Holdings: ${pnl.totalTokens.toFixed(6)} AAVE`);
        console.log(`  Cost Basis: $${pnl.totalCostUSDC.toFixed(2)}`);
        console.log(`  Current Value: $${(pnl.totalTokens * aavePrice).toFixed(2)}`);
        console.log(`  Unrealized PnL: $${pnl.unrealisedPnLUSDC.toFixed(2)} (${pnl.unrealisedPnLPct.toFixed(2)}%)`);
    } else {
        console.log(`❌ No validated trades found`);
    }
}

testAAVEPnL().catch(console.error);
