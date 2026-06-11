/* eslint-disable react/jsx-no-constructed-context-values */
import {
  EtherspotTransactionKit,
  EtherspotTransactionKitConfig,
} from '@etherspot/transaction-kit';
import React, {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { WalletClient } from 'viem';

import type { WalletProviderLike } from '../types/walletProvider';
import {
  ARC_TESTNET_ENABLED,
  createArcTransactionKitAdapter,
} from '../utils/arcTestnet';

export interface EtherspotTransactionKitContextType {
  data: {
    kit: EtherspotTransactionKit;
    walletAddress: string | undefined;
    setWalletAddress: React.Dispatch<React.SetStateAction<string | undefined>>;
    walletProvider: WalletProviderLike | undefined;
  };
}

export const EtherspotTransactionKitContext =
  createContext<EtherspotTransactionKitContextType | null>(null);

interface EtherspotTransactionKitProviderProps {
  config: EtherspotTransactionKitConfig;
  children: React.ReactNode;
}

export const EtherspotTransactionKitProvider: React.FC<
  EtherspotTransactionKitProviderProps
> = ({ config, children }) => {
  const [walletAddress, setWalletAddress] = useState<string>();
  const kitRef = useRef<EtherspotTransactionKit | null>(null);
  const [externalProvider, setExternalProvider] = useState<
    WalletProviderLike | undefined
  >(() =>
    'provider' in config
      ? (config as { provider?: WalletProviderLike }).provider
      : undefined
  );
  const configuredProvider =
    'provider' in config
      ? (config as { provider?: WalletProviderLike }).provider
      : undefined;
  const arcWalletClient =
    configuredProvider && 'account' in configuredProvider
      ? (configuredProvider as WalletClient)
      : undefined;

  // Create kit with config
  const kit = useMemo(() => {
    if (ARC_TESTNET_ENABLED) {
      return null;
    }

    const newKit = new EtherspotTransactionKit(config);
    kitRef.current = newKit;
    return newKit;
  }, [config]);
  const arcKit = useMemo(() => {
    if (!ARC_TESTNET_ENABLED || !arcWalletClient) {
      return null;
    }

    return createArcTransactionKitAdapter({
      walletClient: arcWalletClient,
      walletProvider: configuredProvider,
    });
  }, [arcWalletClient, configuredProvider]);
  const activeKit = arcKit ?? kit;

  // Get wallet address when kit changes
  useEffect(() => {
    const getWalletAddress = async () => {
      if (!activeKit) return;

      try {
        const address = await activeKit.getWalletAddress();
        setWalletAddress(address);
      } catch (error) {
        console.error('Failed to get wallet address:', error);
      }
    };

    getWalletAddress();
  }, [activeKit]);

  useEffect(() => {
    setExternalProvider(
      'provider' in config
        ? (config as { provider?: WalletProviderLike }).provider
        : undefined
    );
  }, [config]);

  const contextData = useMemo(
    () => ({
      walletAddress,
      setWalletAddress,
      kit: (activeKit ?? arcKit ?? kit) as EtherspotTransactionKit,
      walletProvider: externalProvider,
    }),
    [walletAddress, activeKit, arcKit, kit, externalProvider]
  );

  return (
    <EtherspotTransactionKitContext.Provider value={{ data: contextData }}>
      {children}
    </EtherspotTransactionKitContext.Provider>
  );
};
