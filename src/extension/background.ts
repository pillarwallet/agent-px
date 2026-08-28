import {
  concatHex,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  hashTypedData,
  http,
  isAddress,
  parseUnits,
} from 'viem';
import type {
  Address,
  AuthorizationRequest,
  Chain,
  Hex,
  SignableMessage,
  SignedAuthorization,
  TransactionSerializable,
  TypedDataDefinition,
} from 'viem';
import {
  arbitrum,
  base,
  bsc,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from 'viem/chains';

import {
  PILLARX_PROVIDER_APPROVAL_GET_PENDING,
  PILLARX_PROVIDER_APPROVAL_RESPOND,
  PILLARX_PROVIDER_RPC_REQUEST,
  ProviderApprovalFeePayment,
  ProviderApprovalFeePaymentOption,
  ProviderApprovalKind,
  ProviderApprovalRequestView,
  ProviderApprovalRespondMessage,
  ProviderApprovalStatus,
  ProviderRequestArguments,
  ProviderRpcErrorPayload,
  ProviderRuntimeRequestMessage,
  ProviderRuntimeResponseMessage,
} from './providerMessages';
import {
  PillarKeyringHostRequestMessage,
  PillarKeyringRequestMessage,
  PillarKeyringResponseMessage,
  PillarKeyringStorageRequestMessage,
  PILLARX_KEYRING_HOST_REQUEST,
  PILLARX_KEYRING_REQUEST,
  PILLARX_KEYRING_STORAGE_REQUEST,
  decodePillarKeyringMessagePayload,
  encodePillarKeyringMessagePayload,
} from '../utils/pillarKeyringMessaging';
import {
  PillarKeyringController,
  PillarUnlockedAccount,
  PILLARX_KEYRING_VAULT_STORAGE_KEY,
} from './keyring/PillarKeyringController';
import { PILLARX_KEEP_ALIVE_PORT } from './keepAlive';
import { getEtherspotBundlerUrl } from '../utils/bundler';
import { EtherspotTransactionKit } from '../utils/nativeTransactionKit';
import {
  encodePillarExecuteCall,
  encodePillarExecuteBatch,
  PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
} from '../utils/pillarSmartAccountClient';
import {
  GASLESS_TOKEN_APPROVAL_AMOUNT,
  getAllGaslessPaymasters,
} from '../services/gasless';
import {
  CUSTOM_CHAINS_STORAGE_KEY,
  type CustomChain,
} from '../utils/customChains';
import {
  DEFAULT_EXTENSION_DISPLAY_MODE,
  EXTENSION_DISPLAY_MODE_STORAGE_KEY,
  type ExtensionDisplayMode,
  readExtensionDisplayMode,
} from '../utils/extensionDisplayMode';

type ExtensionInstallReason = {
  reason?: string;
};

type ChromeStorageAreaLike = {
  get: (
    keys: string | string[] | null,
    callback: (items: Record<string, unknown>) => void
  ) => void;
  remove?: (keys: string | string[], callback?: () => void) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
};

type ChromeRuntimeLike = {
  getURL?: (path: string) => string;
  onInstalled?: {
    addListener: (listener: (details: ExtensionInstallReason) => void) => void;
  };
  onConnect?: {
    addListener: (listener: (port: ChromePortLike) => void) => void;
  };
  onMessage?: {
    addListener: (
      listener: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void
      ) => boolean | void
    ) => void;
  };
  lastError?: {
    message?: string;
  };
  sendMessage?: (
    message: unknown,
    callback: (response?: unknown) => void
  ) => void;
};

type ChromePortLike = {
  name?: string;
  onDisconnect?: {
    addListener: (listener: () => void) => void;
  };
  onMessage?: {
    addListener: (listener: (message: unknown) => void) => void;
  };
  postMessage?: (message: unknown) => void;
};

type ChromeWindow = {
  id?: number;
};

type ChromeWindowCreateOptions = {
  focused?: boolean;
  height?: number;
  type?: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
  url: string;
  width?: number;
};

type ChromeWindowUpdateOptions = {
  drawAttention?: boolean;
  focused?: boolean;
};

type ChromeLike = {
  action?: {
    onClicked?: {
      addListener: (listener: () => void) => void;
    };
    openPopup?: (options?: { windowId?: number }) => Promise<void>;
    setPopup?: (
      options: { popup: string },
      callback?: () => void
    ) => void | Promise<void>;
  };
  offscreen?: {
    createDocument?: (parameters: {
      justification: string;
      reasons: string[];
      url: string;
    }) => Promise<void>;
    hasDocument?: () => Promise<boolean>;
  };
  runtime?: ChromeRuntimeLike;
  sidePanel?: {
    open?: (options: { windowId: number }) => Promise<void>;
    setPanelBehavior?: (
      behavior: { openPanelOnActionClick: boolean },
      callback?: () => void
    ) => void | Promise<void>;
  };
  windows?: {
    create?: (
      options: ChromeWindowCreateOptions,
      callback?: (window?: ChromeWindow) => void
    ) => void;
    getLastFocused?: (callback: (window: ChromeWindow) => void) => void;
    onRemoved?: {
      addListener: (listener: (windowId: number) => void) => void;
    };
    remove?: (windowId: number, callback?: () => void) => void;
    update?: (
      windowId: number,
      options: ChromeWindowUpdateOptions,
      callback?: (window?: ChromeWindow) => void
    ) => void;
  };
  storage?: {
    local?: ChromeStorageAreaLike;
    onChanged?: {
      addListener: (
        listener: (
          changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
          areaName: string
        ) => void
      ) => void;
    };
    session?: ChromeStorageAreaLike;
  };
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
const keyringController = new PillarKeyringController(
  chromeLike?.storage?.local
);
const LEGACY_UNLOCKED_PRIVATE_KEY_SESSION_KEY =
  'PILLARX_LOCAL_PRIVATE_KEY_UNLOCKED_SESSION_V1';
const KEYRING_HOST_DOCUMENT_PATH = 'extension/keyring.html';
const OPEN_SIDE_PANEL_MESSAGE_TYPE = 'PILLARX_OPEN_SIDE_PANEL';
const POPUP_PAGE_PATH = 'extension/popup.html';
const keepAlivePorts = new Set<ChromePortLike>();
let keyringHostCreationPromise: Promise<void> | undefined;

chromeLike?.storage?.session?.remove?.(LEGACY_UNLOCKED_PRIVATE_KEY_SESSION_KEY);
const CONNECTED_DAPPS_STORAGE_KEY = 'pillarx:dapp:connected:v1';
const SELECTED_CHAIN_STORAGE_KEY = 'pillarx:dapp:selectedChain:v1';
const DEFAULT_MAINNET_CHAIN_ID = 1;
const DEFAULT_TESTNET_CHAIN_ID = 11155111;
const APPROVAL_WINDOW_WIDTH = 430;
const APPROVAL_WINDOW_HEIGHT = 744;
const DAPP_TRANSACTION_GAS_BUFFER_PERCENT = BigInt(20);
const MIN_DAPP_PRIORITY_FEE_PER_GAS = BigInt(1);
const NATIVE_FEE_OPTION_ID = 'native-token';
const WALLET_PORTFOLIO_URL =
  import.meta.env.VITE_USE_TESTNETS === 'true'
    ? 'https://hifidata-nubpgwxpiq-uc.a.run.app'
    : 'https://hifidata-7eu4izffpa-uc.a.run.app';
const alchemyNetworkByChainId: Record<number, string> = {
  [mainnet.id]: 'eth-mainnet',
  [polygon.id]: 'polygon-mainnet',
  [base.id]: 'base-mainnet',
  [bsc.id]: 'bnb-mainnet',
  [optimism.id]: 'opt-mainnet',
  [arbitrum.id]: 'arb-mainnet',
  [sepolia.id]: 'eth-sepolia',
};
const chainNativeSymbols: Record<number, string> = {
  [mainnet.id]: 'ETH',
  [polygon.id]: 'POL',
  [base.id]: 'ETH',
  [bsc.id]: 'BNB',
  [optimism.id]: 'ETH',
  [arbitrum.id]: 'ETH',
  [sepolia.id]: 'ETH',
};
const portfolioChainNamesById: Record<number, string> = {
  [mainnet.id]: 'Ethereum',
  [polygon.id]: 'Polygon',
  [base.id]: 'Base',
  [bsc.id]: 'BNB Smart Chain',
  [optimism.id]: 'Optimistic',
  [arbitrum.id]: 'Arbitrum',
  [sepolia.id]: 'Ethereum Sepolia Testnet',
};
const defaultChainId =
  import.meta.env.VITE_USE_TESTNETS === 'true'
    ? DEFAULT_TESTNET_CHAIN_ID
    : DEFAULT_MAINNET_CHAIN_ID;
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY?.trim();
const bundlerApiKey = import.meta.env.VITE_ETHERSPOT_BUNDLER_API_KEY;

const supportedChainIds = new Set(
  import.meta.env.VITE_USE_TESTNETS === 'true'
    ? [DEFAULT_TESTNET_CHAIN_ID]
    : [
        1, // Ethereum
        137, // Polygon
        8453, // Base
        56, // BNB Smart Chain
        10, // Optimism
        42161, // Arbitrum
      ]
);

const chainById: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [polygon.id]: polygon,
  [base.id]: base,
  [bsc.id]: bsc,
  [optimism.id]: optimism,
  [arbitrum.id]: arbitrum,
  [sepolia.id]: sepolia,
};

const isCustomChainRecord = (value: unknown): value is CustomChain => {
  const chain = value as CustomChain;

  return (
    !!chain &&
    Number.isInteger(chain.chainId) &&
    chain.chainId > 0 &&
    typeof chain.chainName === 'string' &&
    typeof chain.rpcUrl === 'string' &&
    Number.isInteger(chain.nativeTokenDecimals) &&
    typeof chain.nativeTokenSymbol === 'string' &&
    Array.isArray(chain.tokens)
  );
};

const getProviderCustomChains = async () => {
  const customChains = await chromeStorageGet<unknown>(
    chromeLike?.storage?.local,
    CUSTOM_CHAINS_STORAGE_KEY,
    []
  );

  return Array.isArray(customChains)
    ? customChains.filter(isCustomChainRecord)
    : [];
};

const getProviderCustomChainById = async (chainId: number) =>
  (await getProviderCustomChains()).find((chain) => chain.chainId === chainId);

const customChainToViemChain = (customChain: CustomChain): Chain =>
  defineChain({
    id: customChain.chainId,
    name: customChain.chainName,
    nativeCurrency: {
      name: customChain.nativeTokenSymbol,
      symbol: customChain.nativeTokenSymbol,
      decimals: customChain.nativeTokenDecimals,
    },
    rpcUrls: {
      default: {
        http: [customChain.rpcUrl],
      },
      public: {
        http: [customChain.rpcUrl],
      },
    },
    testnet: true,
  });

const setProviderCustomChains = async (customChains: CustomChain[]) =>
  chromeStorageSet(
    chromeLike?.storage?.local,
    CUSTOM_CHAINS_STORAGE_KEY,
    customChains
  );

const getFirstString = (value: unknown) =>
  Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;

const getWalletAddEthereumChainCustomChain = (
  request: WalletAddEthereumChainRequest
): CustomChain => {
  const chainId = parseChainId(request.chainId);
  const rpcUrl = getFirstString(request.rpcUrls);
  const nativeCurrency = isObject(request.nativeCurrency)
    ? request.nativeCurrency
    : {};
  const nativeTokenSymbol =
    typeof nativeCurrency.symbol === 'string'
      ? nativeCurrency.symbol.trim()
      : '';
  const nativeTokenDecimals =
    typeof nativeCurrency.decimals === 'number'
      ? nativeCurrency.decimals
      : undefined;

  if (!chainId) {
    throw providerError(4901, 'Missing chainId for wallet add chain request.');
  }

  if (!rpcUrl) {
    throw providerError(-32602, 'Missing rpcUrls for wallet add chain request.');
  }

  if (!nativeTokenSymbol) {
    throw providerError(
      -32602,
      'Missing native currency symbol for wallet add chain request.'
    );
  }

  if (!Number.isInteger(nativeTokenDecimals)) {
    throw providerError(
      -32602,
      'Missing native currency decimals for wallet add chain request.'
    );
  }

  const now = Date.now();

  return {
    chainId,
    chainName:
      typeof request.chainName === 'string' && request.chainName.trim()
        ? request.chainName.trim()
        : `Chain ${chainId}`,
    createdAt: now,
    gaslessEnabled: false,
    nativeTokenDecimals,
    nativeTokenSymbol,
    rpcUrl,
    tokens: [],
    updatedAt: now,
  };
};

const upsertProviderCustomChain = async (customChain: CustomChain) => {
  const customChains = await getProviderCustomChains();
  const existingIndex = customChains.findIndex(
    (chain) => chain.chainId === customChain.chainId
  );

  if (existingIndex < 0) {
    await setProviderCustomChains([...customChains, customChain]);
    return;
  }

  await setProviderCustomChains(
    customChains.map((chain, index) =>
      index === existingIndex
        ? {
            ...customChain,
            createdAt: chain.createdAt,
            tokens: chain.tokens,
          }
        : chain
    )
  );
};

