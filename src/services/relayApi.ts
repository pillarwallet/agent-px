import axios from 'axios';

export interface RelayRequest {
  id: string;
  status: string;
  user: string;
  createdAt: string;
  updatedAt: string;
  in: {
    chainId: number;
    currency: string;
    amount: string;
    amountUsd?: string;
  };
  out: {
    chainId: number;
    currency: string;
    amount: string;
    amountUsd?: string;
  };
  fees?: {
    fixed: string;
    variable: string;
  };
  metadata?: {
    currencyIn?: {
      currency?: {
        address?: string;
        symbol?: string;
        decimals?: number;
      };
      amount?: string;
      amountFormatted?: string;
      amountUsd?: string;
    };
    currencyOut?: {
      currency?: {
        address?: string;
        symbol?: string;
        decimals?: number;
      };
      amount?: string;
      amountFormatted?: string;
      amountUsd?: string;
    };
  };
  data?: {
    inTxs?: Array<{
      hash?: string;
      chainId?: number;
      timestamp?: number;
      stateChanges?: Array<{
        change?: {
          data?: {
            tokenAddress?: string;
          };
          balanceDiff?: string;
        };
        address?: string;
      }>;
    }>;
    outTxs?: Array<{
      hash?: string;
      chainId?: number;
      timestamp?: number;
      stateChanges?: Array<{
        change?: {
          data?: {
            tokenAddress?: string;
          };
          balanceDiff?: string;
        };
        address?: string;
      }>;
    }>;
    metadata?: {
      currencyIn?: {
        currency?: {
          address?: string;
          symbol?: string;
          decimals?: number;
        };
        amount?: string;
        amountFormatted?: string;
        amountUsd?: string;
      };
      currencyOut?: {
        currency?: {
          address?: string;
          symbol?: string;
          decimals?: number;
        };
        amount?: string;
        amountFormatted?: string;
        amountUsd?: string;
      };
    };
  };
}

export interface RelayRequestsResponse {
  requests: RelayRequest[];
  nextCursor?: string;
}

const RELAY_API_URL = 'https://api.relay.link';

export const fetchRelayRequests = async (
  userAddress: string,
  status: string = 'filled'
): Promise<RelayRequest[]> => {
  try {
    const response = await axios.get<RelayRequestsResponse>(
      `${RELAY_API_URL}/requests`,
      {
        params: {
          user: userAddress,
          status,
        },
        timeout: 5000,
      }
    );
    return response.data.requests || [];
  } catch (error) {
    console.error('Failed to fetch Relay requests:', error);
    return [];
  }
};

export const fetchRelayRequestByHash = async (
  txHash: string
): Promise<RelayRequest | null> => {
  try {
    const response = await axios.get<{ requests: RelayRequest[] }>(
      `${RELAY_API_URL}/requests/v2`,
      {
        params: {
          hash: txHash,
        },
        timeout: 5000,
      }
    );
    // v2 API returns { requests: [...] }
    const requests = response.data?.requests || [];
    return requests.length > 0 ? requests[0] : null;
  } catch (error) {
    // 404 means transaction not found in Relay, which is expected
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    console.error(`Failed to fetch Relay request for hash ${txHash}:`, error);
    return null;
  }
};
export const fetchRelayRequestsByUser = async (
  userAddress: string
): Promise<RelayRequest[]> => {
  try {
    const response = await axios.get('https://api.relay.link/requests/v2', {
      params: {
        user: userAddress,
      },
      timeout: 5000,
    });

    if (response.data && Array.isArray(response.data.requests)) {
      return response.data.requests;
    }

    // Fallback if structure is different (e.g. just array)
    if (Array.isArray(response.data)) {
      return response.data;
    }

    return [];
  } catch (error) {
    console.error('Error fetching Relay requests by user:', error);
    return [];
  }
};
