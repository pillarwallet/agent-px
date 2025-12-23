
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

// Mock Browser Environment
(global as any).localStorage = {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { },
    clear: () => { },
    key: () => null,
    length: 0
};

// Start Test
async function runTest() {
    console.log('--- TEST: Hyperliquid Agent Flow (Local Simulation) ---');

    // Dynamic imports
    const { buildApproveAgentAction, getApproveAgentTypedData } = await import('../src/apps/perps/lib/hyperliquid/signing');
    const { generateAgentWallet } = await import('../src/apps/perps/lib/hyperliquid/keystore');
    const { postExchange } = await import('../src/apps/perps/lib/hyperliquid/client');

    // 1. Simulate User Wallet (Master Wallet)
    const masterPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const masterAccount = privateKeyToAccount(masterPrivateKey);
    const masterAddress = masterAccount.address;

    console.log(`\n1. Master Wallet: ${masterAddress}`);

    // 2. Generate Agent Wallet
    console.log('\n2. Generating Agent Wallet...');
    const agentWallet = generateAgentWallet();
    console.log(`   Agent Address: ${agentWallet.address}`);

    // 3. Build Approval Action
    console.log('\n3. Building Approval Action...');
    const actionConfig = buildApproveAgentAction({
        agentAddress: agentWallet.address,
        nonce: Date.now()
    });

    // Get EIP-712 Data using new helper
    const { domain, types, primaryType, message } = getApproveAgentTypedData(
        actionConfig.hyperliquidChain,
        actionConfig.signatureChainId,
        actionConfig.agentAddress,
        actionConfig.agentName,
        actionConfig.nonce
    );

    console.log('   Domain:', JSON.stringify(domain));
    console.log('   PrimaryType:', primaryType);
    console.log('   Message:', JSON.stringify(message));

    // 4. Sign Action (Simulating User Signing in Wallet)
    console.log('\n4. Signing Action (Local Simulation)...');

    const client = createWalletClient({
        account: masterAccount,
        chain: arbitrum,
        transport: http()
    });

    const signature = await client.signTypedData({
        domain,
        types,
        primaryType,
        message
    });

    console.log(`   Signature: ${signature}`);

    // 5. Construct Payload
    console.log('\n5. Constructing Payload...');
    const r = signature.slice(0, 66);
    const s = '0x' + signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);

    const payload = {
        action: actionConfig.action,
        nonce: actionConfig.nonce,
        signature: { r, s, v },
        vaultAddress: null,
    };

    console.log('   Payload:', JSON.stringify(payload, null, 2));

    // 6. Test API call
    console.log('\n6. Attempting API Call to Hyperliquid...');
    try {
        const result = await postExchange(payload);
        console.log('   API Success Result:', result);
    } catch (e: any) {
        console.log('   API Expected Error:', e.response?.data || e.message);
    }

    console.log('\n--- TEST COMPLETE ---');
}

runTest().catch(console.error);