type ConnectedDapp = {
  origin: string;
  address: string;
  connectedAt: number;
  title?: string;
  favicon?: string;
};

type ConnectedDappsState = Record<string, ConnectedDapp>;
type SelectedChainState = Record<string, number>;
type UnlockedAccount = PillarUnlockedAccount;

type DappTransactionRequest = {
  accessList?: unknown;
  chainId?: unknown;
  data?: unknown;
  from?: unknown;
  gas?: unknown;
  gasLimit?: unknown;
  gasPrice?: unknown;
  maxFeePerGas?: unknown;
  maxPriorityFeePerGas?: unknown;
  nonce?: unknown;
  to?: unknown;
  type?: unknown;
  value?: unknown;
};

type WalletAddEthereumChainRequest = {
  chainId?: unknown;
  chainName?: unknown;
  nativeCurrency?: unknown;
  rpcUrls?: unknown;
};

type ParsedWalletSendCallsCall = {
  capabilities?: unknown;
  data: Hex;
  to: Address;
  value: bigint;
};

type WalletSendCallsRequest = {
  atomicRequired: boolean;
  calls: ParsedWalletSendCallsCall[];
  capabilities?: unknown;
  chainId: number;
  from?: unknown;
  id: string;
  version: string;
};

type WalletCallBatchStatusRecord = {
  atomic: boolean;
  chainId: number;
  createdAt: number;
  error?: string;
  id: string;
  status: 100 | 200 | 400 | 500 | 600;
  transactionHash?: Hex;
};

type TransactionFeeEstimateView = ProviderApprovalRequestView['estimatedFee'];
type TransactionSimulationView = ProviderApprovalRequestView['simulation'];
type TransactionSimulationChange = NonNullable<
  NonNullable<TransactionSimulationView>['changes']
>[number];
type AggregatableSimulationChange = TransactionSimulationChange & {
  decimals?: number;
  rawAmount?: string;
};

type AlchemyAssetChange = {
  amount?: string;
  assetType?: string;
  changeType?: string;
  contractAddress?: string;
  decimals?: number;
  from?: string;
  logo?: string;
  name?: string;
  rawAmount?: string;
  symbol?: string;
  to?: string;
  tokenId?: string | null;
};

type WalletPortfolioResponse = {
  result?: {
    data?: {
      assets?: {
        asset?: {
          id?: number;
          logo?: string;
          name?: string;
          symbol?: string;
        };
        contracts_balances?: {
          address?: string;
          balance?: number;
          chainId?: string;
          decimals?: number;
        }[];
        price?: number;
      }[];
    };
  };
};

type PortfolioGaslessToken = {
  balance?: number;
  blockchain: string;
  contract: string;
  decimals: number;
  id: number;
  logo: string;
  name: string;
  price?: number;
  symbol: string;
};

type PendingProviderApproval = {
  approved?: boolean;
  cleanupId?: ReturnType<typeof setTimeout>;
  reject: (error: ProviderRpcError) => void;
  resolve: (response?: { feePayment?: ProviderApprovalFeePayment }) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  view: ProviderApprovalRequestView;
};

class ProviderRpcError extends Error {
  code: number;

  data?: unknown;

  constructor({ code, message, data }: ProviderRpcErrorPayload) {
    super(message);
    this.name = 'ProviderRpcError';
    this.code = code;
    this.data = data;
  }
}

const providerError = (
  code: number,
  message: string,
  data?: unknown
): ProviderRpcError => new ProviderRpcError({ code, message, data });

const serializeProviderError = (error: unknown): ProviderRpcErrorPayload => {
  if (error instanceof ProviderRpcError) {
    return {
      code: error.code,
      message: error.message,
      data: error.data,
    };
  }

  return {
    code: 4900,
    message: error instanceof Error ? error.message : String(error),
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const numberToChainHex = (chainId: number) =>
  `0x${chainId.toString(16)}` as const;

const parseChainId = (chainId: unknown): number | undefined => {
  if (typeof chainId === 'number' && Number.isInteger(chainId)) {
    return chainId;
  }

  if (typeof chainId === 'string') {
    if (chainId.startsWith('0x')) {
      return Number.parseInt(chainId, 16);
    }

    return Number.parseInt(chainId, 10);
  }

  return undefined;
};

const getChainById = (chainId: number): Chain => {
  const chain = chainById[chainId];
  if (!chain || !supportedChainIds.has(chainId)) {
    throw providerError(4901, `PillarX is not connected to chain ${chainId}.`);
  }

  return chain;
};

const isProviderSupportedChainId = async (chainId: number) =>
  supportedChainIds.has(chainId) ||
  Boolean(await getProviderCustomChainById(chainId));

const getProviderChainById = async (chainId: number): Promise<Chain> => {
  if (supportedChainIds.has(chainId)) {
    return getChainById(chainId);
  }

  const customChain = await getProviderCustomChainById(chainId);
  if (customChain) {
    return customChainToViemChain(customChain);
  }

  throw providerError(4901, `PillarX is not connected to chain ${chainId}.`);
};

const getProviderRpcUrl = async (chainId: number) =>
  (await getProviderCustomChainById(chainId))?.rpcUrl ?? getRpcUrl(chainId);

const isHex = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value);

const normalizeHexData = (value: unknown): Hex => {
  if (value === undefined || value === null || value === '') {
    return '0x';
  }

  if (!isHex(value)) {
    throw providerError(-32602, 'Expected hex data.');
  }

  return value;
};

const parseQuantity = (value: unknown): bigint | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw providerError(-32602, 'Invalid numeric transaction quantity.');
    }

    return BigInt(Math.trunc(value));
  }

  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      throw providerError(-32602, 'Invalid transaction quantity.');
    }
  }

  throw providerError(-32602, 'Invalid transaction quantity.');
};

const parseNonce = (value: unknown): number | undefined => {
  const parsed = parseQuantity(value);
  if (parsed === undefined) return undefined;

  const nonce = Number(parsed);
  if (!Number.isSafeInteger(nonce)) {
    throw providerError(-32602, 'Invalid transaction nonce.');
  }

  return nonce;
};

const formatNativeFee = (
  wei: bigint,
  chainId: number,
  nativeSymbol = chainNativeSymbols[chainId] ?? 'native'
) => {
  const symbol = nativeSymbol;
  const formatted = formatEther(wei);
  const [integer, decimal = ''] = formatted.split('.');

  if (wei === 0n || !decimal) return `${integer} ${symbol}`;
  if (integer !== '0') {
    const visibleDecimal = decimal.slice(0, 6).replace(/0+$/, '');
    return `${integer}${visibleDecimal ? `.${visibleDecimal}` : ''} ${symbol}`;
  }

  const firstNonZeroDecimalIndex = decimal.search(/[1-9]/);
  if (firstNonZeroDecimalIndex > 5) return `<0.000001 ${symbol}`;

  const precision = Math.max(firstNonZeroDecimalIndex + 4, 6);
  return `0.${decimal.slice(0, precision).replace(/0+$/, '')} ${symbol}`;
};

const quantityToHex = (value: bigint) => `0x${value.toString(16)}`;
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
const ERC1271_MAGIC_VALUE = '0x1626ba7e';
const MAX_UINT256 = 2n ** 256n - 1n;
const PILLAR_KERNEL_VERSION = '0.3.3';
const PILLAR_KERNEL_EIP7702_VALIDATOR_IDENTIFIER = '0x00' as const;
const WALLET_CALLS_VERSION = '2.0.0';
const WALLET_CALL_BATCH_STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const SUPPORTED_WALLET_SEND_CALLS_CAPABILITIES = new Set(['atomic']);
const walletCallBatchStatuses = new Map<string, WalletCallBatchStatusRecord>();

