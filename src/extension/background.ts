import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  isAddress,
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
  gnosis,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from 'viem/chains';

import {
  PILLARX_PROVIDER_APPROVAL_GET_PENDING,
  PILLARX_PROVIDER_APPROVAL_RESPOND,
  PILLARX_PROVIDER_RPC_REQUEST,
  ProviderApprovalKind,
  ProviderApprovalRequestView,
  ProviderApprovalRespondMessage,
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
import {
  encodePillarExecuteCall,
  PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
} from '../utils/pillarSmartAccountClient';

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
    openPopup?: (options?: { windowId?: number }) => Promise<void>;
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
    update?: (
      windowId: number,
      options: ChromeWindowUpdateOptions,
      callback?: (window?: ChromeWindow) => void
    ) => void;
  };
  storage?: {
    local?: ChromeStorageAreaLike;
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
const keepAlivePorts = new Set<ChromePortLike>();
let keyringHostCreationPromise: Promise<void> | undefined;

chromeLike?.storage?.session?.remove?.(LEGACY_UNLOCKED_PRIVATE_KEY_SESSION_KEY);
const CONNECTED_DAPPS_STORAGE_KEY = 'pillarx:dapp:connected:v1';
const SELECTED_CHAIN_STORAGE_KEY = 'pillarx:dapp:selectedChain:v1';
const DEFAULT_MAINNET_CHAIN_ID = 1;
const DEFAULT_TESTNET_CHAIN_ID = 11155111;
const APPROVAL_WINDOW_WIDTH = 430;
const APPROVAL_WINDOW_HEIGHT = 620;
const alchemyNetworkByChainId: Record<number, string> = {
  [mainnet.id]: 'eth-mainnet',
  [polygon.id]: 'polygon-mainnet',
  [base.id]: 'base-mainnet',
  [bsc.id]: 'bnb-mainnet',
  [optimism.id]: 'opt-mainnet',
  [arbitrum.id]: 'arb-mainnet',
  [sepolia.id]: 'eth-sepolia',
  [gnosis.id]: 'gnosis-mainnet',
};
const chainNativeSymbols: Record<number, string> = {
  [mainnet.id]: 'ETH',
  [polygon.id]: 'POL',
  [base.id]: 'ETH',
  [bsc.id]: 'BNB',
  [optimism.id]: 'ETH',
  [arbitrum.id]: 'ETH',
  [sepolia.id]: 'ETH',
  [gnosis.id]: 'XDAI',
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
        ...(import.meta.env.VITE_FEATURE_FLAG_GNOSIS === 'true' ? [100] : []),
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
  [gnosis.id]: gnosis,
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

type TransactionFeeEstimateView = ProviderApprovalRequestView['estimatedFee'];
type TransactionSimulationView = ProviderApprovalRequestView['simulation'];

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

type PendingProviderApproval = {
  reject: (error: ProviderRpcError) => void;
  resolve: () => void;
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

const formatNativeFee = (wei: bigint, chainId: number) => {
  const symbol = chainNativeSymbols[chainId] ?? 'native';
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

  if (supportedChainIds.has(selectedChainId)) {
    return selectedChainId;
  }

  return defaultChainId;
};

const setSelectedChainId = async (origin: string, chainId: number) => {
  if (!supportedChainIds.has(chainId)) {
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

const buildDappTransactionRequest = async ({
  account,
  chainId,
  transaction,
}: {
  account: UnlockedAccount;
  chainId: number;
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
  const gas = parseQuantity(transaction.gas ?? transaction.gasLimit);
  const innerCall = {
    to: getAddress(transaction.to),
    value: parseQuantity(transaction.value) ?? BigInt(0),
    data: normalizeHexData(transaction.data),
  };
  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl(chainId)),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getRpcUrl(chainId)),
  });

  return {
    chainId,
    request: {
      account,
      chain,
      to: account.address,
      value: BigInt(0),
      data: encodePillarExecuteCall(innerCall),
      ...(authorization ? { authorizationList: [authorization] } : {}),
      ...(gas !== undefined ? { gas } : {}),
      ...(transaction.gasPrice !== undefined
        ? { gasPrice: parseQuantity(transaction.gasPrice) }
        : {}),
      ...(transaction.maxFeePerGas !== undefined
        ? { maxFeePerGas: parseQuantity(transaction.maxFeePerGas) }
        : {}),
      ...(transaction.maxPriorityFeePerGas !== undefined
        ? {
            maxPriorityFeePerGas: parseQuantity(
              transaction.maxPriorityFeePerGas
            ),
          }
        : {}),
      ...(transaction.nonce !== undefined
        ? { nonce: parseNonce(transaction.nonce) }
        : {}),
    },
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
    formatted: formatNativeFee(totalWei, chainId),
    gas: gas.toString(),
    totalWei: totalWei.toString(),
  };
};

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
  const changes = (json.result?.changes ?? [])
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

      return {
        amount: change.amount,
        assetType: change.assetType,
        changeType: change.changeType,
        contractAddress: change.contractAddress,
        direction,
        logo: change.logo,
        name: change.name,
        symbol: change.symbol,
        tokenId: change.tokenId,
      };
    })
    .filter(
      (
        change
      ): change is NonNullable<
        NonNullable<TransactionSimulationView>['changes'][number]
      > => Boolean(change)
    )
    .sort((a, b) => {
      if (a.direction === b.direction) return 0;
      return a.direction === 'spend' ? -1 : 1;
    });

  return { changes };
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
  const response = await fetch(getRpcUrl(chainId), {
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

const unsupportedMethods = new Set([
  'wallet_sendCalls',
  'wallet_getCallsStatus',
]);
const pendingProviderApprovals = new Map<string, PendingProviderApproval>();
let approvalWindowId: number | undefined;

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

async function openWalletSurface() {
  const windowId = await getLastFocusedWindowId();

  if (chromeLike?.action?.openPopup) {
    try {
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
  pendingProviderApprovals.forEach((pending) => {
    clearTimeout(pending.timeoutId);
    pending.reject(providerError(4001, message));
  });
  pendingProviderApprovals.clear();
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

const requestProviderApproval = async ({
  account,
  accountAddress,
  chainId,
  estimatedFee,
  message,
  method,
  simulation,
}: {
  account?: UnlockedAccount;
  accountAddress?: string;
  chainId: number;
  estimatedFee?: TransactionFeeEstimateView;
  message: ProviderRuntimeRequestMessage;
  method: ProviderApprovalKind;
  simulation?: TransactionSimulationView;
}) =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => {
        pendingProviderApprovals.delete(message.id);
        reject(providerError(4001, 'PillarX request approval timed out.'));
      },
      5 * 60 * 1000
    );

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
        favicon: message.favicon,
        method,
        origin: message.origin,
        params: message.args.params,
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

const getPendingProviderApprovalViews = () =>
  Array.from(pendingProviderApprovals.values()).map((pending) => pending.view);

const respondToProviderApproval = ({
  approved,
  id,
}: ProviderApprovalRespondMessage) => {
  const pending = pendingProviderApprovals.get(id);
  if (!pending) {
    throw providerError(4900, 'PillarX approval request is no longer pending.');
  }

  clearTimeout(pending.timeoutId);
  pendingProviderApprovals.delete(id);

  if (approved) {
    pending.resolve();
    return { ok: true };
  }

  pending.reject(providerError(4001, 'User rejected the PillarX request.'));
  return { ok: true };
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
      const currentAddress = await getUnlockedAddress();
      if (currentAddress && (await isOriginConnected(origin, currentAddress))) {
        return [currentAddress];
      }

      await requestProviderApproval({
        accountAddress: currentAddress,
        chainId,
        message,
        method,
      });

      const address = await getUnlockedAddress();
      if (!address) {
        throw providerError(4100, 'Unlock PillarX to connect this site.');
      }

      await connectOrigin({
        origin,
        address,
        title: message.title,
        favicon: message.favicon,
      });

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
      const requestedChainId = parseChainId(requestFirstParam(params)?.chainId);

      if (!requestedChainId || !supportedChainIds.has(requestedChainId)) {
        throw providerError(
          4901,
          'PillarX does not support adding this chain yet.'
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

      return account.signTypedData(typedData);
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

      const preparedTransaction = await buildDappTransactionRequest({
        account,
        chainId,
        transaction,
      });
      const estimatedFee = await getDappTransactionFeeEstimate(
        preparedTransaction
      ).catch(() => undefined);
      const simulation = await getDappTransactionSimulation({
        account,
        chainId,
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

      await requestProviderApproval({
        account,
        chainId,
        estimatedFee,
        message,
        method,
        simulation,
      });

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

      const preparedTransaction = await buildDappTransactionRequest({
        account,
        chainId,
        transaction,
      });
      const estimatedFee = await getDappTransactionFeeEstimate(
        preparedTransaction
      ).catch(() => undefined);
      const simulation = await getDappTransactionSimulation({
        account,
        chainId,
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

      await requestProviderApproval({
        account,
        chainId,
        estimatedFee,
        message,
        method,
        simulation,
      });

      return preparedTransaction.walletClient.sendTransaction(
        preparedTransaction.request
      );
    }

    case 'wallet_getCapabilities':
      return {};

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
