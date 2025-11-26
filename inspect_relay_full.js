const fetch = require('node-fetch');

(async () => {
    const hash = '0xad9cc422081297ddd3955b60a7573da4c6fc3086b4475b38af48ed25155c7ff6';
    console.log(`Fetching Relay data for ${hash}...`);
    const response = await fetch(`https://api.relay.link/requests/v2?hash=${hash}`);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
})();
