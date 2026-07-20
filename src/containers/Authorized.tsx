/* eslint-disable @typescript-eslint/no-use-before-define */
import { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { Account, WalletClient } from 'viem';
import { useAccount, useConnect } from 'wagmi';

// components
import BottomMenu from '../components/BottomMenu';
import ConnectionDebug, { DebugInfo } from '../components/ConnectionDebug';
import DebugPanel from '../components/DebugPanel';
import Loading from '../pages/Loading';

// hooks
import { useAuthAccount } from '../hooks/useAuthAccount';

// providers
import AccountTransactionHistoryProvider from '../providers/AccountTransactionHistoryProvider';
import BottomMenuModalProvider from '../providers/BottomMenuModalProvider';
import { EtherspotTransactionKitProvider } from '../providers/EtherspotTransactionKitProvider';
import GlobalTransactionBatchesProvider from '../providers/GlobalTransactionsBatchProvider';
import SelectedChainsHistoryProvider from '../providers/SelectedChainsHistoryProvider';
import { getExtensionViewContext } from '../utils/extensionRuntime';
import type { EtherspotTransactionKitConfig } from '../utils/nativeTransactionKit';

/**
 * @name Authorized
 * @description This component is the main entry point for the users
 * that are considered authenticated. It wraps the entire <Outlet />
 * with the providers needed for the application to function.
 */
export default function Authorized({
  provider,
  chainId,
  customAccount,
}: {
  provider: WalletClient;
  chainId: number;
  customAccount?: Account;
}) {
  const [showAnimation, setShowAnimation] = useState(true);

  // Get hooks for debug info
  const { authenticated, ready, user } = useAuthAccount();
  const { connectors, isPending, error } = useConnect();
  const { address, isConnected, isConnecting } = useAccount();

  // Get WalletConnect connector
  const walletConnectConnector = connectors.find(
    ({ id }) => id === 'walletConnect'
  );
  const authUserId = user?.id;
  const authUserEmailAddress = user?.email?.address;
  const authUserWalletAddress = user?.wallet?.address;
  const walletConnectConnectorId = walletConnectConnector?.id;
  const walletConnectConnectorName = walletConnectConnector?.name;
  const walletConnectConnectorReady = walletConnectConnector?.ready;

  useEffect(() => {
    // Check if we're coming from token-atlas
    const urlParams = new URLSearchParams(window.location.search);
    const fromTokenAtlas = urlParams.get('from') === 'token-atlas';

    if (fromTokenAtlas) {
      // Skip animation when coming from token-atlas
      setShowAnimation(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setShowAnimation(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const debugInfo = useMemo<DebugInfo>(() => {
    const resolvedAuthUser = authUserId
      ? {
          id: authUserId,
          email: authUserEmailAddress,
          wallet: authUserWalletAddress,
        }
      : null;
    const resolvedWalletConnectConnector = walletConnectConnectorId
      ? {
          id: walletConnectConnectorId,
          name: walletConnectConnectorName,
          ready: Boolean(walletConnectConnectorReady),
        }
      : null;

    return {
      auth: {
        authenticated,
        ready,
        user: resolvedAuthUser,
      },
      wagmi: {
        address,
        isConnected,
        isConnecting,
        isPending,
        error: error?.message,
        connectorsCount: connectors.length,
        connectorIds: connectors.map((c) => c.id),
        walletConnectConnector: resolvedWalletConnectConnector,
      },
    };
  }, [
    authenticated,
    ready,
    authUserId,
    authUserEmailAddress,
    authUserWalletAddress,
    address,
    isConnected,
    isConnecting,
    isPending,
    error?.message,
    connectors,
    walletConnectConnectorId,
    walletConnectConnectorName,
    walletConnectConnectorReady,
  ]);

  // Memoize the config to prevent unnecessary kit recreation
  // Etherspot delegated EOA mode uses the active viem account.
  const kitConfig = useMemo(() => {
    const providerAccount =
      typeof provider.account === 'object' && provider.account !== null
        ? (provider.account as Account)
        : undefined;

    const resolvedViemAccount = customAccount ?? providerAccount;

    const accountConfig = resolvedViemAccount
      ? { viemLocalAccount: resolvedViemAccount }
      : {};

    return {
      provider,
      chainId,
      ...accountConfig,
      bundlerApiKey: import.meta.env.VITE_ETHERSPOT_BUNDLER_API_KEY,
      walletMode: 'delegatedEoa',
    } as EtherspotTransactionKitConfig;
  }, [provider, chainId, customAccount]);
  const isExtensionSidePanelMode = getExtensionViewContext() === 'sidePanel';

  if (showAnimation) {
    return <Loading type="enter" />;
  }

  return (
    <EtherspotTransactionKitProvider config={kitConfig}>
      <AccountTransactionHistoryProvider>
        <GlobalTransactionBatchesProvider>
          <BottomMenuModalProvider>
            <SelectedChainsHistoryProvider>
              <AuthContentWrapper
                $isExtensionSidePanelMode={isExtensionSidePanelMode}
              >
                <Outlet />
              </AuthContentWrapper>
              <BottomMenu />

              {/* Debug Panel - shown when debug_connections is enabled */}
              {localStorage.getItem('debug_connections') === 'true' && (
                <DebugPanel title="Connection Debug">
                  <ConnectionDebug
                    debugInfo={debugInfo}
                    onDisconnect={() => {
                      // This will be handled by the comprehensive logout utility
                      // when the user logs out through the normal flow
                    }}
                  />
                </DebugPanel>
              )}
            </SelectedChainsHistoryProvider>
          </BottomMenuModalProvider>
        </GlobalTransactionBatchesProvider>
      </AccountTransactionHistoryProvider>
    </EtherspotTransactionKitProvider>
  );
}

const AuthContentWrapper = styled.div<{
  $isExtensionSidePanelMode?: boolean;
}>`
  margin: 0 auto;

  ${({ $isExtensionSidePanelMode }) =>
    $isExtensionSidePanelMode &&
    `
      width: 100%;
      height: 100dvh;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-bottom: 112px;

      html.pillarx-no-page-scroll & {
        overflow: hidden;
      }
    `}
`;
