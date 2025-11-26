// @ts-ignore
const fetch = require('node-fetch');

const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_URL = 'https://api.relay.link';

async function testFinalMatching() {
    console.log(`\n🔍 Testing Relay PnL Matching for: ${WALLET}\n`);

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

    // 2. Fetch Relay requests
    const relayResp = await fetch(`${RELAY_URL}/requests?user=${WALLET}&status=filled`);
    const relayData = await relayResp.json();
    const relayReqs = relayData?.requests || [];
    console.log(`✓ Fetched ${relayReqs.length} Relay requests\n`);

    // 3. Extract Relay tx hashes
    const relayHashes = new Set();
    relayReqs.forEach(req => {
        if (req.data?.inTxs) req.data.inTxs.forEach(tx => tx.hash && relayHashes.add(tx.hash.toLowerCase()));
        if (req.data?.outTxs) req.data.outTxs.forEach(tx => tx.hash && relayHashes.add(tx.hash.toLowerCase()));
    });
    console.log(`✓ Extracted ${relayHashes.size} unique Relay tx hashes\n`);

    // 4. Match transactions
    const tokenMatches = new Map();
    txs.forEach(tx => {
        if (relayHashes.has(tx.tx_hash.toLowerCase())) {
            const symbol = tx.asset?.symbol;
            if (!tokenMatches.has(symbol)) {
                tokenMatches.set(symbol, { txs: [], usdcTxs: [] });
            }
            tokenMatches.get(symbol).txs.push(tx);
            if (symbol === 'USDC') tokenMatches.get(symbol).usdcTxs.push(tx);
        }
    });

    console.log(`\n📊 RELAY-MATCHED TOKENS:\n`);
    console.log(`Found ${tokenMatches.size} tokens with Relay-validated transactions\n`);

    if (tokenMatches.size > 0) {
        tokenMatches.forEach((data, symbol) => {
            console.log(`  ${symbol}:`);
            console.log(`    - Matched transactions: ${data.txs.length}`);
            console.log(`    - Sample tx: ${data.txs[0].tx_hash}`);

            // Check for USDC involvement
            const hasUSDC = data.txs.some(t => {
                // Check if any tx in the same hash group involves USDC
                const txHash = t.tx_hash;
                return txs.some(tx2 => tx2.tx_hash === txHash && tx2.asset.symbol === 'USDC');
            });
            console.log(`    - Involves USDC: ${hasUSDC ? 'YES ✓' : 'NO'}`);
            console.log('');
        });

        console.log(`\n💡 Summary:`);
        console.log(`   - Total portfolio tokens with Relay validation: ${tokenMatches.size}`);
        console.log(`   - These are the tokens that will show PnL in the app`);
    } else {
        console.log('⚠ No matches found between Mobula and Relay transactions\n');
    }
}

testFinalMatching().catch(console.error);