const erc1271Abi = [
  {
    type: 'function',
    name: 'isValidSignature',
    stateMutability: 'view',
    inputs: [
      { name: 'hash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'magicValue', type: 'bytes4' }],
  },
] as const;

const decodeErc20ApproveCalldata = (data: unknown) => {
  const normalizedData = normalizeHexData(data);

  if (!normalizedData.toLowerCase().startsWith(ERC20_APPROVE_SELECTOR)) {
    return undefined;
  }

  const encoded = normalizedData.slice(10);
  if (encoded.length < 128) return undefined;

  const amountWord = encoded.slice(64, 128);
  const amount = BigInt(`0x${amountWord}`);

  return { amount };
};

const getAlchemyRpcUrl = (chainId: number) => {
  if (!alchemyApiKey) return undefined;

  const network = alchemyNetworkByChainId[chainId];
  if (!network) return undefined;

  return `https://${network}.g.alchemy.com/v2/${alchemyApiKey}`;
};

const normalizeSignableMessage = (message: unknown): SignableMessage => {
  if (isHex(message)) {
    return { raw: message };
  }

  if (typeof message === 'string') {
    return message;
  }

  return JSON.stringify(message);
};

const chromeStorageGet = async <T>(
  area: ChromeStorageAreaLike | undefined,
  key: string,
  fallback: T
): Promise<T> =>
  new Promise((resolve) => {
    if (!area) {
      resolve(fallback);
      return;
    }

    try {
      area.get([key], (items) => {
        resolve((items?.[key] as T | undefined) ?? fallback);
      });
    } catch {
      resolve(fallback);
    }
  });

const chromeStorageSet = async <T>(
  area: ChromeStorageAreaLike | undefined,
  key: string,
  value: T
): Promise<void> =>
  new Promise((resolve) => {
    if (!area) {
      resolve();
      return;
    }

    try {
      area.set({ [key]: value }, () => resolve());
    } catch {
      resolve();
    }
  });

const getKeyringStorageValue = async (key: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const area = chromeLike?.storage?.local;
    if (!area) {
      reject(new Error('Extension storage is not available.'));
      return;
    }

    try {
      area.get([key], (items) => {
        resolve(items?.[key]);
      });
    } catch (error) {
      reject(error);
    }
  });

const setKeyringStorageValue = async (
  key: string,
  value: unknown
): Promise<void> =>
  new Promise((resolve, reject) => {
    const area = chromeLike?.storage?.local;
    if (!area) {
      reject(new Error('Extension storage is not available.'));
      return;
    }

    try {
      area.set({ [key]: value }, () => resolve());
    } catch (error) {
      reject(error);
    }
  });

const forwardKeyringRequest = (message: PillarKeyringRequestMessage) => {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return handleKeyringRequest(message);
};

const createUnlockedAccountProxy = (address: `0x${string}`): UnlockedAccount =>
  ({
    address,
    type: 'local',
    async sign({ hash }: { hash: Hex }) {
      return forwardKeyringRequest({
        type: PILLARX_KEYRING_REQUEST,
        method: 'signMessage',
        payload: encodePillarKeyringMessagePayload({
          address,
          message: { raw: hash },
        }),
      }) as Promise<Hex>;
    },
    async signMessage({ message }: { message: SignableMessage }) {
      return forwardKeyringRequest({
        type: PILLARX_KEYRING_REQUEST,
        method: 'signMessage',
        payload: encodePillarKeyringMessagePayload({ address, message }),
      }) as Promise<Hex>;
    },
    async signTransaction(transaction: TransactionSerializable) {
      return forwardKeyringRequest({
        type: PILLARX_KEYRING_REQUEST,
        method: 'signTransaction',
        payload: encodePillarKeyringMessagePayload({
          address,
          transaction,
        }),
      }) as Promise<Hex>;
    },
    async signTypedData(typedData: TypedDataDefinition) {
      return forwardKeyringRequest({
        type: PILLARX_KEYRING_REQUEST,
        method: 'signTypedData',
        payload: encodePillarKeyringMessagePayload({ address, typedData }),
      }) as Promise<Hex>;
    },
    async signAuthorization(
      authorization: AuthorizationRequest
    ): Promise<SignedAuthorization> {
      return forwardKeyringRequest({
        type: PILLARX_KEYRING_REQUEST,
        method: 'signAuthorization',
        payload: encodePillarKeyringMessagePayload({
          address,
          authorization,
        }),
      }) as Promise<SignedAuthorization>;
    },
  }) as UnlockedAccount;

const getUnlockedAccount = async (): Promise<UnlockedAccount | undefined> => {
  const status = (await forwardKeyringRequest({
    type: PILLARX_KEYRING_REQUEST,
    method: 'getStatus',
  })) as { accounts?: `0x${string}`[]; isUnlocked?: boolean };
  const address = status.isUnlocked ? status.accounts?.[0] : undefined;

  return address ? createUnlockedAccountProxy(address) : undefined;
};

const getUnlockedAddress = async () => (await getUnlockedAccount())?.address;

const getConnectedDapps = () =>
  chromeStorageGet<ConnectedDappsState>(
    chromeLike?.storage?.local,
    CONNECTED_DAPPS_STORAGE_KEY,
    {}
  );

const setConnectedDapps = (state: ConnectedDappsState) =>
  chromeStorageSet(
    chromeLike?.storage?.local,
    CONNECTED_DAPPS_STORAGE_KEY,
    state
  );

const getSelectedChains = () =>
  chromeStorageGet<SelectedChainState>(
    chromeLike?.storage?.local,
    SELECTED_CHAIN_STORAGE_KEY,
    {}
  );

const setSelectedChains = (state: SelectedChainState) =>
  chromeStorageSet(
    chromeLike?.storage?.local,
    SELECTED_CHAIN_STORAGE_KEY,
    state
  );

const getSelectedChainId = async (origin: string) => {
  const selectedChains = await getSelectedChains();
  const selectedChainId = selectedChains[origin] ?? defaultChainId;

  if (await isProviderSupportedChainId(selectedChainId)) {
    return selectedChainId;
  }

  return defaultChainId;
};

const setSelectedChainId = async (origin: string, chainId: number) => {
  if (!(await isProviderSupportedChainId(chainId))) {
    throw providerError(4901, `PillarX is not connected to chain ${chainId}.`);
  }

  const selectedChains = await getSelectedChains();
  selectedChains[origin] = chainId;
  await setSelectedChains(selectedChains);
};

const isOriginConnected = async (origin: string, address: string) => {
  const connectedDapps = await getConnectedDapps();
  return (
    connectedDapps[origin]?.address.toLowerCase() === address.toLowerCase()
  );
};

const connectOrigin = async ({
  origin,
  address,
  title,
  favicon,
}: {
  origin: string;
  address: string;
  title?: string;
  favicon?: string;
}) => {
  const connectedDapps = await getConnectedDapps();
  connectedDapps[origin] = {
    origin,
    address,
    title,
    favicon,
    connectedAt: Date.now(),
  };
  await setConnectedDapps(connectedDapps);
};

const revokeOrigin = async (origin: string) => {
  const connectedDapps = await getConnectedDapps();
  delete connectedDapps[origin];
  await setConnectedDapps(connectedDapps);
};

const normalizeParams = (
  params: ProviderRequestArguments['params']
): readonly unknown[] | Record<string, unknown> =>
  params === undefined ? [] : params;

const requestFirstParam = (
  params: ProviderRequestArguments['params']
): Record<string, unknown> | undefined => {
  if (!Array.isArray(params)) return undefined;

  const [firstParam] = params;
  return isObject(firstParam) ? firstParam : undefined;
};

const requestParamsArray = (
  params: ProviderRequestArguments['params']
): readonly unknown[] => (Array.isArray(params) ? params : []);

const createWalletCallBatchId = () => {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return `0x${hex.join('')}`;
};

const getWalletCallBatchStatusKey = (origin: string, id: string) =>
  `${origin}:${id}`;

const pruneWalletCallBatchStatuses = () => {
  const now = Date.now();

  walletCallBatchStatuses.forEach((status, key) => {
    if (now - status.createdAt > WALLET_CALL_BATCH_STATUS_TTL_MS) {
      walletCallBatchStatuses.delete(key);
    }
  });
};

const assertSupportedWalletSendCallsCapabilities = (
  capabilities: unknown,
  scope: string
) => {
  if (capabilities === undefined || capabilities === null) return;
  if (!isObject(capabilities)) {
    throw providerError(-32602, `Invalid ${scope} capabilities.`);
  }

  Object.entries(capabilities).forEach(([capabilityName, capability]) => {
    if (SUPPORTED_WALLET_SEND_CALLS_CAPABILITIES.has(capabilityName)) return;

    if (isObject(capability) && capability.optional === true) return;

    throw providerError(
      5700,
      `PillarX does not support required wallet_sendCalls capability "${capabilityName}".`
    );
  });
};

const parseWalletSendCallsRequest = (
  params: ProviderRequestArguments['params']
): WalletSendCallsRequest => {
  const request = requestFirstParam(params);
  if (!request) {
    throw providerError(-32602, 'Missing wallet_sendCalls request.');
  }

  const chainId = parseChainId(request.chainId);
  if (!chainId) {
    throw providerError(-32602, 'Missing wallet_sendCalls chainId.');
  }

  if (!Array.isArray(request.calls) || request.calls.length === 0) {
    throw providerError(-32602, 'wallet_sendCalls requires at least one call.');
  }

  if (
    request.id !== undefined &&
    (typeof request.id !== 'string' || request.id.length > 8194)
  ) {
    throw providerError(-32602, 'Invalid wallet_sendCalls id.');
  }

  if (request.from !== undefined) {
    if (typeof request.from !== 'string' || !isAddress(request.from)) {
      throw providerError(-32602, 'Invalid wallet_sendCalls from address.');
    }
  }

  const atomicRequired =
    typeof request.atomicRequired === 'boolean' ? request.atomicRequired : true;

  assertSupportedWalletSendCallsCapabilities(
    request.capabilities,
    'wallet_sendCalls'
  );

  const calls = request.calls.map((call, index) => {
    if (!isObject(call)) {
      throw providerError(-32602, `Invalid wallet_sendCalls call ${index}.`);
    }

    assertSupportedWalletSendCallsCapabilities(
      call.capabilities,
      `wallet_sendCalls call ${index}`
    );

    if (typeof call.to !== 'string' || !isAddress(call.to)) {
      throw providerError(
        -32602,
        `PillarX does not support wallet_sendCalls deployment call ${index}.`
      );
    }

    return {
      capabilities: call.capabilities,
      data: normalizeHexData(call.data),
      to: getAddress(call.to),
      value: parseQuantity(call.value) ?? 0n,
    } satisfies ParsedWalletSendCallsCall;
  });

  return {
    atomicRequired,
    calls,
    capabilities: request.capabilities,
    chainId,
    from: request.from,
    id: request.id ?? createWalletCallBatchId(),
    version:
      typeof request.version === 'string'
        ? request.version
        : WALLET_CALLS_VERSION,
  };
};

const assertRequestedAccount = (
  requestedAddress: unknown,
  accountAddress: Address
) => {
  if (
    typeof requestedAddress !== 'string' ||
    !isAddress(requestedAddress) ||
    getAddress(requestedAddress) !== getAddress(accountAddress)
  ) {
    throw providerError(
      4100,
      'Requested account does not match the connected PillarX account.'
    );
  }
};

const parseAddressAndTypedData = (
  params: ProviderRequestArguments['params']
): {
  address: string;
  typedData: TypedDataDefinition;
} => {
  const values = requestParamsArray(params);

  if (values.length < 2) {
    throw providerError(-32602, 'Missing typed data signing parameters.');
  }

  const [first, second] = values;
  const address =
    typeof first === 'string' && isAddress(first) ? first : second;
  const payload = address === first ? second : first;

  if (typeof address !== 'string' || !isAddress(address)) {
    throw providerError(-32602, 'Missing typed data signing account.');
  }

  const typedData = typeof payload === 'string' ? JSON.parse(payload) : payload;

  if (!isObject(typedData)) {
    throw providerError(-32602, 'Invalid typed data payload.');
  }

  return {
    address,
    typedData: typedData as TypedDataDefinition,
  };
};

const getRpcUrl = (chainId: number) =>
  getEtherspotBundlerUrl({
    chainId,
    apiKey: bundlerApiKey,
  });

const getPortfolioChainIds = () => Array.from(supportedChainIds);

const fetchWalletPortfolioTokens = async (
  wallet: Address
): Promise<PortfolioGaslessToken[]> => {
  const chainIds = getPortfolioChainIds();
  const chainIdsQuery = chainIds.map((id) => `chainIds=${id}`).join('&');
  const response = await fetch(
    `${WALLET_PORTFOLIO_URL}?${chainIdsQuery}&testnets=${String(
      import.meta.env.VITE_USE_TESTNETS === 'true'
    )}`,
    {
      body: JSON.stringify({
        path: 'wallet/portfolio',
        params: {
          wallet,
          blockchains: chainIds.join(','),
          unlistedAssets: 'true',
          filterSpam: 'true',
          pnl: false,
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  const json = (await response.json()) as WalletPortfolioResponse & {
    error?: { message?: string };
  };

  if (!response.ok || json.error) {
    throw new Error(
      json.error?.message ??
        'Unable to fetch wallet portfolio for gasless fees.'
    );
  }

  return (json.result?.data?.assets ?? []).flatMap((asset) =>
    (asset.contracts_balances ?? [])
      .filter((contract) => (contract.balance ?? 0) > 0)
      .map((contract) => {
        const chainId = Number(contract.chainId?.split(':')[1]);

        return {
          balance: contract.balance,
          blockchain: portfolioChainNamesById[chainId] ?? String(chainId),
          contract: contract.address ?? '',
          decimals: contract.decimals ?? 18,
          id: asset.asset?.id ?? 0,
          logo: asset.asset?.logo ?? '',
          name: asset.asset?.name ?? 'Token',
          price: asset.price,
          symbol: asset.asset?.symbol ?? 'Token',
        };
      })
      .filter((token) => isAddress(token.contract))
  );
};

const getDappFeePaymentOptions = async ({
  account,
  chainId,
}: {
  account: UnlockedAccount;
  chainId: number;
}): Promise<ProviderApprovalFeePaymentOption[]> => {
  const customChain = await getProviderCustomChainById(chainId);
  const nativeOption: ProviderApprovalFeePaymentOption = {
    id: NATIVE_FEE_OPTION_ID,
    title: 'Native Token',
    type: 'native',
    value: customChain?.nativeTokenSymbol ?? chainNativeSymbols[chainId],
  };

  if (customChain) return [nativeOption];

  try {
    const tokens = await fetchWalletPortfolioTokens(account.address);
    const paymasters = await getAllGaslessPaymasters(chainId, tokens);

    if (!paymasters?.length) {
      return [nativeOption];
    }

    const gaslessOptions = paymasters
      .map((paymaster) => {
        const token = tokens.find(
          (portfolioToken) =>
            portfolioToken.contract.toLowerCase() ===
            paymaster.gasToken.toLowerCase()
        );

        if (!token) return undefined;

        return {
          balance: token.balance,
          decimals: token.decimals,
          id: `${paymaster.gasToken}-${paymaster.chainId}-${paymaster.paymasterAddress}-${token.decimals}`,
          imageSrc: token.logo,
          paymasterAddress: paymaster.paymasterAddress,
          title: token.symbol,
          token: paymaster.gasToken,
          type: 'gasless',
          value: token.balance?.toString(),
        } satisfies ProviderApprovalFeePaymentOption;
      })
      .filter(
        (
          option
        ): option is Extract<
          ProviderApprovalFeePaymentOption,
          { type: 'gasless' }
        > => Boolean(option)
      );

    return [nativeOption, ...gaslessOptions];
  } catch {
    return [nativeOption];
  }
};

const getDelegationAuthorization = async ({
  account,
  chain,
}: {
  account: UnlockedAccount;
  chain: Chain;
}) => {
  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl(chain.id)),
  });

  const code = await publicClient.getCode({
    address: account.address,
  });
  const delegatedAddressMatch = code?.match(/^0xef0100(.{40})$/);
  const delegatedAddress = delegatedAddressMatch
    ? getAddress(`0x${delegatedAddressMatch[1]}`)
    : undefined;

  if (
    delegatedAddress?.toLowerCase() ===
    PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS.toLowerCase()
  ) {
    return undefined;
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getRpcUrl(chain.id)),
  });

  return walletClient.signAuthorization({
    account,
    contractAddress: PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
    executor: 'self',
  });
};

const getPillarKernelDelegatedAddress = (code?: Hex) => {
  const delegatedAddressMatch = code?.match(/^0xef0100(.{40})$/);

  return delegatedAddressMatch
    ? getAddress(`0x${delegatedAddressMatch[1]}`)
    : undefined;
};

const isErc1271SignatureValid = async ({
  account,
  hash,
  publicClient,
  signature,
}: {
  account: Address;
  hash: Hex;
  publicClient: ReturnType<typeof createPublicClient>;
  signature: Hex;
}) => {
  try {
    const result = await publicClient.readContract({
      address: account,
      abi: erc1271Abi,
      functionName: 'isValidSignature',
      args: [hash, signature],
    });

    return result.toLowerCase() === ERC1271_MAGIC_VALUE;
  } catch {
    return undefined;
  }
};

const findValidErc1271Signature = async ({
  account,
  candidates,
  hash,
  publicClient,
}: {
  account: Address;
  candidates: readonly Hex[];
  hash: Hex;
  publicClient: ReturnType<typeof createPublicClient>;
}) => {
  const results = await Promise.all(
    candidates.map(async (signature) => ({
      isValid: await isErc1271SignatureValid({
        account,
        hash,
        publicClient,
        signature,
      }),
      signature,
    }))
  );

  return results.find(({ isValid }) => isValid)?.signature;
};

const signKernelWrappedTypedDataHash = async ({
  account,
  chainId,
  typedDataHash,
}: {
  account: UnlockedAccount;
  chainId: number;
  typedDataHash: Hex;
}) => {
  return account.signTypedData({
    domain: {
      name: 'Kernel',
      version: PILLAR_KERNEL_VERSION,
      chainId,
      verifyingContract: account.address,
    },
    primaryType: 'Kernel',
    types: {
      Kernel: [{ name: 'hash', type: 'bytes32' }],
    },
    message: {
      hash: typedDataHash,
    },
  });
};

const signTypedDataForDapp = async ({
  account,
  chainId,
  typedData,
}: {
  account: UnlockedAccount;
  chainId: number;
  typedData: TypedDataDefinition;
}) => {
  const rawTypedDataSignature = () => account.signTypedData(typedData);
  const customChain = await getProviderCustomChainById(chainId);

  if (customChain) {
    return rawTypedDataSignature();
  }

  const chain = await getProviderChainById(chainId);
  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl(chain.id)),
  });

  const code = await publicClient.getCode({ address: account.address });
  const delegatedAddress = getPillarKernelDelegatedAddress(code);

  if (
    delegatedAddress?.toLowerCase() !==
    PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS.toLowerCase()
  ) {
    return rawTypedDataSignature();
  }

  const typedDataHash = hashTypedData(typedData);
  const kernelSignature = await signKernelWrappedTypedDataHash({
    account,
    chainId,
    typedDataHash,
  });
  const primaryKernelSignature = concatHex([
    PILLAR_KERNEL_EIP7702_VALIDATOR_IDENTIFIER,
    kernelSignature,
  ]);

  const validKernelSignature = await findValidErc1271Signature({
    account: account.address,
    candidates: [primaryKernelSignature],
    hash: typedDataHash,
    publicClient,
  });

  if (validKernelSignature) return validKernelSignature;

  const rawSignature = await rawTypedDataSignature();
  const rawCandidates = [
    rawSignature,
    concatHex([PILLAR_KERNEL_EIP7702_VALIDATOR_IDENTIFIER, rawSignature]),
  ];

  const validRawSignature = await findValidErc1271Signature({
    account: account.address,
    candidates: rawCandidates,
    hash: typedDataHash,
    publicClient,
  });

  if (validRawSignature) return validRawSignature;

  return primaryKernelSignature;
};

