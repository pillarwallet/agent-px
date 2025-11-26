// Test the updated logic
const fetch = require('node-fetch');

const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const TX_HASH = '0xad9cc422081297ddd3955b60a7573da4c6fc3086b4475b38af48ed25155c7ff6';
const USDC_ADDRESSES = [
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    '0x3c499c54b84a76ad7e9c93437bfc5ac33e2ddae9',
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
];

(async () => {
    console.log('Testing USDC detection in Relay stateChanges\n');

    const relayResp = await fetch(`https://api.relay.link/requests/v2?hash=${TX_HASH}`);
    const relayData = await relayResp.json();
    const relayReq = relayData.requests[0];

    console.log('Checking Relay stateChanges for USDC...\n');

    let hasUSDC = false;
    if (relayReq.data?.inTxs) {
        for (const inTx of relayReq.data.inTxs) {
            if (inTx.stateChanges) {
                console.log(`Found ${inTx.stateChanges.length} state changes`);
                for (const sc of inTx.stateChanges) {
                    const tokenAddr = sc.change?.data?.tokenAddress?.toLowerCase();
                    console.log(`  - Token: ${tokenAddr}`);
                    if (tokenAddr && USDC_ADDRESSES.some(addr => addr.toLowerCase() === tokenAddr)) {
                        console.log(`    ✅ USDC FOUND!`);
                        hasUSDC = true;
                    }
                }
            }
        }
    }

    console.log(`\nResult: USDC involved = ${hasUSDC}`);
})();
