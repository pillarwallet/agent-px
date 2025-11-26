
import { fetchRelayRequestByHash } from './src/services/relayApi';
import { calculatePnLFromRelay } from './src/utils/pnl';

const TX_HASH = '0xb24bd94a44b0918cfecb3967ddd6c61f0a1c54c30db691a5ea4e73f70385825c';
// stETH on Optimism (assuming based on previous context, but need to verify chain)
// Actually, stETH is usually on Mainnet. Let's check the Relay response to see the chain.

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

        // Test PnL calculation
        // We need to know the token details to test calculatePnLFromRelay
        // Let's try to infer it from the response or test with common stETH addresses

        // Optimism stETH (wstETH?): 0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb
        // Mainnet stETH: 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84

        // We'll try to run it against a dummy token matching what we see in the logs
        if ((req.data as any)?.metadata) {
            console.log('Metadata:', (req.data as any).metadata);
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
};

runDebug();
