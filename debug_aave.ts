// @ts-ignore
const fetch = require('node-fetch');

const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app';
const RELAY_URL = 'https://api.relay.link';

async function debugAAVE() {
    console.log(`\n🔍 Debugging AAVE transactions for: ${WALLET}\n`);

    // 1. Fetch transactions
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

    // Find AAVE transactions
    const aaveTxs = allTxs.filter(tx => tx.asset.symbol === 'AAVE');
    console.log(`Found ${aaveTxs.length} AAVE transactions\n`);

    const uniqueHashes = [...new Set(aaveTxs.map(tx => tx.hash))];
    console.log(`Unique transaction hashes: ${uniqueHashes.length}\n`);

    // Check each hash with Relay
    for (const txHash of uniqueHashes) {
        console.log(`\n━━━ Transaction Hash: ${txHash} ━━━`);

        // Get all Mobula transactions for this hash
        const txGroup = allTxs.filter(tx => tx.hash === txHash);
        console.log(`\nMobula transactions in this hash (${txGroup.length}):`);
        txGroup.forEach((tx, i) => {
            console.log(`  ${i + 1}. ${tx.asset.symbol}: ${tx.amount} (${tx.to === WALLET.toLowerCase() ? 'IN' : 'OUT'})`);
        });

        // Query Relay
        try {
            const relayResp = await fetch(`${RELAY_URL}/requests/v2?hash=${txHash}`);
            if (relayResp.ok) {
                const relayData = await relayResp.json();
                console.log(`\n✅ Found in Relay!`);
                console.log(`\nRelay Request Details:`);
                console.log(`  Status: ${relayData.status}`);
                console.log(`  In: ${relayData.in?.currency} (${relayData.in?.amount})`);
                console.log(`  Out: ${relayData.out?.currency} (${relayData.out?.amount})`);

                if (relayData.metadata) {
                    console.log(`\nMetadata:`);
                    if (relayData.metadata.currencyIn) {
                        console.log(`  Currency In: ${relayData.metadata.currencyIn.currency.symbol} - ${relayData.metadata.currencyIn.amountFormatted}`);
                    }
                    if (relayData.metadata.currencyOut) {
                        console.log(`  Currency Out: ${relayData.metadata.currencyOut.currency.symbol} - ${relayData.metadata.currencyOut.amountFormatted}`);
                    }
                }

                // Analyze for USDC + AAVE
                const hasAAVE = txGroup.some(tx => tx.asset.symbol === 'AAVE');
                const hasUSDC = txGroup.some(tx => tx.asset.symbol === 'USDC');
                console.log(`\n Analysis:`);
                console.log(`  Has AAVE: ${hasAAVE}`);
                console.log(`  Has USDC: ${hasUSDC}`);

                if (hasAAVE && hasUSDC) {
                    console.log(`  ✅ Valid trade (AAVE + USDC)`);
                } else {
                    console.log(`  ❌ Not a valid trade (missing ${!hasAAVE ? 'AAVE' : 'USDC'})`);
                }
            } else {
                console.log(`\n❌ Not found in Relay (${relayResp.status})`);
            }
        } catch (e) {
            console.log(`\n❌ Error querying Relay: ${e.message}`);
        }
    }
}

debugAAVE().catch(console.error);
