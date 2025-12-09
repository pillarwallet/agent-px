/**
 * Insights App API Service
 * Handles all API calls to Firebase Functions for the Insights app
 */
import type { SubscriptionApiResponse } from '../types';

// TODO: Get Firebase Functions base URL from environment/config
const getBaseUrl = () => {
  // In production, this should be the actual Firebase Functions URL
  // For now, using a placeholder - should be configured via environment variable
  return import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || 'http://localhost:5000/pillarx-staging/us-central1';
};

/**
 * Fetch sparkline data for a trading signal
 */
export const fetchSparklineData = async (ticker: string, startTime: number, endTime: number) => {
  try {
    const response = await fetch(`${getBaseUrl()}/insights/sparkline-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticker,
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching sparkline data:', error);
    throw error;
  }
};

/**
 * Get all trading signals
 */
export const getTradingSignals = async () => {
  try {
    const response = await fetch(`${getBaseUrl()}/insights/trading-signals`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching trading signals:', error);
    throw error;
  }
};

/**
 * Update signal prices
 */
export const updateSignalPrices = async () => {
  try {
    const response = await fetch(`${getBaseUrl()}/insights/update-signal-prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error('Error updating signal prices:', error);
    return { data: null, error };
  }
};

/**
 * Recalculate historical PnL
 */
export const recalculateHistoricalPnL = async (signalId?: string) => {
  try {
    const url = `${getBaseUrl()}/insights/recalculate-historical-pnl`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signalId ? { id: signalId } : {}),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    console.error('Error recalculating historical PnL:', error);
    return { data: null, error };
  }
};

/**
 * Webhook receiver for trading signals
 */
export const webhookReceiver = async (signalData: any) => {
  try {
    const response = await fetch(`${getBaseUrl()}/insights/webhook-receiver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signalData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in webhook receiver:', error);
    throw error;
  }
};

/**
 * Fetch subscription status for an EOA address
 */
export const getSubscriptionStatus = async (
  eoaAddress: string
): Promise<SubscriptionApiResponse> => {
  const normalizedAddress = eoaAddress?.trim().toLowerCase();
  if (!normalizedAddress) {
    throw new Error('An eoaAddress is required to load subscription status.');
  }

  const response = await fetch(
    `${getBaseUrl()}/subscriptions/${normalizedAddress}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (response.status === 404) {
    return { subscription: null };
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `Failed to load subscription status (${response.status})`
    );
  }

  return (await response.json()) as SubscriptionApiResponse;
};

