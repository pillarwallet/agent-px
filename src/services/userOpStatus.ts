import axios from 'axios';
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_ENABLED,
  ARC_TESTNET_RPC_URL,
} from '../utils/arcTestnet';

export const getUserOperationStatus = async (
  chainId: number,
  userOpHash: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | undefined> => {
  if (!chainId) {
    console.error('getUserOperationStatus: chainId is required');
    return undefined;
  }

  const isArcRpc = ARC_TESTNET_ENABLED && chainId === ARC_TESTNET_CHAIN_ID;
  const apiKey = import.meta.env.VITE_ETHERSPOT_DATA_API_KEY;

  if (!isArcRpc && !apiKey) {
    console.error('getUserOperationStatus: API key is missing');
    return undefined;
  }

  const url = isArcRpc
    ? ARC_TESTNET_RPC_URL
    : `https://rpc.etherspot.io/v2/${chainId}?api-key=${apiKey}`;

  try {
    const response = await axios.post(
      url,
      {
        id: 1,
        jsonrpc: '2.0',
        method: 'skandha_userOperationStatus',
        params: [userOpHash],
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.result;
  } catch (error) {
    console.error(
      'getUserOperationStatus: Failed to fetch user operation status',
      error
    );
    return undefined;
  }
};