const buildDappTransactionRequest = async ({
  account,
  chainId,
  transaction,
}: {
  account: UnlockedAccount;
  chainId: number;
  transaction: DappTransactionRequest;
}) => {
  const chain = await getProviderChainById(chainId);
  const requestedChainId = parseChainId(transaction.chainId);

  if (requestedChainId && requestedChainId !== chainId) {
    throw providerError(
      4901,
      `Transaction chain ${requestedChainId} does not match selected chain ${chainId}.`
    );
  }

  assertRequestedAccount(transaction.from ?? account.address, account.address);

  if (typeof transaction.to !== 'string' || !isAddress(transaction.to)) {
    throw providerError(
      4200,
      'PillarX does not support dapp contract deployment transactions yet.'
    );
  }

  const customChain = await getProviderCustomChainById(chainId);
  const authorization = customChain
    ? undefined
    : await getDelegationAuthorization({
        account,
        chain,
      });
  const requestedGas = parseQuantity(transaction.gas ?? transaction.gasLimit);
  const innerCall = {
    to: getAddress(transaction.to),
    value: parseQuantity(transaction.value) ?? BigInt(0),
    data: normalizeHexData(transaction.data),
  };
  const transactionOverrides = {
    ...(transaction.gasPrice !== undefined
      ? { gasPrice: parseQuantity(transaction.gasPrice) }
      : {}),
    ...(transaction.maxFeePerGas !== undefined
      ? { maxFeePerGas: parseQuantity(transaction.maxFeePerGas) }
      : {}),
    ...(transaction.maxPriorityFeePerGas !== undefined
      ? {
          maxPriorityFeePerGas: parseQuantity(transaction.maxPriorityFeePerGas),
        }
      : {}),
    ...(transaction.nonce !== undefined
      ? { nonce: parseNonce(transaction.nonce) }
      : {}),
  };
  const publicClient = createPublicClient({
    chain,
    transport: http(customChain?.rpcUrl ?? getRpcUrl(chainId)),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(customChain?.rpcUrl ?? getRpcUrl(chainId)),
  });
  const request = customChain
    ? {
        account,
        chain,
        to: innerCall.to,
        value: innerCall.value,
        data: innerCall.data,
        ...(requestedGas !== undefined ? { gas: requestedGas } : {}),
        ...transactionOverrides,
      }
    : {
        account,
        chain,
        to: account.address,
        value: BigInt(0),
        data: encodePillarExecuteCall(innerCall),
        ...(authorization ? { authorizationList: [authorization] } : {}),
        ...transactionOverrides,
      };

  if (!customChain) {
    const estimatedGas = await publicClient.estimateGas(request);
    request.gas =
      (estimatedGas * (BigInt(100) + DAPP_TRANSACTION_GAS_BUFFER_PERCENT)) /
      BigInt(100);
  }

  return {
    chainId,
    request,
    publicClient,
    walletClient,
  };
};

const getEffectiveDappTransactionChainId = async ({
  fallbackChainId,
  transaction,
}: {
  fallbackChainId: number;
  transaction: DappTransactionRequest;
}) => {
  const requestedChainId = parseChainId(transaction.chainId);
  if (!requestedChainId) return fallbackChainId;

  if (!(await isProviderSupportedChainId(requestedChainId))) {
    throw providerError(
      4901,
      `PillarX is not connected to chain ${requestedChainId}.`
    );
  }

  return requestedChainId;
};

const buildDappBatchTransactionRequest = async ({
  account,
  calls,
  chainId,
}: {
  account: UnlockedAccount;
  calls: ParsedWalletSendCallsCall[];
  chainId: number;
}) => {
  const chain = await getProviderChainById(chainId);
  const customChain = await getProviderCustomChainById(chainId);

  if (customChain && calls.length !== 1) {
    throw providerError(
      4200,
      'PillarX only supports a single wallet_sendCalls call on custom chains.'
    );
  }

  const authorization = customChain
    ? undefined
    : await getDelegationAuthorization({
        account,
        chain,
      });
  const publicClient = createPublicClient({
    chain,
    transport: http(customChain?.rpcUrl ?? getRpcUrl(chainId)),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(customChain?.rpcUrl ?? getRpcUrl(chainId)),
  });
  const pillarCalls = calls.map(({ data, to, value }) => ({
    data,
    to,
    value,
  }));
  const request = customChain
    ? {
        account,
        chain,
        to: pillarCalls[0].to,
        value: pillarCalls[0].value,
        data: pillarCalls[0].data,
      }
    : {
        account,
        chain,
        to: account.address,
        value: BigInt(0),
        data:
          pillarCalls.length === 1
            ? encodePillarExecuteCall(pillarCalls[0])
            : encodePillarExecuteBatch(pillarCalls),
        ...(authorization ? { authorizationList: [authorization] } : {}),
      };

  if (!customChain) {
    const estimatedFees = await publicClient.estimateFeesPerGas({
      type: 'eip1559',
    });
    const estimatedPriorityFee =
      'maxPriorityFeePerGas' in estimatedFees
        ? estimatedFees.maxPriorityFeePerGas
        : undefined;
    const maxPriorityFeePerGas =
      estimatedPriorityFee &&
      estimatedPriorityFee > MIN_DAPP_PRIORITY_FEE_PER_GAS
        ? estimatedPriorityFee
        : MIN_DAPP_PRIORITY_FEE_PER_GAS;
    const estimatedMaxFee =
      'maxFeePerGas' in estimatedFees ? estimatedFees.maxFeePerGas : undefined;
    const maxFeePerGas =
      estimatedMaxFee && estimatedMaxFee > maxPriorityFeePerGas
        ? estimatedMaxFee
        : maxPriorityFeePerGas;

    request.maxFeePerGas = maxFeePerGas;
    request.maxPriorityFeePerGas = maxPriorityFeePerGas;

    const estimatedGas = await publicClient.estimateGas(request);
    request.gas =
      (estimatedGas * (BigInt(100) + DAPP_TRANSACTION_GAS_BUFFER_PERCENT)) /
      BigInt(100);
  }

  return {
    chainId,
    request,
    publicClient,
    walletClient,
  };
};

const getDappTransactionFeeEstimate = async ({
  chainId,
  publicClient,
  request,
}: Awaited<
  ReturnType<typeof buildDappTransactionRequest>
>): Promise<TransactionFeeEstimateView> => {
  const gas =
    request.gas ??
    (await publicClient.estimateGas({
      ...request,
    }));
  const feePerGas = await (async () => {
    if (request.gasPrice !== undefined) return request.gasPrice;
    if (request.maxFeePerGas !== undefined) return request.maxFeePerGas;

    try {
      const fees = await publicClient.estimateFeesPerGas({
        type: 'eip1559',
      });
      if ('maxFeePerGas' in fees) return fees.maxFeePerGas;
    } catch {
      // Fall back to legacy gas price below.
    }

    return publicClient.getGasPrice();
  })();
  const totalWei = gas * feePerGas;

  return {
    feePerGas: feePerGas.toString(),
    formatted: formatNativeFee(
      totalWei,
      chainId,
      request.chain?.nativeCurrency.symbol
    ),
    gas: gas.toString(),
    totalWei: totalWei.toString(),
  };
};

const parseSimulationRawAmount = (rawAmount?: string) => {
  if (!rawAmount) return undefined;

  try {
    return BigInt(rawAmount);
  } catch {
    return undefined;
  }
};

const trimDisplayAmount = (amount: string) =>
  amount.includes('.') ? amount.replace(/\.?0+$/, '') || '0' : amount;

const addDisplayAmounts = (left?: string, right?: string) => {
  const sum = Number(left ?? '0') + Number(right ?? '0');
  if (!Number.isFinite(sum)) return right ?? left;

  return trimDisplayAmount(sum.toFixed(18));
};

const getSimulationAggregationKey = (change: AggregatableSimulationChange) =>
  [
    change.direction,
    change.assetType ?? '',
    change.contractAddress?.toLowerCase() ?? '',
    change.symbol ?? '',
    change.name ?? '',
    change.tokenId ?? '',
  ].join('|');

const addSimulationChanges = (
  existing: AggregatableSimulationChange,
  next: AggregatableSimulationChange
): AggregatableSimulationChange => {
  const existingRawAmount = parseSimulationRawAmount(existing.rawAmount);
  const nextRawAmount = parseSimulationRawAmount(next.rawAmount);
  const canUseRawAmount =
    existingRawAmount !== undefined &&
    nextRawAmount !== undefined &&
    existing.decimals !== undefined &&
    existing.decimals === next.decimals;

  if (canUseRawAmount) {
    const rawAmount = existingRawAmount + nextRawAmount;
    return {
      ...existing,
      amount: trimDisplayAmount(formatUnits(rawAmount, existing.decimals)),
      rawAmount: rawAmount.toString(),
    };
  }

  return {
    ...existing,
    amount: addDisplayAmounts(existing.amount, next.amount),
  };
};

const aggregateSimulationChanges = (
  changes: AggregatableSimulationChange[]
): TransactionSimulationChange[] => {
  const aggregatedChanges = new Map<string, AggregatableSimulationChange>();

  changes.forEach((change) => {
    const key = getSimulationAggregationKey(change);
    const existing = aggregatedChanges.get(key);

    aggregatedChanges.set(
      key,
      existing ? addSimulationChanges(existing, change) : change
    );
  });

  return Array.from(aggregatedChanges.values()).map((change) => ({
    amount: change.amount,
    assetType: change.assetType,
    changeType: change.changeType,
    contractAddress: change.contractAddress,
    direction: change.direction,
    logo: change.logo,
    name: change.name,
    symbol: change.symbol,
    tokenId: change.tokenId,
  }));
};

const getErc20TokenMetadata = async ({
  chainId,
  token,
}: {
  chainId: number;
  token: Address;
}) => {
  const chain = getChainById(chainId);
  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl(chainId)),
  });
  const [symbolResult, nameResult, decimalsResult] = await Promise.allSettled([
    publicClient.readContract({
      abi: erc20Abi,
      address: token,
      functionName: 'symbol',
    }),
    publicClient.readContract({
      abi: erc20Abi,
      address: token,
      functionName: 'name',
    }),
    publicClient.readContract({
      abi: erc20Abi,
      address: token,
      functionName: 'decimals',
    }),
  ]);
  const symbol =
    symbolResult.status === 'fulfilled' &&
    typeof symbolResult.value === 'string'
      ? symbolResult.value
      : 'Token';
  const name =
    nameResult.status === 'fulfilled' && typeof nameResult.value === 'string'
      ? nameResult.value
      : symbol;
  const decimals =
    decimalsResult.status === 'fulfilled' &&
    typeof decimalsResult.value === 'number'
      ? decimalsResult.value
      : 18;

  return { decimals, name, symbol };
};

