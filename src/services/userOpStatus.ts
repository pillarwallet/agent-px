import axios from 'axios';
import { getEtherspotBundlerUrl } from '../utils/bundler';

export const getUserOperationStatus = async (
  chainId: number,
  userOpHash: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | undefined> => {
  if (!chainId) {
    console.error('getUserOperationStatus: chainId is required');
    return undefined;
  }

  const apiKey = import.meta.env.VITE_ETHERSPOT_BUNDLER_API_KEY;

  if (!apiKey) {
    console.error('getUserOperationStatus: API key is missing');
    return undefined;
  }

  const url = getEtherspotBundlerUrl({ chainId, apiKey });

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
