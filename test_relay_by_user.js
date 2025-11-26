const fetch = require('node-fetch');
const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';

(async () => {
    console.log('Testing Relay API fetch by user...');
    try {
        const resp = await fetch(`https://api.relay.link/requests/v2?user=${WALLET}`);
        console.log('Status:', resp.status);
        if (resp.ok) {
            const data = await resp.json();
            console.log('Data type:', Array.isArray(data) ? 'Array' : typeof data);
            if (data.requests) {
                console.log('Requests count:', data.requests.length);
                console.log('First request:', JSON.stringify(data.requests[0], null, 2));
            } else if (Array.isArray(data)) {
                console.log('Requests count:', data.length);
                console.log('First request:', JSON.stringify(data[0], null, 2));
            } else {
                console.log('Response structure:', Object.keys(data));
            }
        } else {
            console.log('Error:', await resp.text());
        }
    } catch (e) {
        console.error('Fetch failed:', e);
    }
})();
