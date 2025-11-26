
const fetch = require('node-fetch');

const TX_HASH = '0xb24bd94a44b0918cfecb3967ddd6c61f0a1c54c30db691a5ea4e73f70385825c';

// Re-implementing fetchRelayRequestByHash simply for this script
// to avoid importing from the codebase and dealing with TS/ESM issues
const fetchRelayRequestByHash = async (hash) => {
    try {
        const response = await fetch(`https://api.relay.link/requests/v2?hash=${hash}`);
        if (!response.ok) {
            console.error(`Relay API error: ${response.status} ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        return { data: data }; // Mimic the structure expected
    } catch (error) {
        console.error('Error fetching from Relay:', error);
        return null;
    }
};

const runDebug = async () => {
    console.log(`Fetching Relay data for hash: ${TX_HASH}`);
    try {
        const req = await fetchRelayRequestByHash(TX_HASH);

        if (!req) {
            console.log('❌ No data returned from Relay API');
            return;
        }

        console.log('✅ Relay Data Received:');
        console.log(JSON.stringify(req, null, 2));

    } catch (error) {
        console.error('Error fetching data:', error);
    }
};

runDebug();