const formatApprovalSimulationAmount = ({
  amount,
  decimals,
}: {
  amount: bigint;
  decimals: number;
}) => {
  if (amount >= MAX_UINT256 / 2n) return 'Unlimited';

  const formatted = trimDisplayAmount(formatUnits(amount, decimals));
  if (formatted.length <= 24) return formatted;

  const [integer, decimal] = formatted.split('.');
  if (integer.length > 16) {
    return `${integer.slice(0, 10)}...${integer.slice(-4)}`;
  }

  return `${integer}.${(decimal ?? '').slice(0, 6)}...`;
};

const isUnlimitedApprovalLikeAmount = ({
  amount,
  rawAmount,
}: {
  amount?: string;
  rawAmount?: string;
}) => {
  const parsedRawAmount = parseSimulationRawAmount(rawAmount);
  if (parsedRawAmount !== undefined) {
    return parsedRawAmount >= MAX_UINT256 / 2n;
  }

  if (!amount) return false;

  const normalizedAmount = amount.replace(/,/g, '').replace(/^-/, '');
  const integerPart = normalizedAmount.split('.')[0] ?? '';

  return (
    normalizedAmount.startsWith(
      '115792089237316195423570985008687907853269984665640564039457'
    ) || integerPart.length > 36
  );
};

const getSimulationDirectionOrder = (
  direction: TransactionSimulationChange['direction']
) => {
  if (direction === 'spend') return 0;
  if (direction === 'approve') return 1;
  return 2;
};

const isTokenSimulationAsset = (change: AlchemyAssetChange) =>
  change.assetType?.toLowerCase().includes('erc20') ||
  (typeof change.contractAddress === 'string' &&
    isAddress(change.contractAddress));

const getDappTransactionSimulation = async ({
  account,
  chainId,
  estimatedFee,
  transaction,
}: {
  account: UnlockedAccount;
  chainId: number;
  estimatedFee?: TransactionFeeEstimateView;
  transaction: DappTransactionRequest;
}): Promise<TransactionSimulationView | undefined> => {
  const alchemyRpcUrl = getAlchemyRpcUrl(chainId);
  if (!alchemyRpcUrl) return undefined;

  if (typeof transaction.to !== 'string' || !isAddress(transaction.to)) {
    return undefined;
  }

  const approval = decodeErc20ApproveCalldata(transaction.data);
  if (approval) {
    const token = getAddress(transaction.to);
    const metadata = await getErc20TokenMetadata({ chainId, token }).catch(
      () => ({
        decimals: 18,
        name: 'Token',
        symbol: 'Token',
      })
    );

    return {
      changes: [
        {
          amount: formatApprovalSimulationAmount({
            amount: approval.amount,
            decimals: metadata.decimals,
          }),
          assetType: 'erc20',
          changeType: 'approval',
          contractAddress: token,
          direction: 'approve',
          name: metadata.name,
          symbol: metadata.symbol,
        },
      ],
    };
  }

  const simulationTransaction: Record<string, string> = {
    from: account.address,
    to: getAddress(transaction.to),
    data: normalizeHexData(transaction.data),
    value: quantityToHex(parseQuantity(transaction.value) ?? 0n),
  };
  const gas = parseQuantity(transaction.gas ?? transaction.gasLimit);
  const gasPrice = parseQuantity(transaction.gasPrice);
  const maxFeePerGas = parseQuantity(transaction.maxFeePerGas);
  const maxPriorityFeePerGas = parseQuantity(transaction.maxPriorityFeePerGas);

  if (gas !== undefined) {
    simulationTransaction.gas = quantityToHex(gas);
  } else if (estimatedFee?.gas) {
    simulationTransaction.gas = quantityToHex(BigInt(estimatedFee.gas));
  }

  if (gasPrice !== undefined) {
    simulationTransaction.gasPrice = quantityToHex(gasPrice);
  } else if (maxFeePerGas !== undefined) {
    simulationTransaction.maxFeePerGas = quantityToHex(maxFeePerGas);
    if (maxPriorityFeePerGas !== undefined) {
      simulationTransaction.maxPriorityFeePerGas =
        quantityToHex(maxPriorityFeePerGas);
    }
  } else if (estimatedFee?.feePerGas) {
    simulationTransaction.gasPrice = quantityToHex(
      BigInt(estimatedFee.feePerGas)
    );
  }

  const response = await fetch(alchemyRpcUrl, {
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'alchemy_simulateAssetChanges',
      params: [simulationTransaction],
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const json = (await response.json()) as {
    error?: { message?: string };
    result?: {
      changes?: AlchemyAssetChange[];
      error?: { message?: string } | string | null;
    };
  };

  if (!response.ok || json.error) {
    throw new Error(
      json.error?.message ?? 'Alchemy transaction simulation failed.'
    );
  }

  if (json.result?.error) {
    const simulationError = json.result.error;
    throw new Error(
      typeof simulationError === 'string'
        ? simulationError
        : (simulationError.message ?? 'Alchemy transaction simulation failed.')
    );
  }

  const accountAddress = account.address.toLowerCase();
  const normalizedChanges = (json.result?.changes ?? [])
    .map((change) => {
      const from = change.from?.toLowerCase();
      const to = change.to?.toLowerCase();
      let direction: 'receive' | 'spend' | undefined;

      if (from === accountAddress && to !== accountAddress) {
        direction = 'spend';
      } else if (to === accountAddress && from !== accountAddress) {
        direction = 'receive';
      }

      if (!direction) return undefined;

      const isUnlimitedApprovalArtifact =
        direction === 'spend' &&
        isTokenSimulationAsset(change) &&
        isUnlimitedApprovalLikeAmount({
          amount: change.amount,
          rawAmount: change.rawAmount,
        });

      return {
        amount: isUnlimitedApprovalArtifact ? 'Unlimited' : change.amount,
        assetType: change.assetType,
        changeType: isUnlimitedApprovalArtifact
          ? 'approval'
          : change.changeType,
        contractAddress: change.contractAddress,
        decimals: change.decimals,
        direction: isUnlimitedApprovalArtifact ? 'approve' : direction,
        logo: change.logo,
        name: change.name,
        rawAmount: isUnlimitedApprovalArtifact ? undefined : change.rawAmount,
        symbol: change.symbol,
        tokenId: change.tokenId,
      };
    })
    .filter((change): change is AggregatableSimulationChange =>
      Boolean(change)
    );

  const changes = aggregateSimulationChanges(normalizedChanges).sort((a, b) => {
    return (
      getSimulationDirectionOrder(a.direction) -
      getSimulationDirectionOrder(b.direction)
    );
  });

  return { changes };
};

const isGaslessFeePayment = (
  feePayment?: ProviderApprovalFeePayment
): feePayment is Extract<ProviderApprovalFeePayment, { type: 'gasless' }> =>
  feePayment?.type === 'gasless' &&
  isAddress(feePayment.token) &&
  isAddress(feePayment.paymasterAddress);

const sendGaslessDappTransaction = async ({
  account,
  chainId,
  feePayment,
  transaction,
}: {
  account: UnlockedAccount;
  chainId: number;
  feePayment: Extract<ProviderApprovalFeePayment, { type: 'gasless' }>;
  transaction: DappTransactionRequest;
}) => {
  const chain = getChainById(chainId);
  const requestedChainId = parseChainId(transaction.chainId);

  if (requestedChainId && requestedChainId !== chainId) {
    throw providerError(
      4901,
      `Transaction chain ${requestedChainId} does not match selected chain ${chainId}.`
    );
  }

  assertRequestedAccount(transaction.from ?? account.address, account.address);

  if (typeof transaction.to !== 'string' || !isAddress(transaction.to)) {
    throw providerError(
      4200,
      'PillarX does not support dapp contract deployment transactions yet.'
    );
  }

  const authorization = await getDelegationAuthorization({
    account,
    chain,
  });
  const batchName = `dapp-gasless-${Date.now()}`;
  const kit = new EtherspotTransactionKit({
    bundlerApiKey,
    chainId,
    debugMode: import.meta.env.DEV,
    viemLocalAccount: account,
    walletMode: 'delegatedEoa',
  });
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [
      feePayment.paymasterAddress,
      parseUnits(GASLESS_TOKEN_APPROVAL_AMOUNT, feePayment.decimals),
    ],
  });

  kit
    .transaction({
      chainId,
      to: feePayment.token,
      value: '0',
      data: approveData,
    })
    .name({ transactionName: 'approve gas fee token' })
    .addToBatch({ batchName });

  kit
    .transaction({
      chainId,
      to: getAddress(transaction.to),
      value: (parseQuantity(transaction.value) ?? BigInt(0)).toString(),
      data: normalizeHexData(transaction.data),
    })
    .name({ transactionName: 'dapp transaction' })
    .addToBatch({ batchName });

  const batchSend = await kit.sendBatches({
    onlyBatchNames: [batchName],
    authorization: authorization || undefined,
    paymasterDetails: {
      context: {
        mode: 'commonerc20',
        token: feePayment.token,
      },
    },
  });
  const sentBatch = batchSend.batches[batchName];

  if (!batchSend.isSentSuccessfully || sentBatch?.errorMessage) {
    throw providerError(
      4900,
      sentBatch?.errorMessage || 'Gasless dapp transaction failed.'
    );
  }

  const userOpHash = sentBatch?.chainGroups?.[chainId]?.userOpHash;
  if (!userOpHash) {
    throw providerError(
      4900,
      'Gasless dapp transaction did not return a hash.'
    );
  }

  const transactionHash = await kit.getTransactionHash(userOpHash, chainId);
  if (!transactionHash) {
    throw providerError(
      4900,
      'Gasless dapp transaction was sent, but the transaction hash was not available yet.'
    );
  }

  return transactionHash;
};

const sendGaslessDappCalls = async ({
  account,
  calls,
  chainId,
  feePayment,
}: {
  account: UnlockedAccount;
  calls: ParsedWalletSendCallsCall[];
  chainId: number;
  feePayment: Extract<ProviderApprovalFeePayment, { type: 'gasless' }>;
}) => {
  const chain = getChainById(chainId);
  const authorization = await getDelegationAuthorization({
    account,
    chain,
  });
  const batchName = `dapp-send-calls-gasless-${Date.now()}`;
  const kit = new EtherspotTransactionKit({
    bundlerApiKey,
    chainId,
    debugMode: import.meta.env.DEV,
    viemLocalAccount: account,
    walletMode: 'delegatedEoa',
  });
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [
      feePayment.paymasterAddress,
      parseUnits(GASLESS_TOKEN_APPROVAL_AMOUNT, feePayment.decimals),
    ],
  });

  kit
    .transaction({
      chainId,
      to: feePayment.token,
      value: '0',
      data: approveData,
    })
    .name({ transactionName: 'approve gas fee token' })
    .addToBatch({ batchName });

  calls.forEach((call, index) => {
    kit
      .transaction({
        chainId,
        to: call.to,
        value: call.value.toString(),
        data: call.data,
      })
      .name({ transactionName: `wallet_sendCalls ${index + 1}` })
      .addToBatch({ batchName });
  });

  const batchSend = await kit.sendBatches({
    onlyBatchNames: [batchName],
    authorization: authorization || undefined,
    paymasterDetails: {
      context: {
        mode: 'commonerc20',
        token: feePayment.token,
      },
    },
  });
  const sentBatch = batchSend.batches[batchName];

  if (!batchSend.isSentSuccessfully || sentBatch?.errorMessage) {
    throw providerError(
      4900,
      sentBatch?.errorMessage || 'Gasless wallet_sendCalls failed.'
    );
  }

  const userOpHash = sentBatch?.chainGroups?.[chainId]?.userOpHash;
  if (!userOpHash) {
    throw providerError(
      4900,
      'Gasless wallet_sendCalls did not return a hash.'
    );
  }

  const transactionHash = await kit.getTransactionHash(userOpHash, chainId);
  if (!transactionHash) {
    throw providerError(
      4900,
      'Gasless wallet_sendCalls was sent, but the transaction hash was not available yet.'
    );
  }

  return transactionHash;
};

const requestRpc = async ({
  chainId,
  method,
  params,
}: {
  chainId: number;
  method: string;
  params: ProviderRequestArguments['params'];
}) => {
  const response = await fetch(await getProviderRpcUrl(chainId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params: normalizeParams(params),
    }),
  });

  const json = (await response.json()) as {
    result?: unknown;
    error?: { code?: number; message?: string; data?: unknown };
  };

  if (!response.ok || json.error) {
    throw providerError(
      json.error?.code ?? 4900,
      json.error?.message ?? `RPC request failed for ${method}.`,
      json.error?.data
    );
  }

  return json.result;
};

const formatWalletCallReceipt = (
  receipt: Awaited<
    ReturnType<ReturnType<typeof createPublicClient>['getTransactionReceipt']>
  >
) => ({
  blockHash: receipt.blockHash,
  blockNumber: quantityToHex(receipt.blockNumber),
  gasUsed: quantityToHex(receipt.gasUsed),
  logs: receipt.logs.map((log) => ({
    address: log.address,
    data: log.data,
    topics: log.topics,
  })),
  status: receipt.status === 'success' ? '0x1' : '0x0',
  transactionHash: receipt.transactionHash,
});

