// @ts-ignore
const fetch = require('node-fetch');

const WALLET_ADDRESS = '0x70e8741c1758Ba32176B188286B8086956627B1c';
const API_URL = 'https://hifidata-7eu4izffpa-uc.a.run.app'; // Production URL (assuming mainnet)

async function verifyTransactions() {
    console.log(`Verifying transaction history for wallet: ${WALLET_ADDRESS}`);

    try {
        const response = await fetch(`${API_URL}?testnets=false`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: 'wallet/transactions',
                params: {
                    wallet: WALLET_ADDRESS,
                    limit: 500,
                    page: 1,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const responseData = await response.json();

        // Check for nested structure: result.data.transactions
        if (responseData && responseData.result && responseData.result.data && Array.isArray(responseData.result.data.transactions)) {
            const transactions = responseData.result.data.transactions;
            console.log(`Successfully fetched ${transactions.length} transactions.`);
            if (transactions.length > 0) {
                console.log('Sample transaction:', JSON.stringify(transactions[0], null, 2));
            } else {
                console.warn('No transactions found for this wallet.');
            }
        } else {
            console.error('Invalid response format:', JSON.stringify(responseData, null, 2));
        }
    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verifyTransactions();
