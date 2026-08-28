/* eslint-disable import/extensions */
import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  createBrowserRouter,
  createHashRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { createWalletClient, custom, http, WalletClient } from 'viem';
import { toAccount } from 'viem/accounts';
import type {
  Account,
  AuthorizationRequest,
  Hash,
  SignedAuthorization,
  TransactionSerializable,
  TypedData,
  TypedDataDefinition,
} from 'viem';
import { mainnet } from 'viem/chains';
import { createConfig, useAccount, useConnect, WagmiProvider } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';

// theme
import { defaultTheme, GlobalStyle } from '../theme';

// providers
import AllowedAppsProvider from '../providers/AllowedAppsProvider';
import LanguageProvider from '../providers/LanguageProvider';

// utils
import { getNetworkViem } from '../apps/deposit/utils/blockchain';
import { getChainRpcUrl, visibleChains } from '../utils/blockchain';
import {
  signAuthorizationViaWebView,
  signMessageViaWebView,
  signTransactionViaWebView,
  signTypedDataViaWebView,
} from '../utils/pillarWalletMessaging';
import {
  signAuthorizationViaPillarKeyring,
  signMessageViaPillarKeyring,
  signTransactionViaPillarKeyring,
  signTypedDataViaPillarKeyring,
} from '../utils/pillarKeyringMessaging';
import {
  PHONE_OTP_AUTH_STATE_EVENT,
  getUnlockedPhoneOtpAddress,
  hydrateUnlockedPhoneOtpAddressFromKeyring,
  isPhoneOtpAuthenticated,
} from '../utils/phoneOtpAuth';
import {
  isExtensionPopupView,
  isExtensionRuntime,
} from '../utils/extensionRuntime';

// pages
import Advertising from '../pages/Advertising';
import Developers from '../pages/Developers';
import LandingPage from '../pages/Landing';
import Loading from '../pages/Loading';
import Lobby from '../pages/Lobby';
import Login from '../pages/Login';
import NotFound from '../pages/NotFound';
import Privacy from '../pages/Privacy';
import Waitlist from '../pages/WaitList';
import Authorized from './Authorized';

// hooks
import useAllowedApps from '../hooks/useAllowedApps';
import { useAuthAccount } from '../hooks/useAuthAccount';

// UI
import App from '../pages/App';
import { OUR_EIP7702_IMPLEMENTATION_ADDRESS } from '../utils/eip7702Authorization';

/**
 * @name AuthLayout
 * @description This component's primary responsibility
 * is to manage the application's authentication flow. If
 * the user is authenticated, it will render the Authorized
 * component which contains the main application logic. If
 * the user is not authenticated, it will render the routes
 * only available to unauthenticated users.
 * @returns
 */
