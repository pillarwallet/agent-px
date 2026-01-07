
import { getOpenOrders } from './lib/hyperliquid/client';
import { privateKeyToAccount } from 'viem/accounts';

// The key used in test_trade.ts
const PRIVATE_KEY = '0xfa77cd3562696b4369822d916f1ddab6a06559a9315d16f3e0b11617a07225aa';
const MASTER_ADDRESS = '0xc29A49A443fcd6Bbd60AFAd67341AB79649098bC'; // From previous logs

async function run() {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const agentAddress = account.address;

    console.log('Checking Open Orders...');
    console.log('Agent Address:', agentAddress);
    console.log('Master Address:', MASTER_ADDRESS);

    try {
        console.log('\n--- Querying Master Address ---');
        const masterOrders = await getOpenOrders(MASTER_ADDRESS);
        console.log('Master Orders:', masterOrders);

        console.log('\n--- Querying Agent Address ---');
        const agentOrders = await getOpenOrders(agentAddress);
        console.log('Agent Orders:', agentOrders);

        if (masterOrders.length === 0 && agentOrders.length > 0) {
            console.log('\n[!] CONCLUSION: The order is on the AGENT address (acting as a standalone wallet), not the Master.');
            console.log('This means the Agent is likely NOT correctly linked or the SDK is treating it as a main account.');
        } else if (masterOrders.length > 0) {
            console.log('\n[!] CONCLUSION: The order IS on the Master address.');
            console.log('If UI is not showing it, check if UI is connected to:', MASTER_ADDRESS);
        }

    } catch (error) {
        console.error('Error fetching orders:', error);
    }
}

run();