const getWalletCallsStatus = async ({
  id,
  origin,
}: {
  id: string;
  origin: string;
}) => {
  pruneWalletCallBatchStatuses();

  const statusKey = getWalletCallBatchStatusKey(origin, id);
  const storedStatus = walletCallBatchStatuses.get(statusKey);
  if (!storedStatus) {
    throw providerError(4900, 'Unknown wallet_sendCalls batch id.');
  }

  const baseStatus = {
    atomic: storedStatus.atomic,
    chainId: numberToChainHex(storedStatus.chainId),
    id: storedStatus.id,
    status: storedStatus.status,
    version: WALLET_CALLS_VERSION,
  };

  if (!storedStatus.transactionHash) {
    return baseStatus;
  }

  try {
    const chain = await getProviderChainById(storedStatus.chainId);
    const rpcUrl = await getProviderRpcUrl(storedStatus.chainId);
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const receipt = await publicClient.getTransactionReceipt({
      hash: storedStatus.transactionHash,
    });
    const nextStatus: WalletCallBatchStatusRecord = {
      ...storedStatus,
      status: receipt.status === 'success' ? 200 : 500,
    };

    walletCallBatchStatuses.set(statusKey, nextStatus);

    return {
      ...baseStatus,
      receipts: [formatWalletCallReceipt(receipt)],
      status: nextStatus.status,
    };
  } catch {
    return {
      ...baseStatus,
      status: 100,
    };
  }
};

const getWalletCapabilities = async ({
  address,
  chainIds,
  origin,
}: {
  address?: unknown;
  chainIds?: unknown;
  origin: string;
}) => {
  const unlockedAddress = await getUnlockedAddress();
  const requestedAddress =
    typeof address === 'string' && isAddress(address)
      ? getAddress(address)
      : undefined;

  if (typeof address === 'string' && !requestedAddress) {
    throw providerError(-32602, 'Invalid wallet_getCapabilities address.');
  }

  if (requestedAddress && !unlockedAddress) {
    throw providerError(4100, 'Unlock PillarX to use this site.');
  }

  if (!unlockedAddress) return {};

  if (
    requestedAddress &&
    unlockedAddress &&
    requestedAddress !== getAddress(unlockedAddress)
  ) {
    throw providerError(
      4100,
      'Requested capabilities account does not match PillarX.'
    );
  }

  if (unlockedAddress && !(await isOriginConnected(origin, unlockedAddress))) {
    throw providerError(4100, 'Connect PillarX to this site first.');
  }

  const requestedChainIds = Array.isArray(chainIds)
    ? chainIds.map(parseChainId).filter((id): id is number => Boolean(id))
    : [await getSelectedChainId(origin)];

  const capabilities: Record<string, { atomic: { status: string } }> = {};

  for (const requestedChainId of requestedChainIds) {
    if (!(await isProviderSupportedChainId(requestedChainId))) continue;

    capabilities[numberToChainHex(requestedChainId)] = {
      atomic: {
        status: 'supported',
      },
    };
  }

  return capabilities;
};

const unsupportedMethods = new Set<string>();
const pendingProviderApprovals = new Map<string, PendingProviderApproval>();
const pendingProviderConnections = new Map<string, Promise<string>>();
let approvalWindowId: number | undefined;

const approvalStatusPriority = (status?: ProviderApprovalStatus): number => {
  switch (status?.phase) {
    case 'success':
    case 'error':
      return 2;
    case 'confirming':
    case 'submitting':
      return 1;
    default:
      return 0;
  }
};

const scheduleProviderApprovalCleanup = (id: string) => {
  const pending = pendingProviderApprovals.get(id);
  if (!pending || pending.cleanupId) return;

  pending.cleanupId = setTimeout(
    () => {
      pendingProviderApprovals.delete(id);
    },
    5 * 60 * 1000
  );
};

const clearSettledProviderApprovals = () => {
  pendingProviderApprovals.forEach((pending, id) => {
    const phase = pending.view.status?.phase;
    if (phase !== 'success' && phase !== 'error') return;

    clearTimeout(pending.timeoutId);
    if (pending.cleanupId) {
      clearTimeout(pending.cleanupId);
    }

    pendingProviderApprovals.delete(id);
  });
};

const updateProviderApprovalStatus = (
  id: string,
  status: ProviderApprovalStatus
) => {
  const pending = pendingProviderApprovals.get(id);
  if (!pending) return;

  pending.view = {
    ...pending.view,
    status,
  };

  if (status.phase === 'success' || status.phase === 'error') {
    scheduleProviderApprovalCleanup(id);
  }
};

const trackProviderTransactionConfirmation = async ({
  id,
  publicClient,
  transactionHash,
}: {
  id: string;
  publicClient: ReturnType<typeof createPublicClient>;
  transactionHash: Hex;
}) => {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });

    if (receipt.status === 'success') {
      updateProviderApprovalStatus(id, {
        phase: 'success',
        transactionHash,
      });
      return;
    }

    updateProviderApprovalStatus(id, {
      failureType: 'reverted',
      message: 'The transaction reverted on-chain.',
      phase: 'error',
      transactionHash,
    });
  } catch (error) {
    updateProviderApprovalStatus(id, {
      failureType: 'confirmation',
      message:
        error instanceof Error
          ? error.message
          : 'The transaction was submitted, but its confirmation could not be verified.',
      phase: 'error',
      transactionHash,
    });
  }
};

const updateProviderApprovalView = (
  id: string,
  view: Partial<ProviderApprovalRequestView>
) => {
  const pending = pendingProviderApprovals.get(id);
  if (!pending) return;

  pending.view = {
    ...pending.view,
    ...view,
  };
};

const buildPermissions = (origin: string, address: string) => [
  {
    id: `${origin}:eth_accounts`,
    parentCapability: 'eth_accounts',
    invoker: origin,
    caveats: [
      {
        type: 'restrictReturnedAccounts',
        value: [address],
      },
    ],
    date: Date.now(),
  },
];

const getLastFocusedWindowId = (): Promise<number> =>
  new Promise((resolve, reject) => {
    if (!chromeLike?.windows?.getLastFocused) {
      reject(new Error('Chrome windows API is unavailable.'));
      return;
    }

    chromeLike.windows.getLastFocused((currentWindow) => {
      const lastErrorMessage = chromeLike.runtime?.lastError?.message;

      if (lastErrorMessage) {
        reject(new Error(lastErrorMessage));
        return;
      }

      if (typeof currentWindow.id !== 'number') {
        reject(new Error('Unable to resolve current browser window.'));
        return;
      }

      resolve(currentWindow.id);
    });
  });

async function openSidePanel() {
  if (!chromeLike?.sidePanel?.open) {
    throw new Error('Chrome side panel API is unavailable.');
  }

  const windowId = await getLastFocusedWindowId();
  await chromeLike.sidePanel.open({ windowId });
}

const callChromeVoidApi = (
  run: (callback: () => void) => void | Promise<void>
) =>
  new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const result = run(finish);

      if (result && typeof (result as Promise<void>).then === 'function') {
        (result as Promise<void>).then(finish).catch(finish);
      }
    } catch {
      finish();
    }
  });

const setActionPopup = (popup: string) => {
  if (!chromeLike?.action?.setPopup) {
    return Promise.resolve();
  }

  return callChromeVoidApi((callback) =>
    chromeLike.action?.setPopup?.({ popup }, callback)
  );
};

const setSidePanelActionBehavior = (openPanelOnActionClick: boolean) => {
  if (!chromeLike?.sidePanel?.setPanelBehavior) {
    return Promise.resolve();
  }

  return callChromeVoidApi((callback) =>
    chromeLike.sidePanel?.setPanelBehavior?.(
      { openPanelOnActionClick },
      callback
    )
  );
};

const applyExtensionDisplayMode = async (mode: ExtensionDisplayMode) => {
  if (mode === 'sidePanel') {
    await setActionPopup('');
    await setSidePanelActionBehavior(true);
    return;
  }

  await setSidePanelActionBehavior(false);
  await setActionPopup(POPUP_PAGE_PATH);
};

const getExtensionDisplayMode = async () =>
  readExtensionDisplayMode().catch(() => DEFAULT_EXTENSION_DISPLAY_MODE);

void getExtensionDisplayMode().then(applyExtensionDisplayMode);

chromeLike?.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  const nextMode = changes[EXTENSION_DISPLAY_MODE_STORAGE_KEY]?.newValue;

  if (nextMode !== 'popup' && nextMode !== 'sidePanel') return;

  void applyExtensionDisplayMode(nextMode);
});

async function openWalletSurface() {
  const windowId = await getLastFocusedWindowId();
  const displayMode = await getExtensionDisplayMode();

  if (displayMode === 'sidePanel' && chromeLike?.sidePanel?.open) {
    await applyExtensionDisplayMode('sidePanel');
    await chromeLike.sidePanel.open({ windowId });
    return;
  }

  if (chromeLike?.action?.openPopup) {
    try {
      await applyExtensionDisplayMode('popup');
      await chromeLike.action.openPopup({ windowId });
      return;
    } catch {
      // Fall through to the side panel fallback below.
    }
  }

  if (chromeLike?.sidePanel?.open) {
    await chromeLike.sidePanel.open({ windowId });
    return;
  }

  throw new Error('No PillarX wallet surface is available.');
}

chromeLike?.action?.onClicked?.addListener(() => {
  void openWalletSurface().catch((error) => {
    console.error('Failed to open PillarX wallet surface', error);
  });
});

const createChromeWindow = (
  options: ChromeWindowCreateOptions
): Promise<ChromeWindow> =>
  new Promise((resolve, reject) => {
    if (!chromeLike?.windows?.create) {
      reject(new Error('Chrome windows.create API is unavailable.'));
      return;
    }

    chromeLike.windows.create(options, (createdWindow) => {
      const lastErrorMessage = chromeLike.runtime?.lastError?.message;
      if (lastErrorMessage) {
        reject(new Error(lastErrorMessage));
        return;
      }

      resolve(createdWindow ?? {});
    });
  });

const focusChromeWindow = (windowId: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!chromeLike?.windows?.update) {
      resolve();
      return;
    }

    chromeLike.windows.update(
      windowId,
      { drawAttention: true, focused: true },
      () => {
        const lastErrorMessage = chromeLike.runtime?.lastError?.message;
        if (lastErrorMessage) {
          reject(new Error(lastErrorMessage));
          return;
        }

        resolve();
      }
    );
  });

const closeApprovalSurface = () => {
  const windowId = approvalWindowId;
  if (windowId === undefined) return;

  approvalWindowId = undefined;
  chromeLike?.windows?.remove?.(windowId, () => {
    if (chromeLike.runtime?.lastError) return;
  });
};

const closeApprovalSurfaceIfIdle = () => {
  if (pendingProviderApprovals.size > 0) return;
  closeApprovalSurface();
};

async function openApprovalSurface() {
  const approvalUrl = chromeLike?.runtime?.getURL?.('extension/approval.html');
  if (!approvalUrl) {
    throw new Error('Unable to resolve PillarX approval page URL.');
  }

  if (approvalWindowId !== undefined) {
    try {
      await focusChromeWindow(approvalWindowId);
      return;
    } catch {
      approvalWindowId = undefined;
    }
  }

  const createdWindow = await createChromeWindow({
    focused: true,
    height: APPROVAL_WINDOW_HEIGHT,
    type: 'popup',
    url: approvalUrl,
    width: APPROVAL_WINDOW_WIDTH,
  });

  approvalWindowId = createdWindow.id;
}

const rejectPendingProviderApprovals = (message: string) => {
  pendingProviderApprovals.forEach((pending, id) => {
    clearTimeout(pending.timeoutId);
    if (pending.cleanupId) {
      clearTimeout(pending.cleanupId);
    }

    if (!pending.approved) {
      pending.reject(providerError(4001, message));
    }

    pendingProviderApprovals.delete(id);
  });
};

const getConnectedAccount = async (
  origin: string
): Promise<UnlockedAccount> => {
  const account = await getUnlockedAccount();
  if (!account) {
    openWalletSurface().catch(() => undefined);
    throw providerError(4100, 'Unlock PillarX to use this site.');
  }

  const connected = await isOriginConnected(origin, account.address);
  if (!connected) {
    throw providerError(4100, 'Connect PillarX to this site first.');
  }

  return account;
};

