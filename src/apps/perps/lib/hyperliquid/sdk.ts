import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import type { Hex } from 'viem';

/**
 * Creates an ExchangeClient configured with an agent's private key
 */
export function getExchangeClientForAgent(privateKey: Hex): ExchangeClient {
  const transport = new HttpTransport();
  return new ExchangeClient({ wallet: privateKey, transport });
}

/**
 * Place a market order using the agent wallet
 */
export async function placeMarketOrderAgent(
  privateKey: Hex,
  params: {
    coinId: number;
    isBuy: boolean;
    size: number;
    currentPrice: number;
    reduceOnly?: boolean;
  }
): Promise<any> {
  const client = getExchangeClientForAgent(privateKey);

  // Use 5% slippage to stay within Hyperliquid's 95% rule
  // For closing positions (reduce-only), checking price might be less critical if we just want out,
  // but we still need a limit price for the IOc order.
  const marketPrice = params.isBuy
    ? (params.currentPrice * 1.05).toString()
    : (params.currentPrice * 0.95).toString();

  const orderRequest = {
    orders: [
      {
        a: params.coinId,
        b: params.isBuy,
        p: marketPrice,
        s: params.size.toString(),
        r: params.reduceOnly ?? false,
        t: { limit: { tif: 'Ioc' as const } },
      },
    ],
    grouping: 'na' as const,
  };

  console.log('[SDK] Placing market order:', orderRequest);
  const response = await client.order(orderRequest);
  console.log('[SDK] Order response:', response);

  return response;
}

/**
 * Place a limit order (for SL/TP) using the agent wallet
 */
export async function placeLimitOrderAgent(
  privateKey: Hex,
  params: {
    coinId: number;
    isBuy: boolean;
    size: number;
    limitPrice: number;
    reduceOnly?: boolean;
  }
): Promise<any> {
  const client = getExchangeClientForAgent(privateKey);

  const orderRequest = {
    orders: [
      {
        a: params.coinId,
        b: params.isBuy,
        p: params.limitPrice.toString(),
        s: params.size.toString(),
        r: params.reduceOnly ?? false,
        t: { limit: { tif: 'Gtc' as const } },
      },
    ],
    grouping: 'na' as const,
  };

  console.log('[SDK] Placing limit order:', orderRequest);
  const response = await client.order(orderRequest);
  console.log('[SDK] Order response:', response);

  return response;
}

/**
 * Approve an agent using the SDK
 */
export async function approveAgentSDK(
  masterPrivateKey: Hex,
  agentAddress: string,
  agentName?: string
): Promise<any> {
  const transport = new HttpTransport();
  const client = new ExchangeClient({ wallet: masterPrivateKey, transport });

  console.log('[SDK] Approving agent:', agentAddress);
  const response = await client.approveAgent({ agentAddress, agentName });
  console.log('[SDK] Approve response:', response);

  return response;
}
