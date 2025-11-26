// @ts-ignore
const fetch = require('node-fetch');

const WALLET_ADDRESS = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_API_URL = 'https://api.relay.link';

async function testRelayPnL() {
    console.log(`Testing Relay PnL for wallet: ${WALLET_ADDRESS}\n`);

    // 1. Fetch Mobula transactions
    console.log('1. Fetching Mobula transactions...');
    const mobulaResponse = await fetch(`${API_URL}?testnets=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: {
                wallet: WALLET_ADDRESS,
                limit: 500,
                page: 1,
                filterSpam: true,
            },
        }),
    });

    const mobulaData = await mobulaResponse.json();
    const transactions = mobulaData?.result?.data?.transactions || [];
    console.log(`   Found ${transactions.length} Mobula transactions\n`);

    // 2. Fetch Relay requests
    console.log('2. Fetching Relay requests...');
    const relayResponse = await fetch(`${RELAY_API_URL}/requests?user=${WALLET_ADDRESS}&status=filled`);
    const relayData = await relayResponse.json();
    const relayRequests = relayData?.requests || [];
    console.log(`   Found ${relayRequests.length} Relay requests\n`);

    // 3. Create a map of Relay transaction hashes
    const relayTxMap = new Map();
    relayRequests.forEach((req: any) => {
        if (req.in?.transactionHash) {
            relayTxMap.set(req.in.transactionHash.toLowerCase(), req);
        }
        if (req.out?.transactionHash) {
            relayTxMap.set(req.out.transactionHash.toLowerCase(), req);
        }
    });

    console.log('3. Analyzing transactions for Relay matches...\n');

    // 4. Find unique tokens in transactions
    const tokenMap = new Map();
    transactions.forEach((tx: any) => {
        const symbol = tx.asset?.symbol;
        const contract = tx.asset?.contracts?.[0];
        if (symbol && contract && symbol !== 'ETH') { // Skip native ETH
            if (!tokenMap.has(symbol)) {
                tokenMap.set(symbol, {
                    symbol,
                    contract,
                    decimals: tx.asset.decimals,
                    transactions: [],
                    relayMatches: 0,
                });
            }
            tokenMap.get(symbol).transactions.push(tx);
        }
    });

    console.log(`   Found ${tokenMap.size} unique tokens\n`);

    // 5. Check which tokens have Relay matches
    console.log('4. Checking for Relay-validated transactions:\n');

    const tokensWithRelay: any[] = [];

    tokenMap.forEach((tokenData: any, symbol: string) => {
        const txHashes = Array.from(new Set(tokenData.transactions.map((tx: any) => tx.tx_hash.toLowerCase()))) as string[];
        const relayMatchedHashes: string[] = [];

        for (const hash of txHashes) {
            if (relayTxMap.has(hash)) {
                relayMatchedHashes.push(hash);
            }
        }

        if (relayMatchedHashes.length > 0) {
            tokenData.relayMatches = relayMatchedHashes.length;
            tokensWithRelay.push(tokenData);

            console.log(`   ✓ ${symbol}:`);
            console.log(`     - Total transactions: ${tokenData.transactions.length}`);
            console.log(`     - Relay-matched: ${relayMatchedHashes.length}`);
            console.log(`     - Contract: ${tokenData.contract}`);
            console.log(`     - Matched hashes: ${relayMatchedHashes.slice(0, 3).join(', ')}${relayMatchedHashes.length > 3 ? '...' : ''}\n`);
        }
    });

    if (tokensWithRelay.length === 0) {
        console.log('   ⚠ No tokens found with Relay-validated transactions\n');
        console.log('   This could mean:');
        console.log('   - Relay API doesn\'t include transactionHash in response');
        console.log('   - No transactions were made through Relay for this wallet');
        console.log('   - Transaction hashes don\'t match between systems\n');

        // Show sample Relay request structure
        if (relayRequests.length > 0) {
            console.log('   Sample Relay request structure:');
            console.log(JSON.stringify(relayRequests[0], null, 2));
        }
    } else {
        console.log(`\n5. Summary:`);
        console.log(`   - Tokens with Relay validation: ${tokensWithRelay.length}`);
        console.log(`   - Total Relay requests: ${relayRequests.length}`);
        console.log(`   - Total Mobula transactions: ${transactions.length}`);
    }
}

testRelayPnL().catch(console.error);