const requestProviderApproval = ({
  account,
  accountAddress,
  chainId,
  estimatedFee,
  feePaymentOptions,
  message,
  method,
  preparation,
  simulation,
}: {
  account?: UnlockedAccount;
  accountAddress?: string;
  chainId: number;
  estimatedFee?: TransactionFeeEstimateView;
  feePaymentOptions?: ProviderApprovalFeePaymentOption[];
  message: ProviderRuntimeRequestMessage;
  method: ProviderApprovalKind;
  preparation?: ProviderApprovalRequestView['preparation'];
  simulation?: TransactionSimulationView;
}) => {
  const approvalPromise = new Promise<
    { feePayment?: ProviderApprovalFeePayment } | undefined
  >((resolve, reject) => {
    const timeoutId = setTimeout(
      () => {
        pendingProviderApprovals.delete(message.id);
        reject(providerError(4001, 'PillarX request approval timed out.'));
      },
      5 * 60 * 1000
    );

    clearSettledProviderApprovals();

    pendingProviderApprovals.set(message.id, {
      reject,
      resolve,
      timeoutId,
      view: {
        id: message.id,
        account: account?.address ?? accountAddress,
        chainId,
        createdAt: Date.now(),
        estimatedFee,
        feePaymentOptions,
        favicon: message.favicon,
        method,
        origin: message.origin,
        params: message.args.params,
        preparation,
        simulation,
        title: message.title,
        url: message.url,
      },
    });

    openApprovalSurface().catch((error) => {
      clearTimeout(timeoutId);
      pendingProviderApprovals.delete(message.id);
      reject(
        providerError(
          4001,
          error instanceof Error
            ? error.message
            : 'Unable to open PillarX approval window.'
        )
      );
    });
  });

  getProviderChainById(chainId)
    .then((approvalChain) => {
      updateProviderApprovalView(message.id, {
        chainName: approvalChain.name,
        nativeCurrencySymbol: approvalChain.nativeCurrency.symbol,
      });
    })
    .catch(() => undefined);

  return approvalPromise;
};

const failProviderApprovalPreparation = async ({
  approvalPromise,
  error,
  id,
}: {
  approvalPromise: ReturnType<typeof requestProviderApproval>;
  error: unknown;
  id: string;
}): Promise<never> => {
  const preparationError =
    error instanceof Error
      ? error.message
      : 'Transaction gas estimation failed.';

  updateProviderApprovalView(id, {
    preparation: {
      message: preparationError,
      phase: 'revert',
    },
  });

  try {
    await approvalPromise;
  } catch {
    // The failed request remains visible until the user dismisses it.
  }

  throw error;
};

const getPendingProviderApprovalViews = () =>
  Array.from(pendingProviderApprovals.values())
    .map((pending) => pending.view)
    .sort((a, b) => {
      const statusDelta =
        approvalStatusPriority(a.status) - approvalStatusPriority(b.status);
      if (statusDelta !== 0) return statusDelta;
      return a.createdAt - b.createdAt;
    });

const respondToProviderApproval = ({
  approved,
  feePayment,
  id,
}: ProviderApprovalRespondMessage) => {
  const pending = pendingProviderApprovals.get(id);
  if (!pending) {
    throw providerError(4900, 'PillarX approval request is no longer pending.');
  }

  clearTimeout(pending.timeoutId);

  if (approved) {
    if (
      pending.view.preparation &&
      pending.view.preparation.phase !== 'ready'
    ) {
      throw providerError(
        -32000,
        pending.view.preparation.phase === 'revert'
          ? 'Transaction gas estimation indicates this request will revert.'
          : 'Transaction gas estimation is still in progress.'
      );
    }

    pending.approved = true;
    if (
      pending.view.method === 'eth_sendTransaction' ||
      pending.view.method === 'wallet_sendCalls'
    ) {
      updateProviderApprovalStatus(id, {
        message: 'Waiting for the transaction hash from the network.',
        phase: 'submitting',
      });
    } else {
      pendingProviderApprovals.delete(id);
      closeApprovalSurfaceIfIdle();
    }

    pending.resolve({ feePayment });
    return { ok: true };
  }

  pendingProviderApprovals.delete(id);
  closeApprovalSurfaceIfIdle();
  pending.reject(providerError(4001, 'User rejected the PillarX request.'));
  return { ok: true };
};

const requestProviderConnection = ({
  chainId,
  message,
}: {
  chainId: number;
  message: ProviderRuntimeRequestMessage;
}) => {
  const existingRequest = pendingProviderConnections.get(message.origin);
  if (existingRequest) return existingRequest;

  const connectionRequest = (async () => {
    const currentAddress = await getUnlockedAddress();
    if (
      currentAddress &&
      (await isOriginConnected(message.origin, currentAddress))
    ) {
      return currentAddress;
    }

    await requestProviderApproval({
      accountAddress: currentAddress,
      chainId,
      message,
      method: 'eth_requestAccounts',
    });

    const address = await getUnlockedAddress();
    if (!address) {
      throw providerError(4100, 'Unlock PillarX to connect this site.');
    }

    await connectOrigin({
      origin: message.origin,
      address,
      title: message.title,
      favicon: message.favicon,
    });

    return address;
  })();

  pendingProviderConnections.set(message.origin, connectionRequest);

  const clearConnectionRequest = () => {
    if (pendingProviderConnections.get(message.origin) === connectionRequest) {
      pendingProviderConnections.delete(message.origin);
    }
  };

  connectionRequest.then(clearConnectionRequest, clearConnectionRequest);
  return connectionRequest;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const ensureKeyringHostDocument = async () => {
  if (!chromeLike?.offscreen?.createDocument || !chromeLike.runtime?.getURL) {
    return false;
  }

  if (await chromeLike.offscreen.hasDocument?.()) {
    return true;
  }

  if (!keyringHostCreationPromise) {
    keyringHostCreationPromise = chromeLike.offscreen
      .createDocument({
        url: chromeLike.runtime.getURL(KEYRING_HOST_DOCUMENT_PATH),
        reasons: ['WORKERS'],
        justification:
          'Keep the PillarX keyring unlocked in extension memory for the current browser session.',
      })
      .finally(() => {
        keyringHostCreationPromise = undefined;
      });
  }

  await keyringHostCreationPromise;
  return true;
};

const sendKeyringHostRequest = async <T>({
  method,
  payload,
}: PillarKeyringHostRequestMessage): Promise<T> => {
  if (!chromeLike?.runtime?.sendMessage) {
    throw new Error('PillarX keyring runtime is not available.');
  }

  const hasHost = await ensureKeyringHostDocument();
  if (!hasHost) {
    throw new Error('PillarX keyring host is not available.');
  }

  const message: PillarKeyringHostRequestMessage = {
    type: PILLARX_KEYRING_HOST_REQUEST,
    method,
    payload,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await new Promise<T>((resolve, reject) => {
        chromeLike.runtime?.sendMessage?.(message, (response) => {
          const runtimeError = chromeLike.runtime?.lastError?.message;
          if (runtimeError) {
            reject(new Error(runtimeError));
            return;
          }

          const keyringResponse = response as
            | PillarKeyringResponseMessage
            | undefined;
          if (!keyringResponse) {
            reject(new Error('PillarX keyring host did not respond.'));
            return;
          }

          if (!keyringResponse.ok) {
            reject(new Error(keyringResponse.error));
            return;
          }

          resolve(
            decodePillarKeyringMessagePayload(keyringResponse.result) as T
          );
        });
      });
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof Error) ||
        !error.message.includes('Receiving end does not exist')
      ) {
        throw error;
      }

      // eslint-disable-next-line no-await-in-loop
      await wait(100);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('PillarX keyring host did not respond.');
};

const handleLocalKeyringRequest = async ({
  method,
  payload,
}: PillarKeyringRequestMessage) => {
  const decodedPayload = decodePillarKeyringMessagePayload(payload);
  const payloadObject = isObject(decodedPayload) ? decodedPayload : {};

  switch (method) {
    case 'getStatus':
      return keyringController.getStatus();

    case 'unlock': {
      const { passphrase } = payloadObject;
      if (typeof passphrase !== 'string') {
        throw providerError(-32602, 'Invalid keyring unlock payload.');
      }

      return keyringController.unlock(passphrase);
    }

    case 'unlockOrImportPrivateKey': {
      const { passphrase, privateKey } = payloadObject;
      if (
        typeof passphrase !== 'string' ||
        typeof privateKey !== 'string' ||
        !/^0x[a-fA-F0-9]{64}$/.test(privateKey)
      ) {
        throw providerError(-32602, 'Invalid keyring unlock payload.');
      }

      return keyringController.unlockOrImportPrivateKey({
        passphrase,
        privateKey,
      });
    }

    case 'lock':
      await keyringController.lock();
      return keyringController.getStatus();

    case 'signMessage':
      return keyringController.signMessage({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        message: payloadObject.message as SignableMessage,
      });

    case 'signTransaction':
      return keyringController.signTransaction({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        transaction: payloadObject.transaction as TransactionSerializable,
      });

    case 'signTypedData':
      return keyringController.signTypedData({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        typedData: payloadObject.typedData as TypedDataDefinition,
      });

    case 'signAuthorization':
      return keyringController.signAuthorization({
        address:
          typeof payloadObject.address === 'string'
            ? (payloadObject.address as `0x${string}`)
            : undefined,
        authorization: payloadObject.authorization as Parameters<
          PillarKeyringController['signAuthorization']
        >[0]['authorization'],
      });

    default:
      throw providerError(4200, 'Unsupported PillarX keyring method.');
  }
};

async function handleKeyringRequest(
  message: PillarKeyringRequestMessage
): Promise<unknown> {
  if (chromeLike?.offscreen?.createDocument) {
    return sendKeyringHostRequest({
      type: PILLARX_KEYRING_HOST_REQUEST,
      method: message.method,
      payload: message.payload,
    });
  }

  return handleLocalKeyringRequest(message);
}

async function handleKeyringStorageRequest(
  message: PillarKeyringStorageRequestMessage
): Promise<unknown> {
  if (message.key !== PILLARX_KEYRING_VAULT_STORAGE_KEY) {
    throw providerError(-32602, 'Unsupported PillarX keyring storage key.');
  }

  if (message.action === 'get') {
    return getKeyringStorageValue(message.key);
  }

  if (message.action === 'set') {
    await setKeyringStorageValue(
      message.key,
      decodePillarKeyringMessagePayload(message.value)
    );
    return true;
  }

  throw providerError(-32602, 'Unsupported PillarX keyring storage action.');
}

