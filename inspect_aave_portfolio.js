const fetch = require('node-fetch');
const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';

(async () => {
    const resp = await fetch('https://hifidata-7eu4izffpa-uc.a.run.app?testnets=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/portfolio',
            params: { wallet: WALLET },
        }),
    });
    const data = await resp.json();
    const assets = data?.result?.data?.assets || [];

    const aave = assets.find(a => a.asset.symbol === 'AAVE');
    console.log('AAVE Portfolio Asset:');
    console.log('  Balance:', aave?.token_balance);
    console.log('  Price:', aave?.price);
    console.log('  Contract:', aave?.asset?.contracts?.[0] || aave?.asset?.contract);
    console.log('  Chain ID:', aave?.asset?.chain_id); // Check if this field exists
    console.log('  Blockchain:', aave?.asset?.blockchain); // Or this
})();
