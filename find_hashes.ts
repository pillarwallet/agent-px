// @ts-ignore
const fetch = require('node-fetch');

const WALLET_ADDRESS = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const RELAY_API_URL = 'https://api.relay.link';

async function findTransactionHashes() {
    const relayResponse = await fetch(`${RELAY_API_URL}/requests?user=${WALLET_ADDRESS}&status=filled`);
    const relayData = await relayResponse.json();
    const relayRequests = relayData?.requests || [];

    console.log(`Found ${relayRequests.length} Relay requests\n`);

    if (relayRequests.length > 0) {
        const firstRequest = relayRequests[0];

        console.log('Top-level keys:', Object.keys(firstRequest));
        console.log('\n');

        // Check if there's a transaction hash anywhere
        function findHashesRecursive(obj: any, path: string = ''): string[] {
            const hashes: string[] = [];

            if (typeof obj === 'object' && obj !== null) {
                if (obj.hash && typeof obj.hash === 'string' && obj.hash.startsWith('0x')) {
                    console.log(`Found hash at: ${path}.hash = ${obj.hash}`);
                    hashes.push(obj.hash);
                }

                for (const key in obj) {
                    const newPath = path ? `${path}.${key}` : key;
                    hashes.push(...findHashesRecursive(obj[key], newPath));
                }
            }

            return hashes;
        }

        console.log('\n=== Searching for transaction hashes ===\n');
        const hashes = findHashesRecursive(firstRequest);
        console.log(`\nTotal hashes found: ${hashes.length}`);
        console.log('Unique hashes:', [...new Set(hashes)]);
    }
}

findTransactionHashes().catch(console.error);
