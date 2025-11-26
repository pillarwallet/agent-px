const fetch = require('node-fetch');
const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';

(async () => {
    console.log('Fetching transactions for wallet:', WALLET);

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
            },
        }),
    });

    const data = await resp.json();
    const txs = data?.result?.data?.transactions || [];

    const aaveTxs = txs.filter(tx => tx.asset.symbol === 'AAVE');
    console.log(`Total AAVE transactions: ${aaveTxs.length}`);

    aaveTxs.forEach((tx, i) => {
        const contract = (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;
        console.log(`\n[${i + 1}] Hash: ${tx.hash}`);
        console.log(`    Chain: ${tx.blockchain}`);
        console.log(`    Contract: ${contract}`);
        console.log(`    Amount: ${tx.amount}`);
        console.log(`    Type: ${tx.type}`);
    });
})();
