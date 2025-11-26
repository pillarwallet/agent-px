const fetch = require('node-fetch');
const WALLET = '0x70e8741c1758Ba32176B188286B8086956627B1c';

(async () => {
    console.log('=== TESTING RTK QUERY RESPONSE STRUCTURE ===\n');

    // Simulate what RTK Query does - POST to the API
    const response = await fetch('https://hifidata-7eu4izffpa-uc.a.run.app?testnets=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: 'wallet/transactions',
            params: { wallet: WALLET, limit: 500, page: 1, filterSpam: true },
        }),
    });

    const fullResponse = await response.json();

    console.log('Full API Response Structure:');
    console.log('Keys at root:', Object.keys(fullResponse));
    console.log();

    if (fullResponse.result) {
        console.log('Keys in result:', Object.keys(fullResponse.result));
        console.log();

        if (fullResponse.result.data) {
            console.log('Keys in result.data:', Object.keys(fullResponse.result.data));
            console.log();

            // Check what RTK Query would return as "data"
            console.log('What RTK Query returns as "data":');
            console.log('  Type:', typeof fullResponse.result);
            console.log('  Has "data" field:', 'data' in fullResponse.result);
            console.log('  Has "transactions" field:', 'transactions' in (fullResponse.result.data || {}));
            console.log();

            if (fullResponse.result.data.transactions) {
                console.log('✓ Transactions found at result.data.transactions');
                console.log('  Count:', fullResponse.result.data.transactions.length);
                console.log('  First transaction keys:', Object.keys(fullResponse.result.data.transactions[0]));
            } else if (Array.isArray(fullResponse.result.data)) {
                console.log('✓ Transactions found at result.data (array)');
                console.log('  Count:', fullResponse.result.data.length);
            } else {
                console.log('✗ Could not find transactions array');
            }
        }
    }

    console.log('\n=== WHAT THE COMPONENT SHOULD ACCESS ===');
    console.log('If RTK Query returns fullResponse.result, then:');
    console.log('  transactionsData = result');
    console.log('  transactionsData.data = result.data');
    console.log('  transactionsData.data.transactions = result.data.transactions');
    console.log();
    console.log('Current code accesses: transactionsData.data.transactions');
    console.log('This would be: result.data.transactions ✓');
})();