const handleProviderRequest = async (
  message: ProviderRuntimeRequestMessage
) => {
  const { method, params } = message.args;
  const { origin } = message;
  const chainId = await getSelectedChainId(origin);

  switch (method) {
    case 'eth_chainId':
      return numberToChainHex(chainId);

    case 'net_version':
      return String(chainId);

    case 'eth_accounts': {
      const address = await getUnlockedAddress();
      if (!address) return [];

      const connected = await isOriginConnected(origin, address);
      return connected ? [address] : [];
    }

    case 'eth_requestAccounts': {
      const address = await requestProviderConnection({ chainId, message });
      return [address];
    }

    case 'eth_coinbase': {
      const address = await getUnlockedAddress();
      if (!address) return null;

      const connected = await isOriginConnected(origin, address);
      return connected ? address : null;
    }

    case 'wallet_getPermissions': {
      const address = await getUnlockedAddress();
      if (!address) return [];

      const connected = await isOriginConnected(origin, address);
      return connected ? buildPermissions(origin, address) : [];
    }

    case 'wallet_requestPermissions': {
      const firstParam = requestFirstParam(params);
      if (!firstParam || !('eth_accounts' in firstParam)) {
        throw providerError(
          4200,
          'PillarX only supports eth_accounts permissions right now.'
        );
      }

      const [address] = (await handleProviderRequest({
        ...message,
        args: { method: 'eth_requestAccounts' },
      })) as string[];

      return buildPermissions(origin, address);
    }

    case 'wallet_revokePermissions':
      await revokeOrigin(origin);
      return null;

    case 'wallet_switchEthereumChain': {
      const requestedChainId = parseChainId(requestFirstParam(params)?.chainId);

      if (!requestedChainId) {
        throw providerError(4901, 'Missing chainId for wallet switch request.');
      }

      await setSelectedChainId(origin, requestedChainId);
      return null;
    }

    case 'wallet_addEthereumChain': {
      const firstParam = requestFirstParam(params) as
        | WalletAddEthereumChainRequest
        | undefined;
      const requestedChainId = parseChainId(firstParam?.chainId);

      if (!requestedChainId) {
        throw providerError(
          4901,
          'Missing chainId for wallet add chain request.'
        );
      }

      if (!supportedChainIds.has(requestedChainId)) {
        if (!firstParam) {
          throw providerError(-32602, 'Missing wallet add chain request.');
        }

        await upsertProviderCustomChain(
          getWalletAddEthereumChainCustomChain(firstParam)
        );
      }

      await setSelectedChainId(origin, requestedChainId);
      return null;
    }

    case 'personal_sign': {
      const account = await getConnectedAccount(origin);
      const values = requestParamsArray(params);

      if (values.length < 2) {
        throw providerError(-32602, 'Missing personal_sign parameters.');
      }

      assertRequestedAccount(values[1], account.address);
      await requestProviderApproval({
        account,
        chainId,
        message,
        method,
      });

      return account.signMessage({
        message: normalizeSignableMessage(values[0]),
      });
    }

    case 'eth_sign': {
      const account = await getConnectedAccount(origin);
      const values = requestParamsArray(params);

      if (values.length < 2) {
        throw providerError(-32602, 'Missing eth_sign parameters.');
      }

      assertRequestedAccount(values[0], account.address);
      await requestProviderApproval({
        account,
        chainId,
        message,
        method,
      });

      return account.signMessage({
        message: normalizeSignableMessage(values[1]),
      });
    }

    case 'eth_signTypedData':
    case 'eth_signTypedData_v3':
    case 'eth_signTypedData_v4': {
      const account = await getConnectedAccount(origin);
      const { address, typedData } = parseAddressAndTypedData(params);

      assertRequestedAccount(address, account.address);
      await requestProviderApproval({
        account,
        chainId,
        message,
        method,
      });

      return signTypedDataForDapp({
        account,
        chainId,
        typedData,
      });
    }

    case 'eth_sendRawTransaction':
      return requestRpc({
        chainId,
        method,
        params,
      });

    case 'eth_signTransaction': {
      const account = await getConnectedAccount(origin);
      const transaction = requestFirstParam(params) as
        | DappTransactionRequest
        | undefined;

      if (!transaction) {
        throw providerError(-32602, 'Missing transaction request.');
      }

      const effectiveChainId = await getEffectiveDappTransactionChainId({
        fallbackChainId: chainId,
        transaction,
      });
      const approvalPromise = requestProviderApproval({
        account,
        chainId: effectiveChainId,
        message,
        method,
        preparation: { phase: 'estimating' },
      });
      approvalPromise.catch(() => undefined);
      const preparedTransaction = await (async () => {
        try {
          const prepared = await buildDappTransactionRequest({
            account,
            chainId: effectiveChainId,
            transaction,
          });
          const estimatedFee = await getDappTransactionFeeEstimate(prepared);
          const simulation = await getDappTransactionSimulation({
            account,
            chainId: effectiveChainId,
            estimatedFee,
            transaction,
          }).catch((error) =>
            alchemyApiKey
              ? {
                  changes: [],
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Alchemy transaction simulation failed.',
                }
              : undefined
          );

          updateProviderApprovalView(message.id, {
            estimatedFee,
            preparation: { phase: 'ready' },
            simulation,
          });

          return prepared;
        } catch (error) {
          return failProviderApprovalPreparation({
            approvalPromise,
            error,
            id: message.id,
          });
        }
      })();

      await approvalPromise;

      return preparedTransaction.walletClient.signTransaction(
        preparedTransaction.request
      );
    }

    case 'eth_sendTransaction': {
      const account = await getConnectedAccount(origin);
      const transaction = requestFirstParam(params) as
        | DappTransactionRequest
        | undefined;

      if (!transaction) {
        throw providerError(-32602, 'Missing transaction request.');
      }

      const effectiveChainId = await getEffectiveDappTransactionChainId({
        fallbackChainId: chainId,
        transaction,
      });
      const approvalPromise = requestProviderApproval({
        account,
        chainId: effectiveChainId,
        message,
        method,
        preparation: { phase: 'estimating' },
      });
      approvalPromise.catch(() => undefined);
      const preparedTransaction = await (async () => {
        try {
          const prepared = await buildDappTransactionRequest({
            account,
            chainId: effectiveChainId,
            transaction,
          });
          const estimatedFee = await getDappTransactionFeeEstimate(prepared);
          const [simulation, feePaymentOptions] = await Promise.all([
            getDappTransactionSimulation({
              account,
              chainId: effectiveChainId,
              estimatedFee,
              transaction,
            }).catch((error) =>
              alchemyApiKey
                ? {
                    changes: [],
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Alchemy transaction simulation failed.',
                  }
                : undefined
            ),
            getDappFeePaymentOptions({
              account,
              chainId: effectiveChainId,
            }),
          ]);

          updateProviderApprovalView(message.id, {
            estimatedFee,
            feePaymentOptions,
            preparation: { phase: 'ready' },
            simulation,
          });

          return prepared;
        } catch (error) {
          return failProviderApprovalPreparation({
            approvalPromise,
            error,
            id: message.id,
          });
        }
      })();
      const approvalResponse = await approvalPromise;

      try {
        const transactionHash = isGaslessFeePayment(
          approvalResponse?.feePayment
        )
          ? await sendGaslessDappTransaction({
              account,
              chainId: effectiveChainId,
              feePayment: approvalResponse.feePayment,
              transaction,
            })
          : await preparedTransaction.walletClient.sendTransaction(
              preparedTransaction.request
            );

        updateProviderApprovalStatus(message.id, {
          phase: 'confirming',
          transactionHash,
        });
        trackProviderTransactionConfirmation({
          id: message.id,
          publicClient: preparedTransaction.publicClient,
          transactionHash,
        }).catch(() => undefined);

        return transactionHash;
      } catch (error) {
        updateProviderApprovalStatus(message.id, {
          failureType: 'submission',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to send this transaction.',
          phase: 'error',
        });

        throw error;
      }
    }

    case 'wallet_sendCalls': {
      pruneWalletCallBatchStatuses();

      const account = await getConnectedAccount(origin);
      const sendCallsRequest = parseWalletSendCallsRequest(params);
      const statusKey = getWalletCallBatchStatusKey(
        origin,
        sendCallsRequest.id
      );

      if (walletCallBatchStatuses.has(statusKey)) {
        throw providerError(
          -32602,
          'Duplicate wallet_sendCalls id for this site.'
        );
      }

      assertRequestedAccount(
        sendCallsRequest.from ?? account.address,
        account.address
      );

      if (!(await isProviderSupportedChainId(sendCallsRequest.chainId))) {
        throw providerError(
          4901,
          `PillarX is not connected to chain ${sendCallsRequest.chainId}.`
        );
      }

      const approvalPromise = requestProviderApproval({
        account,
        chainId: sendCallsRequest.chainId,
        message,
        method,
        preparation: { phase: 'estimating' },
      });
      approvalPromise.catch(() => undefined);
      const preparedTransaction = await (async () => {
        try {
          const prepared = await buildDappBatchTransactionRequest({
            account,
            calls: sendCallsRequest.calls,
            chainId: sendCallsRequest.chainId,
          });
          const estimatedFee = await getDappTransactionFeeEstimate(prepared);
          const simulationCall =
            sendCallsRequest.calls.length === 1
              ? sendCallsRequest.calls[0]
              : undefined;
          const [simulation, feePaymentOptions] = await Promise.all([
            getDappTransactionSimulation({
              account,
              chainId: sendCallsRequest.chainId,
              estimatedFee,
              transaction: {
                chainId: numberToChainHex(sendCallsRequest.chainId),
                data: simulationCall?.data ?? prepared.request.data,
                from: account.address,
                to: simulationCall?.to ?? account.address,
                value: quantityToHex(simulationCall?.value ?? BigInt(0)),
              },
            }).catch((error) =>
              alchemyApiKey
                ? {
                    changes: [],
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Alchemy transaction simulation failed.',
                  }
                : undefined
            ),
            getDappFeePaymentOptions({
              account,
              chainId: sendCallsRequest.chainId,
            }),
          ]);

          updateProviderApprovalView(message.id, {
            estimatedFee,
            feePaymentOptions,
            preparation: { phase: 'ready' },
            simulation,
          });

          return prepared;
        } catch (error) {
          return failProviderApprovalPreparation({
            approvalPromise,
            error,
            id: message.id,
          });
        }
      })();
      const approvalResponse = await approvalPromise;

      try {
        const transactionHash = isGaslessFeePayment(
          approvalResponse?.feePayment
        )
          ? await sendGaslessDappCalls({
              account,
              calls: sendCallsRequest.calls,
              chainId: sendCallsRequest.chainId,
              feePayment: approvalResponse.feePayment,
            })
          : await preparedTransaction.walletClient.sendTransaction(
              preparedTransaction.request
            );

        walletCallBatchStatuses.set(statusKey, {
          atomic: true,
          chainId: sendCallsRequest.chainId,
          createdAt: Date.now(),
          id: sendCallsRequest.id,
          status: 100,
          transactionHash,
        });

        updateProviderApprovalStatus(message.id, {
          phase: 'confirming',
          transactionHash,
        });
        trackProviderTransactionConfirmation({
          id: message.id,
          publicClient: preparedTransaction.publicClient,
          transactionHash,
        }).catch(() => undefined);

        return {
          id: sendCallsRequest.id,
        };
      } catch (error) {
        walletCallBatchStatuses.set(statusKey, {
          atomic: true,
          chainId: sendCallsRequest.chainId,
          createdAt: Date.now(),
          error:
            error instanceof Error
              ? error.message
              : 'Unable to submit wallet_sendCalls.',
          id: sendCallsRequest.id,
          status: 400,
        });

        updateProviderApprovalStatus(message.id, {
          failureType: 'submission',
          message:
            error instanceof Error
              ? error.message
              : 'Unable to submit wallet_sendCalls.',
          phase: 'error',
        });

        throw error;
      }
    }

    case 'wallet_getCallsStatus': {
      const [id] = requestParamsArray(params);
      if (typeof id !== 'string') {
        throw providerError(-32602, 'Missing wallet_getCallsStatus id.');
      }

      return getWalletCallsStatus({ id, origin });
    }

    case 'wallet_showCallsStatus': {
      const [id] = requestParamsArray(params);
      if (typeof id !== 'string') {
        throw providerError(-32602, 'Missing wallet_showCallsStatus id.');
      }

      const statusKey = getWalletCallBatchStatusKey(origin, id);
      if (!walletCallBatchStatuses.has(statusKey)) {
        throw providerError(4900, 'Unknown wallet_sendCalls batch id.');
      }

      return null;
    }

    case 'wallet_getCapabilities': {
      const values = requestParamsArray(params);

      return getWalletCapabilities({
        address: values[0],
        chainIds: values[1],
        origin,
      });
    }

    default:
      if (unsupportedMethods.has(method)) {
        throw providerError(
          4200,
          `${method} needs a PillarX approval UI before it can be enabled.`
        );
      }

      return requestRpc({
        chainId,
        method,
        params,
      });
  }
};

chromeLike?.runtime?.onInstalled?.addListener((details) => {
  // eslint-disable-next-line no-console
  console.info('PillarX extension installed/updated', details.reason);
});

chromeLike?.runtime?.onConnect?.addListener((port) => {
  if (port.name !== PILLARX_KEEP_ALIVE_PORT) return;

  keepAlivePorts.add(port);

  port.onMessage?.addListener((message) => {
    if (!isObject(message) || message.type !== 'PILLARX_KEEP_ALIVE') return;

    port.postMessage?.({
      ok: true,
      type: 'PILLARX_KEEP_ALIVE_ACK',
    });
  });

  port.onDisconnect?.addListener(() => {
    keepAlivePorts.delete(port);
  });
});

chromeLike?.windows?.onRemoved?.addListener((windowId) => {
  if (windowId !== approvalWindowId) return;

  approvalWindowId = undefined;
  rejectPendingProviderApprovals('User closed the PillarX approval window.');
});

chromeLike?.runtime?.onMessage?.addListener(
  (message, _sender, sendResponse) => {
    if (isObject(message) && message.type === PILLARX_KEYRING_STORAGE_REQUEST) {
      handleKeyringStorageRequest(message as PillarKeyringStorageRequestMessage)
        .then((result) => {
          sendResponse({
            ok: true,
            result: encodePillarKeyringMessagePayload(result),
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    if (isObject(message) && message.type === PILLARX_KEYRING_REQUEST) {
      handleKeyringRequest(message as PillarKeyringRequestMessage)
        .then((result) => {
          sendResponse({
            ok: true,
            result: encodePillarKeyringMessagePayload(result),
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    if (
      isObject(message) &&
      message.type === PILLARX_PROVIDER_RPC_REQUEST &&
      typeof message.id === 'string' &&
      typeof message.origin === 'string' &&
      typeof message.url === 'string' &&
      isObject(message.args) &&
      typeof message.args.method === 'string'
    ) {
      handleProviderRequest(message as ProviderRuntimeRequestMessage)
        .then((result) => {
          const response: ProviderRuntimeResponseMessage = {
            id: (message as ProviderRuntimeRequestMessage).id,
            result,
          };
          sendResponse(response);
        })
        .catch((error) => {
          const response: ProviderRuntimeResponseMessage = {
            id: (message as ProviderRuntimeRequestMessage).id,
            error: serializeProviderError(error),
          };
          sendResponse(response);
        });

      return true;
    }

    if (
      isObject(message) &&
      message.type === PILLARX_PROVIDER_APPROVAL_GET_PENDING
    ) {
      sendResponse({
        ok: true,
        pending: getPendingProviderApprovalViews(),
      });
      return true;
    }

    if (
      isObject(message) &&
      message.type === PILLARX_PROVIDER_APPROVAL_RESPOND
    ) {
      try {
        sendResponse(
          respondToProviderApproval(message as ProviderApprovalRespondMessage)
        );
      } catch (error) {
        sendResponse({
          ok: false,
          error: serializeProviderError(error),
        });
      }
      return true;
    }

    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      (message as { type?: string }).type === 'PILLARX_EXTENSION_PING'
    ) {
      sendResponse({ ok: true, source: 'background' });
      return true;
    }

    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      (message as { type?: string }).type === OPEN_SIDE_PANEL_MESSAGE_TYPE
    ) {
      openSidePanel()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    return false;
  }
);
