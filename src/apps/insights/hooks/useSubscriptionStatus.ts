import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSubscriptionStatus } from '../api/insightsApi';
import type { SubscriptionRecord } from '../types';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

interface UseSubscriptionStatusOptions {
  enabled?: boolean;
  pollIntervalMs?: number;
}

export const useSubscriptionStatus = (
  eoaAddress?: string | null,
  options: UseSubscriptionStatusOptions = {}
) => {
  const normalizedAddress = useMemo(
    () => eoaAddress?.toLowerCase() ?? undefined,
    [eoaAddress]
  );
  const isEnabled = Boolean(normalizedAddress) && (options.enabled ?? true);
  const pollIntervalMs = options.pollIntervalMs ?? 10000;

  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(isEnabled);
  const [error, setError] = useState<Error | null>(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!isEnabled || !normalizedAddress) {
      setSubscription(null);
      setLoading(false);
      return null;
    }

    try {
      setLoading(true);
      const result = await getSubscriptionStatus(normalizedAddress);
      setSubscription(result.subscription ?? null);
      setError(null);
      return result.subscription ?? null;
    } catch (err) {
      const resolvedError =
        err instanceof Error
          ? err
          : new Error('Unable to fetch subscription status.');
      setError(resolvedError);
      setSubscription(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [isEnabled, normalizedAddress]);

  useEffect(() => {
    if (!isEnabled) {
      setLoading(false);
      setSubscription(null);
      setPolling(false);
      return;
    }

    fetchStatus();
  }, [isEnabled, fetchStatus]);

  useEffect(() => {
    if (!polling || !isEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return undefined;
    }

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [polling, isEnabled, pollIntervalMs, fetchStatus]);

  const startPolling = useCallback(() => {
    if (isEnabled) {
      setPolling(true);
    }
  }, [isEnabled]);

  const stopPolling = useCallback(() => {
    setPolling(false);
  }, []);

  const isActive = useMemo(() => {
    if (!subscription) {
      return false;
    }

    if (subscription.isActive === true) {
      return true;
    }

    const normalizedStatus = subscription.status?.toLowerCase();
    if (!normalizedStatus || !ACTIVE_STATUSES.has(normalizedStatus)) {
      return false;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const periodEndSeconds =
      typeof subscription.currentPeriodEnd === 'number'
        ? subscription.currentPeriodEnd
        : null;

    if (periodEndSeconds && periodEndSeconds < nowSeconds) {
      return false;
    }

    const trialEndSeconds =
      typeof subscription.trialEnd === 'number' ? subscription.trialEnd : null;

    if (
      normalizedStatus === 'trialing' &&
      trialEndSeconds &&
      trialEndSeconds < nowSeconds
    ) {
      return false;
    }

    return true;
  }, [subscription]);

  return {
    subscription,
    loading,
    error,
    isActive,
    refetch: fetchStatus,
    polling,
    startPolling,
    stopPolling,
  };
};
