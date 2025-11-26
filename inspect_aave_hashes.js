const fetch = require('node-fetch');
const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';

(async () => {
    console.log('Fetching transactions for wallet:', WALLET);

    // Added blockchains parameter as requested
    const resp = await fetch('https://hifidata-7eu4izffpa-uc.a.run.app?testnets=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: {
                wallet: WALLET,
                limit: 500,
                page: 1,
                filterSpam: true,
                // blockchains: ['Ethereum', 'Base', 'Polygon', 'BSC'] // Optional: specify chains if needed
            },
        }),
    });

    const data = await resp.json();
    const txs = data?.result?.data?.transactions || [];
    console.log(`Total transactions fetched: ${txs.length}`);

    const aaveTxs = txs.filter(tx => tx.asset.symbol === 'AAVE');
    console.log(`Total AAVE transactions: ${aaveTxs.length}`);

    // Group by hash
    const byHash = {};
    aaveTxs.forEach(tx => {
        if (!byHash[tx.hash]) byHash[tx.hash] = [];
        byHash[tx.hash].push(tx);
    });

    console.log('\n--- AAVE Transactions Grouped by Hash ---');
    Object.entries(byHash).forEach(([hash, group]) => {
        console.log(`\nHash: ${hash}`);
        console.log(`  Count: ${group.length}`);
        group.forEach((tx, i) => {
            console.log(`    [${i + 1}] Type: ${tx.type} | Amount: ${tx.amount} ${tx.asset.symbol} | Chain: ${tx.blockchain}`);
            console.log(`        From: ${tx.from}`);
            console.log(`        To:   ${tx.to}`);
        });
    });
})();
