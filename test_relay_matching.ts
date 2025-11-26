// @ts-ignore
const fetch = require('node-fetch');

const WALLET_ADDRESS = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_API_URL = 'https://api.relay.link';

async function testRelayMatching() {
    console.log(`Testing Relay PnL Matching for: ${WALLET_ADDRESS}\n`);

    // 1. Fetch Mobula transactions
    const mobulaResponse = await fetch(`${API_URL}?testnets=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: { wallet: WALLET_ADDRESS, limit: 500, page: 1, filterSpam: true },
        }),
    });
    const mobulaData = await mobulaResponse.json();
    const transactions = mobulaData?.result?.data?.transactions || [];
    console.log(`✓ Fetched ${transactions.length} Mobula transactions\n`);

    // 2. Fetch Relay requests
    const relayResponse = await fetch(`${RELAY_API_URL}/requests?user=${WALLET_ADDRESS}&status=filled`);
    const relayData = await relayResponse.json();
    const relayRequests = relayData?.requests || [];
    console.log(`✓ Fetched ${relayRequests.length} Relay requests\n`);

    // 3. Extract transaction hashes from Relay steps
    const relayTxHashes = new Set();
    relayRequests.forEach((req: any) => {
        if (req.steps && Array.isArray(req.steps)) {
            req.steps.forEach((step: any) => {
                if (step.items && Array.isArray(step.items)) {
                    step.items.forEach((item: any) => {
                        if (item.data?.hash) {
                            relayTxHashes.add(item.data.hash.toLowerCase());
                        }
                    });
                }
            });
        }
    });

    console.log(`✓ Extracted ${relayTxHashes.size} unique transaction hashes from Relay\n`);

    // 4. Match Mobula transactions with Relay
    const matchedTxs = new Map();
    transactions.forEach((tx: any) => {
        if (relayTxHashes.has(tx.tx_hash.toLowerCase())) {
            const symbol = tx.asset?.symbol;
            if (!matchedTxs.has(symbol)) {
                matchedTxs.set(symbol, []);
            }
            matchedTxs.get(symbol).push(tx);
        }
    });

    console.log(`\n📊 RELAY-MATCHED TOKENS:\n`);
    console.log(`Found ${matchedTxs.size} tokens with Relay-validated transactions\n`);

    if (matchedTxs.size === 0) {
        console.log('⚠ No matches found. This could mean:');
        console.log('  - Transaction hashes don\'t match between systems');
        console.log('  - Relay requests are for different transactions\n');

        // Show sample hashes for debugging
        console.log('Sample Mobula tx hashes:', Array.from(new Set(transactions.slice(0, 5).map((t: any) => t.tx_hash))));
        console.log('Sample Relay tx hashes:', Array.from(relayTxHashes).slice(0, 5));
    } else {
        matchedTxs.forEach((txs: any[], symbol: string) => {
            console.log(`  ${symbol}:`);
            console.log(`    - Matched transactions: ${txs.length}`);
            console.log(`    - Sample tx hash: ${txs[0].tx_hash}`);

            // Calculate simple stats
            const usdcTxs = txs.filter((t: any) => t.asset.symbol === 'USDC');
            console.log(`    - USDC transactions: ${usdcTxs.length}`);
            console.log('');
        });
    }
}

testRelayMatching().catch(console.error);
