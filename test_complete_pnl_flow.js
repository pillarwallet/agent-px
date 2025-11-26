const fetch = require('node-fetch');
const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';

async function fetchRelayRequestByHash(hash) {
    try {
        const response = await fetch(`https://api.relay.link/requests/v2?hash=${hash}`);
        if (!response.ok) return null;
        const data = await response.json();
        if (Array.isArray(data.requests) && data.requests.length > 0) {
            return data.requests[0];
        }
        return null;
    } catch (error) {
        console.error(`Error fetching Relay for ${hash}:`, error.message);
        return null;
    }
}

function calculatePnLFromRelay(relayRequests, token) {
    const trades = [];
    const tokenContract = token.contract.toLowerCase();

    const USDC_ADDRESSES = [
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base USDC
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Ethereum USDC
        '0x3c499c54b84a76ad7e9c93437bfc5ac33e2ddae9', // Polygon USDC
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // BSC USDC
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
        '0x0b2c639c533813f4aa9d7837caf992837bd5787f', // Optimism USDC
    ];

    for (const req of relayRequests) {
        let amountToken = 0;
        let amountUSDC = 0;
        let side = null;
        let timestamp = new Date(req.createdAt).getTime() / 1000;

        const metadata = req.metadata;

        // Strategy 1: Use Metadata (Preferred)
        if (metadata && metadata.currencyIn && metadata.currencyOut) {
            const currencyIn = metadata.currencyIn;
            const currencyOut = metadata.currencyOut;
            const inAddress = currencyIn.currency?.address?.toLowerCase();
            const outAddress = currencyOut.currency?.address?.toLowerCase();

            const isBuy = outAddress === tokenContract;
            const isSell = inAddress === tokenContract;

            if (isBuy) {
                side = 'BUY';
                amountToken = parseFloat(currencyOut.amountFormatted || '0');
                if (inAddress && (USDC_ADDRESSES.includes(inAddress) || currencyIn.currency?.symbol === 'USDC')) {
                    amountUSDC = parseFloat(currencyIn.amountFormatted || '0');
                } else {
                    amountUSDC = parseFloat(currencyIn.amountUsd || '0');
                }
            } else if (isSell) {
                side = 'SELL';
                amountToken = parseFloat(currencyIn.amountFormatted || '0');
                if (outAddress && (USDC_ADDRESSES.includes(outAddress) || currencyOut.currency?.symbol === 'USDC')) {
                    amountUSDC = parseFloat(currencyOut.amountFormatted || '0');
                } else {
                    amountUSDC = parseFloat(currencyOut.amountUsd || '0');
                }
            }
        }
        // Strategy 2: Use State Changes (Fallback)
        else if (req.data?.inTxs || req.data?.outTxs) {
            const userAddress = req.user?.toLowerCase();
            let tokenChange = 0;
            let usdcChange = 0;

            const allTxs = [
                ...(req.data?.inTxs || []),
                ...(req.data?.outTxs || [])
            ];

            for (const tx of allTxs) {
                if (tx.timestamp) timestamp = tx.timestamp;
                if (tx.stateChanges) {
                    for (const sc of tx.stateChanges) {
                        if (sc.address?.toLowerCase() !== userAddress) continue;

                        const tokenAddr = sc.change?.data?.tokenAddress?.toLowerCase();
                        const balanceDiff = parseFloat(sc.change?.balanceDiff || '0');

                        if (tokenAddr === tokenContract) {
                            tokenChange += balanceDiff;
                        } else if (tokenAddr && USDC_ADDRESSES.includes(tokenAddr)) {
                            usdcChange += balanceDiff;
                        }
                    }
                }
            }

            if (tokenChange !== 0) {
                const tokenDivisor = Math.pow(10, token.decimals);
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
        }

        if (!side || amountToken === 0) continue;

        // Fallback: use token price if we couldn't extract USDC amount
        if (amountUSDC === 0 && token.price) {
            amountUSDC = amountToken * token.price;
        }

        if (amountUSDC === 0) continue;

        trades.push({
            side,
            txHash: req.id,
            timestamp,
            amountToken,
            amountQuoteUSDC: amountUSDC,
            execPriceUSD: amountUSDC / amountToken,
        });
    }

    return trades.sort((a, b) => a.timestamp - b.timestamp);
}

function calculatePnLMetrics(trades, currentPrice) {
    let totalBought = 0;
    let totalSold = 0;
    let totalCostBasis = 0;
    let totalProceeds = 0;

    for (const trade of trades) {
        if (trade.side === 'BUY') {
            totalBought += trade.amountToken;
            totalCostBasis += trade.amountQuoteUSDC;
        } else {
            totalSold += trade.amountToken;
            totalProceeds += trade.amountQuoteUSDC;
        }
    }

    const currentHoldings = totalBought - totalSold;
    const avgCostBasis = totalBought > 0 ? totalCostBasis / totalBought : 0;
    const currentValue = currentHoldings * currentPrice;
    const unrealisedPnLUSDC = currentValue - (currentHoldings * avgCostBasis);
    const unrealisedPnLPct = avgCostBasis > 0 ? (unrealisedPnLUSDC / (currentHoldings * avgCostBasis)) * 100 : 0;

    return {
        totalBought,
        totalSold,
        currentHoldings,
        avgCostBasis,
        currentValue,
        unrealisedPnLUSDC,
        unrealisedPnLPct,
    };
}

(async () => {
    console.log('=== COMPLETE PNL FLOW TEST ===\n');
    console.log(`Wallet: ${WALLET}\n`);

    // 1. Fetch Portfolio
    console.log('Step 1: Fetching Portfolio...');
    const pfResp = await fetch('https://hifidata-7eu4izffpa-uc.a.run.app?testnets=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/portfolio',
            params: { wallet: WALLET },
        }),
    });
    const pfData = await pfResp.json();
    const assets = pfData?.result?.data?.assets || [];
    console.log(`✓ Found ${assets.length} assets in portfolio\n`);

    // 2. Fetch Transactions
    console.log('Step 2: Fetching Transactions...');
    const txResp = await fetch('https://hifidata-7eu4izffpa-uc.a.run.app?testnets=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: { wallet: WALLET, limit: 500, page: 1, filterSpam: true },
        }),
    });
    const txData = await txResp.json();

    console.log('Transaction API Response Structure:');
    console.log('  - result:', !!txData.result);
    console.log('  - result.data:', !!txData.result?.data);
    console.log('  - result.data.data:', !!txData.result?.data?.data);
    console.log('  - result.data.transactions:', !!txData.result?.data?.transactions);

    // Try to find the transactions array
    let allTxs = [];
    if (txData.result?.data?.data) {
        allTxs = txData.result.data.data;
        console.log(`✓ Found transactions at result.data.data: ${allTxs.length} transactions\n`);
    } else if (txData.result?.data?.transactions) {
        allTxs = txData.result.data.transactions;
        console.log(`✓ Found transactions at result.data.transactions: ${allTxs.length} transactions\n`);
    } else if (Array.isArray(txData.result?.data)) {
        allTxs = txData.result.data;
        console.log(`✓ Found transactions at result.data: ${allTxs.length} transactions\n`);
    } else {
        console.log('✗ Could not find transactions array in response');
        console.log('Response keys:', Object.keys(txData));
        if (txData.result) console.log('result keys:', Object.keys(txData.result));
        if (txData.result?.data) console.log('result.data keys:', Object.keys(txData.result.data));
        return;
    }

    // 3. Process significant tokens
    console.log('Step 3: Processing Significant Tokens (> $0.50)...');
    const significantTokens = [];

    for (const asset of assets) {
        for (const cb of asset.contracts_balances) {
            if (cb.balance > 0) {
                const valueUSD = cb.balance * asset.price;
                if (valueUSD >= 0.50) {
                    significantTokens.push({
                        symbol: asset.asset.symbol,
                        contract: cb.address,
                        balance: cb.balance,
                        price: asset.price,
                        decimals: cb.decimals,
                        valueUSD
                    });
                }
            }
        }
    }

    console.log(`✓ Found ${significantTokens.length} significant tokens:\n`);
    significantTokens.forEach(t => {
        console.log(`  - ${t.symbol}: $${t.valueUSD.toFixed(2)} (${t.balance.toFixed(6)} @ $${t.price.toFixed(2)})`);
    });
    console.log();

    // 4. Collect relevant hashes
    console.log('Step 4: Collecting Relevant Transaction Hashes...');
    const significantContracts = new Set(significantTokens.map(t => t.contract.toLowerCase()));
    const relevantHashes = new Set();

    allTxs.forEach(tx => {
        const txContract = (tx.asset?.contracts && tx.asset.contracts[0]) || tx.asset?.contract;
        if (txContract && significantContracts.has(txContract.toLowerCase())) {
            relevantHashes.add(tx.hash);
        }
    });

    console.log(`✓ Found ${relevantHashes.size} relevant transaction hashes\n`);

    // 5. Fetch Relay data
    console.log('Step 5: Fetching Relay Data (batches of 10)...');
    const relayRequests = [];
    const uniqueHashes = Array.from(relevantHashes);
    const BATCH_SIZE = 10;

    for (let i = 0; i < uniqueHashes.length; i += BATCH_SIZE) {
        const batch = uniqueHashes.slice(i, i + BATCH_SIZE);
        console.log(`  Fetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueHashes.length / BATCH_SIZE)}...`);

        await Promise.all(
            batch.map(async (hash) => {
                const req = await fetchRelayRequestByHash(hash);
                if (req) {
                    relayRequests.push(req);
                }
            })
        );
    }

    console.log(`✓ Fetched ${relayRequests.length} Relay requests\n`);

    // 6. Calculate PnL for each token
    console.log('Step 6: Calculating PnL for Each Token...\n');
    console.log('='.repeat(80));

    for (const token of significantTokens) {
        const trades = calculatePnLFromRelay(relayRequests, token);

        if (trades.length === 0) {
            console.log(`\n${token.symbol} (${token.contract.slice(0, 10)}...)`);
            console.log(`  Value: $${token.valueUSD.toFixed(2)}`);
            console.log(`  PnL: No trades found in Relay`);
            continue;
        }

        const pnl = calculatePnLMetrics(trades, token.price);

        console.log(`\n${token.symbol} (${token.contract.slice(0, 10)}...)`);
        console.log(`  Value: $${token.valueUSD.toFixed(2)}`);
        console.log(`  Trades: ${trades.length}`);
        console.log(`    - BUY: ${trades.filter(t => t.side === 'BUY').length}`);
        console.log(`    - SELL: ${trades.filter(t => t.side === 'SELL').length}`);
        console.log(`  Holdings: ${pnl.currentHoldings.toFixed(6)} (bought: ${pnl.totalBought.toFixed(6)}, sold: ${pnl.totalSold.toFixed(6)})`);
        console.log(`  Avg Cost: $${pnl.avgCostBasis.toFixed(2)}`);
        console.log(`  Current: $${token.price.toFixed(2)}`);
        console.log(`  PnL: ${pnl.unrealisedPnLUSDC >= 0 ? '+' : ''}$${pnl.unrealisedPnLUSDC.toFixed(2)} (${pnl.unrealisedPnLPct >= 0 ? '+' : ''}${pnl.unrealisedPnLPct.toFixed(2)}%)`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✓ Test Complete!');
})();
