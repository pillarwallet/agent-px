// @ts-ignore
const fetch = require('node-fetch');

const WALLET_ADDRESS = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const RELAY_API_URL = 'https://api.relay.link';

async function inspectRelayStructure() {
    console.log(`Inspecting Relay API structure for: ${WALLET_ADDRESS}\n`);

    const relayResponse = await fetch(`${RELAY_API_URL}/requests?user=${WALLET_ADDRESS}&status=filled`);
    const relayData = await relayResponse.json();
    const relayRequests = relayData?.requests || [];

    console.log(`Found ${relayRequests.length} Relay requests\n`);

    if (relayRequests.length > 0) {
        const firstRequest = relayRequests[0];

        console.log('=== FULL FIRST REQUEST ===');
        console.log(JSON.stringify(firstRequest, null, 2));
        console.log('\n=== STEPS STRUCTURE ===');

        if (firstRequest.steps) {
            console.log(`Steps array exists: ${Array.isArray(firstRequest.steps)}`);
            console.log(`Steps length: ${firstRequest.steps.length}`);

            firstRequest.steps.forEach((step: any, i: number) => {
                console.log(`\nStep ${i}:`);
                console.log(`  - Has items: ${!!step.items}`);
                if (step.items) {
                    console.log(`  - Items length: ${step.items.length}`);
                    step.items.forEach((item: any, j: number) => {
                        console.log(`    Item ${j}:`);
                        console.log(`      - Has data: ${!!item.data}`);
                        if (item.data) {
                            console.log(`      - Data keys: ${Object.keys(item.data).join(', ')}`);
                            console.log(`      - Has hash: ${!!item.data.hash}`);
                            if (item.data.hash) {
                                console.log(`      - Hash: ${item.data.hash}`);
                            }
                        }
                    });
                }
            });
        } else {
            console.log('No steps array found');
        }
    }
}

inspectRelayStructure().catch(console.error);
