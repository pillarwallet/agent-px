import { useMemo } from 'react';
import { useAccount } from 'wagmi';

import {
  getPhoneOtpAddressFromPrivateKey,
  getUnlockedPhoneOtpPrivateKey,
  isPhoneOtpAuthenticated,
} from '../utils/phoneOtpAuth';

type AuthSource = 'phoneOtp' | 'nativeApp' | 'walletConnect';

type AuthLinkedAccount = {
  type: 'wallet';
  address: string;
  connectorType?: string;
};

type AuthUser = {
  id: string;
  email?: {
    address?: string;
  } | null;
  wallet: {
    address: string;
    connectorType?: string;
  };
  linkedAccounts: AuthLinkedAccount[];
};

const getStoredValue = (key: string) => {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem(key) || undefined;
};

const getDevicePlatform = () => {
  if (typeof window === 'undefined') return undefined;

  const searchParams = new URLSearchParams(window.location.search);
  return (
    searchParams.get('devicePlatform') || getStoredValue('DEVICE_PLATFORM')
  );
};

const isNativeAppRuntime = () => {
  const devicePlatform = getDevicePlatform();
  return devicePlatform === 'ios' || devicePlatform === 'android';
};

const normalizeConnectorType = (connectorId?: string) => {
  if (!connectorId) return undefined;
  return connectorId === 'walletConnect' ? 'wallet_connect' : connectorId;
};

export const useAuthAccount = () => {
  const {
    address: wagmiAddress,
    chainId,
    connector,
    isConnected,
  } = useAccount();
  const phoneOtpPrivateKey = getUnlockedPhoneOtpPrivateKey();

  const phoneOtpAddress = useMemo(() => {
    if (!phoneOtpPrivateKey || !isPhoneOtpAuthenticated()) return undefined;

    try {
      return getPhoneOtpAddressFromPrivateKey(phoneOtpPrivateKey);
    } catch {
      return undefined;
    }
  }, [phoneOtpPrivateKey]);

  const nativeAppAddress = isNativeAppRuntime()
    ? getStoredValue('EOA_ADDRESS')
    : undefined;
  const walletAddress = phoneOtpAddress ?? nativeAppAddress ?? wagmiAddress;

  let source: AuthSource | undefined;
  if (phoneOtpAddress) {
    source = 'phoneOtp';
  } else if (nativeAppAddress) {
    source = 'nativeApp';
  } else if (isConnected && wagmiAddress) {
    source = 'walletConnect';
  }

  const linkedAccounts = useMemo<AuthLinkedAccount[]>(
    () =>
      isConnected && wagmiAddress
        ? [
            {
              type: 'wallet',
              address: wagmiAddress,
              connectorType: normalizeConnectorType(connector?.id),
            },
          ]
        : [],
    [connector?.id, isConnected, wagmiAddress]
  );

  const user = useMemo<AuthUser | null>(
    () =>
      walletAddress
        ? {
            id: `${source ?? 'account'}:${walletAddress.toLowerCase()}`,
            wallet: {
              address: walletAddress,
              connectorType: source,
            },
            linkedAccounts,
          }
        : null,
    [linkedAccounts, source, walletAddress]
  );

  return useMemo(
    () => ({
      ready: true,
      authenticated: Boolean(source && walletAddress),
      user,
      walletAddress,
      address: walletAddress,
      chainId,
      source,
    }),
    [chainId, source, user, walletAddress]
  );
};

export type { AuthLinkedAccount, AuthSource, AuthUser };
