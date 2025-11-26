const fetch = require('node-fetch');
const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';

// Mock Relay API fetch
async function fetchRelayRequestByHash(hash) {
    try {
        const response = await fetch(`https://api.relay.link/requests/v2?hash=${hash}`);
        if (!response.ok) return null;
        const data = await response.json();
        // API returns array, we want the first match or specific one
        if (Array.isArray(data.requests)) {
            return data.requests[0];
        }
        return null;
    } catch (error) {
        return null;
    }
}

(async () => {
    console.log('--- Verifying AAVE PnL Logic ---');

    // 1. Fetch Portfolio to get AAVE contract
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

    // Find AAVE with balance > 0
    // Logic from convertPortfolioAPIResponseToToken
    const aaveAsset = assets.find(a => a.asset.symbol === 'AAVE');
    const aaveToken = aaveAsset.contracts_balances
        .filter(cb => cb.balance > 0)
        .map(cb => ({
            symbol: aaveAsset.asset.symbol,
            contract: cb.address,
            balance: cb.balance,
            price: aaveAsset.price,
            decimals: cb.decimals
        }))[0]; // Take the first one (Ethereum)

    if (!aaveToken) {
        console.error('AAVE token with balance not found!');
        return;
    }

    console.log('Target Token:', aaveToken);

    // 2. Fetch Transactions
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

    // 3. Filter Transactions by Contract (The Logic I implemented)
    const tokenTransactions = allTxs.filter((tx) => {
        const txContract = (tx.asset.contracts && tx.asset.contracts[0]) || tx.asset.contract;
        return (
            tx.asset.symbol === aaveToken.symbol &&
            txContract?.toLowerCase() === aaveToken.contract.toLowerCase()
        );
    });

    console.log(`Found ${tokenTransactions.length} relevant transactions for contract ${aaveToken.contract}`);
    tokenTransactions.forEach(tx => {
        console.log(`  Hash: ${tx.hash} | Amount: ${tx.amount} | Chain: ${tx.blockchain}`);
    });

    // 4. Validate with Relay
    console.log('Validating with Relay...');
    const trades = [];
    const USDC_ADDRESSES = [
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Ethereum
        '0x3c499c54b84a76ad7e9c93437bfc5ac33e2ddae9', // Polygon
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // BSC
    ];

    for (const tx of tokenTransactions) {
        const relayReq = await fetchRelayRequestByHash(tx.hash);
        if (!relayReq) {
            console.log(`  Hash ${tx.hash}: Not found in Relay`);
            continue;
        }

        let hasUSDC = false;
        let usdcAmount = 0;
        const userAddress = relayReq.user?.toLowerCase();

        // Determine side
        const isInbound = tx.to.toLowerCase() === aaveToken.contract.toLowerCase(); // Wait, to/from logic in pnl.ts checks against token address?
        // No, pnl.ts checks: tx.to === token.address (inbound/buy) ?? 
        // Wait, standard transfer: to = user (receive), from = user (send)
        // pnl.ts: 
        // const isInbound = tx.to.toLowerCase() === token.address.toLowerCase(); 
        // NO! This is wrong in pnl.ts if token.address is the CONTRACT address.
        // Usually tx.to is the recipient. If I buy, I receive. So tx.to should be ME.
        // Let's check pnl.ts logic again.

        // Logic in pnl.ts:
        // const isInbound = tx.to.toLowerCase() === token.address.toLowerCase();
        // This implies token.address is the USER address? 
        // NO, token.address is the CONTRACT address.
        // If tx.to === contract, that's usually an interaction (approve, swap, etc).
        // But Mobula "transactions" usually show transfers.
        // If it's a transfer, tx.to is the recipient.

        // Let's check the AAVE transaction details from previous logs.
        // Hash: 0xad9...
        // From: 0xf50... (Relay/Solver?)
        // To: 0x70e... (User)
        // Type: buy

        // So tx.to is the USER.
        // pnl.ts says: `const isInbound = tx.to.toLowerCase() === token.address.toLowerCase();`
        // If `token.address` is the CONTRACT, this is WRONG.
        // `token.address` should be the USER wallet address?
        // No, `token` object has `address: token.contract`.

        // WAIT! I might have found a BUG in `pnl.ts`.
        // Let's verify what `token.address` is in `pnl.ts`.
        // It is passed as `address: token.contract`.

        // So `isInbound` checks if `tx.to === contract`.
        // But for a BUY (receive), `tx.to` is the USER.
        // So `isInbound` would be false.

        // Let's check `pnl.ts` again carefully.
    }
})();
