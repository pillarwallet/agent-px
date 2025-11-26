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
        return null;
    }
}

(async () => {
    console.log('--- Verifying Hybrid PnL Logic ---');

    // 1. Fetch Portfolio to get AAVE contract (Ethereum)
    console.log('Fetching Portfolio...');
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

    const aaveAsset = assets.find(a => a.asset.symbol === 'AAVE');
    const aaveToken = aaveAsset.contracts_balances
        .filter(cb => cb.balance > 0)
        .map(cb => ({
            symbol: aaveAsset.asset.symbol,
            contract: cb.address,
            balance: cb.balance,
            price: aaveAsset.price,
            decimals: cb.decimals
        }))[0]; // Ethereum contract

    if (!aaveToken) {
        console.error('AAVE token with balance not found!');
        return;
    }
    console.log('Target Token:', aaveToken);

    // 2. Fetch Transactions (Mobula)
    console.log('Fetching Transactions...');
    const txResp = await fetch('https://hifidata-7eu4izffpa-uc.a.run.app?testnets=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: { wallet: WALLET, limit: 500, page: 1, filterSpam: true },
        }),
    });
    const txData = await txResp.json();
    const allTxs = txData?.result?.data?.transactions || [];

    // 3. Find Relevant Hashes
    const relevantHashes = new Set();
    allTxs.forEach(tx => {
        const txContract = (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;
        if (txContract && txContract.toLowerCase() === aaveToken.contract.toLowerCase()) {
            relevantHashes.add(tx.hash);
        }
    });
    console.log(`Found ${relevantHashes.size} relevant hashes for contract ${aaveToken.contract}`);

    // 4. Fetch Relay Data
    const relayRequests = [];
    for (const hash of relevantHashes) {
        console.log(`Fetching Relay data for ${hash}...`);
        const req = await fetchRelayRequestByHash(hash);
        if (req) {
            relayRequests.push(req);
            console.log('  Found in Relay!');
        } else {
            console.log('  Not found in Relay.');
        }
    }

    // 5. Calculate PnL (Simulate calculatePnLFromRelay)
    console.log('Calculating PnL...');
    const trades = [];
    const tokenContract = aaveToken.contract.toLowerCase();
    const USDC_ADDRESSES = [
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Ethereum
        '0x3c499c54b84a76ad7e9c93437bfc5ac33e2ddae9', // Polygon
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // BSC
    ];

    for (const req of relayRequests) {
        let amountToken = 0;
        let amountUSDC = 0;
        let side = null;

        const metadata = req.metadata;

        // Strategy 1: Use Metadata (Preferred)
        if (metadata && metadata.currencyIn && metadata.currencyOut) {
            const currencyIn = metadata.currencyIn;
            const currencyOut = metadata.currencyOut;

            console.log(`  Request ${req.id}:`);
            console.log(`    In: ${currencyIn?.currency?.symbol} (${currencyIn?.currency?.address})`);
            console.log(`    Out: ${currencyOut?.currency?.symbol} (${currencyOut?.currency?.address})`);
            console.log(`    Target: ${tokenContract}`);

            const inAddress = currencyIn.currency?.address?.toLowerCase();
            const outAddress = currencyOut.currency?.address?.toLowerCase();

            const isBuy = outAddress === tokenContract;
            const isSell = inAddress === tokenContract;

            console.log(`    isBuy: ${isBuy}, isSell: ${isSell}`);

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
            console.log(`  Request ${req.id}: No metadata, checking stateChanges...`);
            const userAddress = WALLET.toLowerCase(); // Hardcoded for test
            let tokenChange = 0;
            let usdcChange = 0;

            const allTxs = [
                ...(req.data?.inTxs || []),
                ...(req.data?.outTxs || [])
            ];

            for (const tx of allTxs) {
                if (tx.stateChanges) {
                    for (const sc of tx.stateChanges) {
                        const scAddress = sc.address?.toLowerCase();
                        if (scAddress !== userAddress) {
                            // console.log(`    Skipping address ${scAddress} (not user)`);
                            continue;
                        }

                        const tokenAddr = sc.change?.data?.tokenAddress?.toLowerCase();
                        const balanceDiff = parseFloat(sc.change?.balanceDiff || '0');

                        console.log(`    Found user change: Token ${tokenAddr}, Diff ${balanceDiff}`);
                        console.log(`    Target Contract: ${tokenContract}`);

                        if (tokenAddr === tokenContract) {
                            tokenChange += balanceDiff;
                            console.log(`      -> Matched Token! New tokenChange: ${tokenChange}`);
                        } else if (tokenAddr && USDC_ADDRESSES.includes(tokenAddr)) {
                            usdcChange += balanceDiff;
                            console.log(`      -> Matched USDC! New usdcChange: ${usdcChange}`);
                        }
                    }
                }
            }

            if (tokenChange !== 0) {
                // Determine decimals for token (from portfolio)
                const tokenDivisor = Math.pow(10, aaveToken.decimals);
                const usdcDivisor = 1e6; // USDC is always 6 decimals on EVM usually

                const tokenAmountRaw = Math.abs(tokenChange) / tokenDivisor;
                const usdcAmountRaw = Math.abs(usdcChange) / usdcDivisor;

                if (tokenChange > 0) {
                    side = 'BUY'; // Received token
                    amountToken = tokenAmountRaw;
                    amountUSDC = usdcAmountRaw; // Spent USDC (negative change)
                } else {
                    side = 'SELL'; // Sent token
                    amountToken = tokenAmountRaw;
                    amountUSDC = usdcAmountRaw; // Received USDC (positive change)
                }
                console.log(`    Fallback found trade: ${side} ${amountToken} Token for ${amountUSDC} USDC`);
            }
        }

        if (!side || amountToken === 0) continue;

        // Fallback: use token price if we couldn't extract USDC amount
        if (amountUSDC === 0 && aaveToken.price) {
            amountUSDC = amountToken * aaveToken.price;
            console.log(`    Used price fallback: ${amountUSDC} USDC`);
        }

        if (amountUSDC === 0) continue;

        trades.push({ side, amountToken, amountUSDC, hash: req.id });
    }

    console.log('Trades:', trades);
})();