const AuthLayout = () => {
  /**
   * Import all the hooks, states and other variables
   * we will need to determine what authentication
   * state the user is in.
   */
  const { ready, authenticated, user } = useAuthAccount();

  const { connectors } = useConnect();
  const { isConnected: wagmiIsConnected } = useAccount();
  const isExtensionRuntimeEnabled = isExtensionRuntime();
  const isExtensionPopupMode = isExtensionPopupView();
  const [provider, setProvider] = useState<WalletClient | undefined>(undefined);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [isPhoneOtpUnlockStateHydrated, setIsPhoneOtpUnlockStateHydrated] =
    useState(!isExtensionRuntimeEnabled);
  const { allowed } = useAllowedApps();
  const [, setPhoneOtpAuthStateVersion] = useState(0);
  const phoneOtpAuthEnabled = isPhoneOtpAuthenticated();
  const phoneOtpAddress = phoneOtpAuthEnabled
    ? getUnlockedPhoneOtpAddress()
    : undefined;
  const [eoaAddress, setEoaAddress] = useState<string | undefined>(
    phoneOtpAddress
  );
  const [customAccount, setCustomAccount] = useState<Account | undefined>(
    undefined
  );
  const previouslyAuthenticated = isExtensionRuntimeEnabled
    ? phoneOtpAuthEnabled
    : authenticated || phoneOtpAuthEnabled;
  const isAppReady = isExtensionRuntimeEnabled
    ? isPhoneOtpUnlockStateHydrated
    : ready;
  const isAuthenticated = isExtensionRuntimeEnabled
    ? phoneOtpAuthEnabled && !!phoneOtpAddress
    : authenticated ||
      wagmiIsConnected ||
      !!eoaAddress ||
      (phoneOtpAuthEnabled && !!phoneOtpAddress);
  const createRouter = isExtensionRuntimeEnabled
    ? createHashRouter
    : createBrowserRouter;

  // Minimal Sentry context for authentication state - only set on errors
  useEffect(() => {
    // Only set context if there's an authentication error
    if (!isAuthenticated && ready && isAppReady) {
      Sentry.setContext('authentication_state', {
        ready,
        authenticated,
        isAppReady,
        isAuthenticated,
        timestamp: new Date().toISOString(),
        wagmiIsConnected,
        hasUser: !!user,
        userAddress: user?.wallet?.address,
      });
    }
  }, [
    ready,
    authenticated,
    isAppReady,
    isAuthenticated,
    user,
    wagmiIsConnected,
  ]);

  useEffect(() => {
    const handlePhoneOtpAuthStateChange = () => {
      setPhoneOtpAuthStateVersion((previousVersion) => previousVersion + 1);
    };

    window.addEventListener(
      PHONE_OTP_AUTH_STATE_EVENT,
      handlePhoneOtpAuthStateChange
    );

    return () => {
      window.removeEventListener(
        PHONE_OTP_AUTH_STATE_EVENT,
        handlePhoneOtpAuthStateChange
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydratePhoneOtpUnlockState = async () => {
      if (!isExtensionRuntimeEnabled) {
        if (!cancelled) {
          setIsPhoneOtpUnlockStateHydrated(true);
        }
        return;
      }

      try {
        await hydrateUnlockedPhoneOtpAddressFromKeyring();
      } finally {
        if (!cancelled) {
          setIsPhoneOtpUnlockStateHydrated(true);
        }
      }
    };

    hydratePhoneOtpUnlockState();

    return () => {
      cancelled = true;
    };
  }, [isExtensionRuntimeEnabled]);

  useEffect(() => {
    if (!authenticated) return;
    sessionStorage.setItem('loginPageReloaded', 'false');
  }, [authenticated]);

  useEffect(() => {
    if (!phoneOtpAddress) return;
    if (localStorage.getItem('EOA_ADDRESS') === phoneOtpAddress) return;

    localStorage.setItem('EOA_ADDRESS', phoneOtpAddress);
  }, [phoneOtpAddress]);

  /**
   * Set up Pillar Wallet webview messaging and extract eoaAddress
   * Only activate when coming from React Native app (iOS or Android)
   */
  useEffect(() => {
    // Check if request is from React Native app
    const searchParams = new URLSearchParams(window.location.search);
    const devicePlatformFromUrl = searchParams.get('devicePlatform');
    const devicePlatformFromStorage = localStorage.getItem('DEVICE_PLATFORM');
    const eoaAddressFromUrl = searchParams.get('eoaAddress');

    // Check both URL params and localStorage to determine if we're in React Native
    const devicePlatform = devicePlatformFromUrl || devicePlatformFromStorage;
    const isReactNativeApp =
      devicePlatform === 'ios' || devicePlatform === 'android';

    Sentry.addBreadcrumb({
      category: 'authentication',
      message: 'Checking if Pillar Wallet messaging should be enabled',
      level: 'info',
      data: {
        devicePlatformFromUrl,
        devicePlatformFromStorage,
        devicePlatform,
        isReactNativeApp,
        eoaAddressFromUrl,
      },
    });

    // Only set up messaging if coming from React Native app
    if (isReactNativeApp) {
      // Store device platform in localStorage for persistence across navigation
      if (devicePlatformFromUrl) {
        localStorage.setItem('DEVICE_PLATFORM', devicePlatformFromUrl);
      }

      // Extract and store eoaAddress from URL query string
      if (eoaAddressFromUrl) {
        localStorage.setItem('EOA_ADDRESS', eoaAddressFromUrl);
        setEoaAddress(eoaAddressFromUrl);
      } else {
        // Try to restore from localStorage if URL doesn't have it (e.g., on reload)
        const storedEoaAddress = localStorage.getItem('EOA_ADDRESS');
        if (storedEoaAddress) {
          setEoaAddress(storedEoaAddress);
        }
      }

      Sentry.addBreadcrumb({
        category: 'authentication',
        message:
          'Setting up Pillar Wallet webview messaging (custom account mode)',
        level: 'info',
        data: {
          devicePlatform,
          eoaAddress: eoaAddressFromUrl || localStorage.getItem('EOA_ADDRESS'),
        },
      });

      // Note: We no longer request private keys - signing is handled via custom account
      // The private key remains stored securely in the React Native app
    }

    // If user was previously authenticated (EOA_ADDRESS exists) but we're not in RN context,
    // the eoaAddress will need to be re-requested on next RN webview load.
    const storedEoaAddress = localStorage.getItem('EOA_ADDRESS');
    if (storedEoaAddress && !isReactNativeApp) {
      Sentry.addBreadcrumb({
        category: 'authentication',
        message:
          'Previous RN authentication detected, but eoaAddress not available',
        level: 'info',
        data: {
          eoaAddress: storedEoaAddress,
          securityNote: 'eoaAddress must be re-requested from RN app',
        },
      });
    }

    // No cleanup needed
    return undefined;
  }, []);

  /**
   * The following useEffect is to detemine if the
   * user is logging in (or has logged in)  with a
   * private key or if the wallet state changed,
   * and if it did, update the provider (if any).
   * This would also re-render Authorized component with
   * the new state.
   */
  useEffect(() => {
    const providerSetupId = `provider_setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Start Sentry transaction for provider setup
    Sentry.setContext('provider_setup', {
      providerSetupId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ready,
      authenticated,
      hasUser: !!user,
      wagmiIsConnected,
      connectorsCount: connectors.length,
    });

    // Handle local wallets, native app accounts, and WalletConnect connections
    const updateProvider = async () => {
      // PRIORITY 1: Phone OTP authenticated extension keyring wallet
      if (phoneOtpAuthEnabled && phoneOtpAddress) {
        Sentry.addBreadcrumb({
          category: 'authentication',
          message: 'Setting up extension keyring provider from phone OTP login',
          level: 'info',
          data: {
            providerSetupId,
          },
        });

        const normalizedAccountAddress = phoneOtpAddress.toLowerCase();
        const currentProviderAccountAddress =
          typeof provider?.account === 'object' && provider.account !== null
            ? provider.account.address.toLowerCase()
            : undefined;
        const account = toAccount({
          address: phoneOtpAddress,
          async sign({ hash }: { hash: Hash }) {
            return signMessageViaPillarKeyring({
              address: phoneOtpAddress,
              message: { raw: hash },
            });
          },
          async signMessage({ message }) {
            return signMessageViaPillarKeyring({
              address: phoneOtpAddress,
              message,
            });
          },
          async signTransaction(transaction) {
            return signTransactionViaPillarKeyring({
              address: phoneOtpAddress,
              transaction: transaction as TransactionSerializable,
            });
          },
          async signTypedData(typedData) {
            return signTypedDataViaPillarKeyring({
              address: phoneOtpAddress,
              typedData: typedData as unknown as TypedDataDefinition,
            });
          },
          async signAuthorization(
            parameters: AuthorizationRequest
          ): Promise<SignedAuthorization> {
            const address =
              parameters.contractAddress ??
              parameters.address ??
              OUR_EIP7702_IMPLEMENTATION_ADDRESS;
            const authorizationParams: AuthorizationRequest =
              parameters.contractAddress
                ? {
                    contractAddress: address,
                    chainId: parameters.chainId,
                    nonce: parameters.nonce,
                  }
                : {
                    address,
                    chainId: parameters.chainId,
                    nonce: parameters.nonce,
                  };

            return signAuthorizationViaPillarKeyring({
              address: phoneOtpAddress,
              authorization: authorizationParams,
            });
          },
        });

        if (customAccount?.address.toLowerCase() !== normalizedAccountAddress) {
          setCustomAccount(account);
        }

        if (eoaAddress?.toLowerCase() !== normalizedAccountAddress) {
          setEoaAddress(phoneOtpAddress);
        }

        if (localStorage.getItem('EOA_ADDRESS') !== phoneOtpAddress) {
          localStorage.setItem('EOA_ADDRESS', phoneOtpAddress);
        }

        const walletChainId = 1;
        const isWithinVisibleChains = visibleChains.some(
          (chain) => chain.id === walletChainId
        );
        const targetChainId = isWithinVisibleChains
          ? walletChainId
          : visibleChains[0].id;

        const shouldRecreateProvider =
          currentProviderAccountAddress !== normalizedAccountAddress ||
          provider?.chain?.id !== walletChainId;

        if (shouldRecreateProvider) {
          const newProvider = createWalletClient({
            account,
            chain: getNetworkViem(walletChainId),
            transport: http(getChainRpcUrl(walletChainId)),
          });
          setProvider(newProvider);
        }

        if (chainId !== targetChainId) {
          setChainId(targetChainId);
        }

        Sentry.addBreadcrumb({
          category: 'authentication',
          message: 'Extension keyring provider setup completed',
          level: 'info',
          data: {
            providerSetupId,
            accountAddress: phoneOtpAddress,
            walletChainId,
          },
        });

        return;
      }

      // PRIORITY 2: React Native custom account (takes precedence over WalletConnect)
      if (eoaAddress) {
        Sentry.addBreadcrumb({
          category: 'authentication',
          message:
            'Setting up React Native custom account (priority authentication)',
          level: 'info',
          data: {
            providerSetupId,
            accountAddress: eoaAddress,
          },
        });

        const normalizedAccountAddress = eoaAddress.toLowerCase();
        const currentProviderAccountAddress =
          typeof provider?.account === 'object' && provider.account !== null
            ? provider.account.address.toLowerCase()
            : undefined;

        /**
         * @description Creates a custom account that delegates signing to the React Native app
         * @returns The custom account object
         */
        const account = toAccount({
          address: eoaAddress as `0x${string}`,
          // Low-level sign method for signing raw hashes
          async sign({ hash }: { hash: Hash }) {
            // Sign the raw hash directly (not as EIP-191 message)
            // Pass as { raw: hash } to indicate it's a raw hash that
            // shouldn't have EIP-191 prefix
            const signatureHex = await signMessageViaWebView({ raw: hash });
            return signatureHex;
          },
          /**
           * @description Signs a message via the React Native webview
           * @param message - The message object
           * @returns Promise that resolves with the signed message object
           */
          async signMessage({ message }) {
            return signMessageViaWebView(message);
          },
          /**
           * @description Signs a transaction via the React Native webview
           * @param transaction - The transaction object
           * @returns Promise that resolves with the signed transaction object
           */
          async signTransaction(transaction) {
            // Note: serializer is not used in our case since we send the
            // transaction to RN
            return signTransactionViaWebView(
              transaction as TransactionSerializable
            );
          },
          /**
           * @description Signs a typed data object via the React Native webview
           * @param typedData - The typed data object
           * @returns Promise that resolves with the signed typed data object
           */
          async signTypedData(typedData) {
            return signTypedDataViaWebView(typedData as unknown as TypedData);
          },
          /**
           * @description Signs an EIP-7702 authorization via the React Native webview
           * @param parameters - The authorization request parameters
           * @returns Promise that resolves with the signed authorization object
           */
          async signAuthorization(
            parameters: AuthorizationRequest
          ): Promise<SignedAuthorization> {
            // Ensure address is set (supports both 'address' and 'contractAddress' as
            // per viem's AuthorizationRequest type)
            // Use OUR_EIP7702_IMPLEMENTATION_ADDRESS as fallback if not provided
            const address =
              parameters.contractAddress ??
              parameters.address ??
              OUR_EIP7702_IMPLEMENTATION_ADDRESS;

            // Build authorization params - use either address or contractAddress, not both
            const authorizationParams: AuthorizationRequest =
              parameters.contractAddress
                ? {
                    contractAddress: address,
                    chainId: parameters.chainId,
                    nonce: parameters.nonce,
                  }
                : {
                    address,
                    chainId: parameters.chainId,
                    nonce: parameters.nonce,
                  };

            // Delegate signing to React Native app via webview
            // The RN app will handle hashing and signing using the private key account
            const signedAuthorization =
              await signAuthorizationViaWebView(authorizationParams);

            /**
             * NOTE: This is commented out but is being left in
             * just incase we need to verify the signature again
             * in future.
             */
            // Optional: Verify the signature (for debugging)
            // Serialize the signature to hex format for verification
            // if (!signedAuthorization.v) {
            //   throw new Error('Signature missing v value');
            // }
            // const vHex = signedAuthorization.v.toString(16).padStart(2, '0');
            // const signatureHex =
            //   `0x${signedAuthorization.r.slice(2)}${signedAuthorization.s.slice(2)}${vHex}` as `0x${string}`;

            // const valid = await verifyAuthorization({
            //   address: eoaAddress as `0x${string}`,
            //   authorization: {
            //     chainId: signedAuthorization.chainId,
            //     address: signedAuthorization.address,
            //     nonce: signedAuthorization.nonce,
            //   },
            //   signature: signatureHex,
            // });

            return signedAuthorization;
          },
        });

        if (customAccount?.address.toLowerCase() !== normalizedAccountAddress) {
          setCustomAccount(account);
        }

        const walletChainId = 1; // default chain id is 1 (mainnet)

        const isWithinVisibleChains = visibleChains.some(
          (chain) => chain.id === walletChainId
        );
        const targetChainId = isWithinVisibleChains
          ? walletChainId
          : visibleChains[0].id;

        const shouldRecreateProvider =
          currentProviderAccountAddress !== normalizedAccountAddress ||
          provider?.chain?.id !== walletChainId;

        if (shouldRecreateProvider) {
          const newProvider = createWalletClient({
            account,
            chain: getNetworkViem(walletChainId),
            transport: http(getChainRpcUrl(walletChainId)),
          });

          setProvider(newProvider);
        }

        if (chainId !== targetChainId) {
          setChainId(targetChainId);
        }

        Sentry.addBreadcrumb({
          category: 'authentication',
          message: 'React Native custom account provider setup completed',
          level: 'info',
          data: {
            providerSetupId,
            walletChainId,
            isWithinVisibleChains,
            finalChainId: isWithinVisibleChains
              ? walletChainId
              : visibleChains[0].id,
          },
        });

        return;
      } // END if (eoaAddress)

      // Don't run provider setup if auth is still initializing and we're not using WalletConnect
      if (!ready && !wagmiIsConnected && !isExtensionRuntimeEnabled) {
        Sentry.addBreadcrumb({
          category: 'authentication',
          message: 'Provider setup skipped - not ready',
          level: 'info',
          data: {
            providerSetupId,
            ready,
            wagmiIsConnected,
          },
        });

        return;
      }

      const isWalletConnectConnected = wagmiIsConnected;

      Sentry.addBreadcrumb({
        category: 'authentication',
        message: 'Provider setup debug info',
        level: 'info',
        data: {
          providerSetupId,
          isAuthenticated,
          isWalletConnectConnected,
          wagmiIsConnected,
          connectorsCount: connectors.length,
        },
      });

      // If no wallets and not connected via WalletConnect, return early
      if (!isWalletConnectConnected) {
        Sentry.addBreadcrumb({
          category: 'authentication',
          message: 'No wallets or WalletConnect connection detected',
          level: 'info',
          data: {
            providerSetupId,
            isWalletConnectConnected,
          },
        });

        return;
      }

      if (isWalletConnectConnected) {
        // Handle WalletConnect connection
        Sentry.addBreadcrumb({
          category: 'authentication',
          message: 'Attempting to setup WalletConnect provider',
          level: 'info',
          data: {
            providerSetupId,
            isWalletConnectConnected,
          },
        });

        try {
          // Find the WalletConnect connector
          const walletConnectConnector = connectors.find(
            ({ id }) => id === 'walletConnect'
          );

          Sentry.addBreadcrumb({
            category: 'authentication',
            message: 'WalletConnect connector search result',
            level: 'info',
            data: {
              providerSetupId,
              connectorFound: !!walletConnectConnector,
              connectorsCount: connectors.length,
              connectorIds: connectors.map((c) => c.id),
            },
          });

          if (walletConnectConnector) {
            // Get the WalletConnect provider
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wcProvider: any = await walletConnectConnector.getProvider();

            Sentry.addBreadcrumb({
              category: 'authentication',
              message: 'WalletConnect provider obtained',
              level: 'info',
              data: {
                providerSetupId,
                hasProvider: !!wcProvider,
                providerConnected: wcProvider?.connected,
                hasAccounts: wcProvider?.accounts?.length > 0,
              },
            });

            // Only proceed if the provider is actually connected
            if (
              wcProvider &&
              wcProvider.connected &&
              wcProvider.accounts &&
              wcProvider.accounts.length > 0
            ) {
              // Get the connected account
              const accounts = await wcProvider.request({
                method: 'eth_accounts',
              });
              const wcAccount = accounts[0];

              Sentry.addBreadcrumb({
                category: 'authentication',
                message: 'WalletConnect account retrieved',
                level: 'info',
                data: {
                  providerSetupId,
                  hasAccount: !!wcAccount,
                  accountAddress: wcAccount,
                  accountsCount: accounts.length,
                },
              });

              if (wcAccount) {
                const walletChainId = 1; // Default to mainnet
                const normalizedWalletConnectAccountAddress =
                  String(wcAccount).toLowerCase();
                const currentProviderAccountAddress =
                  typeof provider?.account === 'object' &&
                  provider.account !== null
                    ? provider.account.address.toLowerCase()
                    : undefined;
                const shouldRecreateProvider =
                  currentProviderAccountAddress !==
                    normalizedWalletConnectAccountAddress ||
                  provider?.chain?.id !== walletChainId;

                if (shouldRecreateProvider) {
                  const newProvider = createWalletClient({
                    account: wcAccount as `0x${string}`,
                    chain: getNetworkViem(walletChainId),
                    transport: custom(wcProvider),
                  });

                  setProvider(newProvider);
                }

                if (chainId !== walletChainId) {
                  setChainId(walletChainId);
                }

                Sentry.addBreadcrumb({
                  category: 'authentication',
                  message: 'WalletConnect provider setup successful',
                  level: 'info',
                  data: {
                    providerSetupId,
                    account: wcAccount,
                    chainId: walletChainId,
                    transport: 'custom(wcProvider)',
                    recreatedProvider: shouldRecreateProvider,
                  },
                });

                Sentry.captureMessage(
                  'WalletConnect provider setup completed successfully',
                  {
                    level: 'info',
                    tags: {
                      component: 'authentication',
                      action: 'walletconnect_setup_success',
                      providerSetupId,
                    },
                    contexts: {
                      walletconnect_success: {
                        providerSetupId,
                        account: wcAccount,
                        chainId: walletChainId,
                        transport: 'custom(wcProvider)',
                        recreatedProvider: shouldRecreateProvider,
                      },
                    },
                  }
                );

                return;
              }

              Sentry.captureMessage('No WalletConnect account found', {
                level: 'warning',
                tags: {
                  component: 'authentication',
                  action: 'walletconnect_no_account',
                  providerSetupId,
                },
                contexts: {
                  walletconnect_error: {
                    providerSetupId,
                    hasProvider: !!wcProvider,
                    providerConnected: wcProvider?.connected,
                    accountsCount: wcProvider?.accounts?.length || 0,
                  },
                },
              });
            } else {
              Sentry.captureMessage(
                'WalletConnect provider not connected or no accounts',
                {
                  level: 'warning',
                  tags: {
                    component: 'authentication',
                    action: 'walletconnect_not_connected',
                    providerSetupId,
                  },
                  contexts: {
                    walletconnect_error: {
                      providerSetupId,
                      hasProvider: !!wcProvider,
                      providerConnected: wcProvider?.connected,
                      hasAccounts: wcProvider?.accounts?.length > 0,
                    },
                  },
                }
              );
            }
          } else {
            Sentry.captureMessage('WalletConnect connector not found', {
              level: 'error',
              tags: {
                component: 'authentication',
                action: 'walletconnect_connector_missing',
                providerSetupId,
              },
              contexts: {
                walletconnect_error: {
                  providerSetupId,
                  connectorsCount: connectors.length,
                  connectorIds: connectors.map((c) => c.id),
                },
              },
            });
          }
        } catch (error) {
          console.error('Error setting up WalletConnect provider:', error);

          Sentry.captureException(error, {
            tags: {
              component: 'authentication',
              action: 'walletconnect_setup_error',
              providerSetupId,
            },
            contexts: {
              walletconnect_error: {
                providerSetupId,
                error: error instanceof Error ? error.message : String(error),
                isWalletConnectConnected,
              },
            },
          });
        }
      }

      if (isWalletConnectConnected && !chainId) {
        // For WalletConnect, default to mainnet if no chain ID is set
        setChainId(1);

        Sentry.addBreadcrumb({
          category: 'authentication',
          message: 'Chain ID set for WalletConnect',
          level: 'info',
          data: {
            providerSetupId,
            finalChainId: 1,
          },
        });
      }
    };
    updateProvider();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    wagmiIsConnected,
    eoaAddress,
    customAccount,
    provider,
    chainId,
    phoneOtpAuthEnabled,
    phoneOtpAddress,
  ]);

  /**
   * If all the following variables are truthy within the if
   * statement, we can consider this user as logged in and
   * authenticated.
   */
  if (isAppReady && isAuthenticated && provider && chainId) {
    /**
     * Define our authorized routes for users that are
     * authenticated. There are a few steps here.
     */

    Sentry.addBreadcrumb({
      category: 'authentication',
      message: 'User authenticated - setting up authorized routes',
      level: 'info',
      data: {
        isAppReady,
        isAuthenticated,
        hasProvider: !!provider,
        chainId,
        hasUser: !!user,
        wagmiIsConnected,
      },
    });

    // First, add the core routes to the route definition
    const authorizedRoutesDefinition = [
      {
        path: '/',
        element: (
          <Authorized
            chainId={chainId}
            provider={provider}
            customAccount={customAccount}
          />
        ),
        children: [
          {
            index: true,
            path: '/',
            element: <Lobby />,
          },
          {
            path: '/landing',
            element: <LandingPage />,
          },
          {
            path: '/waitlist',
            element: <Waitlist />,
          },
          {
            path: '/developers',
            element: <Developers />,
          },
          {
            path: '/advertising',
            element: <Advertising />,
          },
          {
            path: '/privacy-policy',
            element: <Privacy />,
          },
          {
            path: '/login',
            element: <Navigate to="/" />,
          },
        ],
      },
    ];

    /**
     * Import app directory globs so that we can
     * dynamically extract and import the manifest
     * data needed to show the app icons
     */
    const appImports = import.meta.glob('../apps/*/index.tsx');
    Object.keys(appImports).forEach((path) => {
      // Extract the app ID from the path
      const appId = path.split('/')[2];

      authorizedRoutesDefinition[0].children.push({
        path: `/${appId}`,
        element: <App id={appId} />,
      });

      authorizedRoutesDefinition[0].children.push({
        path: `/${appId}/*`,
        element: <App id={appId} />,
      });
    });

    /**
     * Add external app routes as allowed apps load in the background.
     */
    const externalApps = allowed.filter((app) => app.type === 'app-external');
    externalApps.forEach((app) => {
      authorizedRoutesDefinition[0].children.push({
        path: `/${app.appId}`,
        element: <App id={app.appId} />,
      });
    });

    // ...and add the 404 route to the route definition
    // for good measure
    authorizedRoutesDefinition.push({
      path: '*',
      element: <NotFound />,
      children: [],
    });

    Sentry.captureMessage('Authorized routes setup completed', {
      level: 'info',
      tags: {
        component: 'authentication',
        action: 'authorized_routes_setup',
      },
      contexts: {
        authorized_routes: {
          routesCount: authorizedRoutesDefinition[0].children.length,
          appImportsCount: Object.keys(appImports).length,
          hasProvider: !!provider,
          chainId,
        },
      },
    });

    // ...and return.
    return <RouterProvider router={createRouter(authorizedRoutesDefinition)} />;
  }

  // Determine if this is a root page, we'll need it later
  const isExtensionEntryPage =
    window.location.pathname === '/popup.html' ||
    window.location.pathname === '/options.html' ||
    window.location.pathname === '/sidepanel.html';
  const isRootPage =
    window.location.pathname === '/' ||
    window.location.pathname === '/waitlist' ||
    window.location.pathname === '/developers' ||
    window.location.pathname === '/advertising' ||
    window.location.pathname === '/privacy-policy' ||
    window.location.pathname === '/login' ||
    (isExtensionRuntimeEnabled && isExtensionEntryPage);

  /**
   * The following if statement determines if the user is
   * logged in or not. If not logged in, This particular
   * statement will determine if the user is unauthorized.
   */
  if (
    (isAppReady && !isAuthenticated) ||
    (isRootPage && !previouslyAuthenticated)
  ) {
    /**
     * Define our unauthorized routes for users that are
     * not authenticated. This is simpler as most of the
     * website is locked out.
     */

    Sentry.addBreadcrumb({
      category: 'authentication',
      message: 'User not authenticated - setting up unauthorized routes',
      level: 'info',
      data: {
        isAppReady,
        isAuthenticated,
        isRootPage,
        previouslyAuthenticated,
        currentPath: window.location.pathname,
      },
    });

    const unauthorizedRoutesDefinition = [
      {
        path: '/',
        element: isExtensionPopupMode ? (
          <Navigate to="/login" replace />
        ) : (
          <LandingPage />
        ),
      },
      {
        path: '/waitlist',
        element: <Waitlist />,
      },
      {
        path: '/developers',
        element: <Developers />,
      },
      {
        path: '/advertising',
        element: <Advertising />,
      },
      {
        path: '/privacy-policy',
        element: <Privacy />,
      },
      {
        path: '/login',
        element: <Login />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ];

    Sentry.captureMessage('Unauthorized routes setup completed', {
      level: 'info',
      tags: {
        component: 'authentication',
        action: 'unauthorized_routes_setup',
      },
      contexts: {
        unauthorized_routes: {
          routesCount: unauthorizedRoutesDefinition.length,
          isAppReady,
          isAuthenticated,
          isRootPage,
          previouslyAuthenticated,
          currentPath: window.location.pathname,
        },
      },
    });

    // ...and return.
    return (
      <RouterProvider router={createRouter(unauthorizedRoutesDefinition)} />
    );
  }

  /**
   * If none of these considitions are met, we can assume that
   * we are still waiting for something to happen such as the
   * wallets to load. In this case, we will render the loading
   * component until a re-render is triggered by the useEffect
   * above.
   */

  Sentry.addBreadcrumb({
    category: 'authentication',
    message: 'Showing loading state - waiting for authentication',
    level: 'info',
    data: {
      isAppReady,
      isAuthenticated,
      hasProvider: !!provider,
      chainId,
      ready,
      authenticated,
      hasUser: !!user,
      wagmiIsConnected,
    },
  });

  return <Loading type="wait" />;
};

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const extensionRuntimeAtBootstrap = isExtensionRuntime();
const reownProjectId = import.meta.env.VITE_REOWN_PROJECT_ID?.trim();

export const config = createConfig({
  chains: [mainnet],
  connectors:
    extensionRuntimeAtBootstrap || !reownProjectId
      ? []
      : [
          walletConnect({
            projectId: reownProjectId,
            showQrModal: !isMobile,
            isNewChainsStale: true,
            metadata: {
              name: 'PillarX',
              description: 'PillarX',
              url: 'https://pillarx.app/',
              icons: ['https://pillarx.app/favicon.ico'],
            },
          }),
        ],
  transports: {
    [mainnet.id]: http(getChainRpcUrl(mainnet.id)),
  },
});

const queryClient = new QueryClient();

const Main = () => {
  const appContent = (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <AllowedAppsProvider>
          <AuthLayout />
        </AllowedAppsProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );

  return (
    <ThemeProvider theme={defaultTheme}>
      <GlobalStyle />
      <LanguageProvider>{appContent}</LanguageProvider>
    </ThemeProvider>
  );
};

export default Main;
