import { privateKeyToAccount } from 'viem/accounts';

import {
  PILLARX_PROVIDER_RPC_REQUEST,
  ProviderRequestArguments,
  ProviderRpcErrorPayload,
  ProviderRuntimeRequestMessage,
  ProviderRuntimeResponseMessage,
} from './providerMessages';
import { getEtherspotBundlerUrl } from '../utils/bundler';
import { PHONE_OTP_UNLOCKED_SESSION_KEY } from '../utils/phoneOtpAuthKeys';

type ExtensionInstallReason = {
  reason?: string;
};

type ChromeStorageAreaLike = {
  get: (
    keys: string | string[] | null,
    callback: (items: Record<string, unknown>) => void
  ) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
};

type ChromeRuntimeLike = {
  onInstalled?: {
    addListener: (listener: (details: ExtensionInstallReason) => void) => void;
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
};

type ChromeWindow = {
  id?: number;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
  sidePanel?: {
    open?: (options: { windowId: number }) => Promise<void>;
  };
  windows?: {
    getLastFocused?: (callback: (window: ChromeWindow) => void) => void;
  };
  storage?: {
    local?: ChromeStorageAreaLike;
    session?: ChromeStorageAreaLike;
  };
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
const OPEN_SIDE_PANEL_MESSAGE_TYPE = 'PILLARX_OPEN_SIDE_PANEL';
const CONNECTED_DAPPS_STORAGE_KEY = 'pillarx:dapp:connected:v1';
const SELECTED_CHAIN_STORAGE_KEY = 'pillarx:dapp:selectedChain:v1';
const DEFAULT_MAINNET_CHAIN_ID = 1;
const DEFAULT_TESTNET_CHAIN_ID = 11155111;
const defaultChainId =
  import.meta.env.VITE_USE_TESTNETS === 'true'
    ? DEFAULT_TESTNET_CHAIN_ID
    : DEFAULT_MAINNET_CHAIN_ID;
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

type ConnectedDapp = {
  origin: string;
  address: string;
  connectedAt: number;
  title?: string;
  favicon?: string;
};

type ConnectedDappsState = Record<string, ConnectedDapp>;
type SelectedChainState = Record<string, number>;

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

const getUnlockedAddress = async () => {
  const privateKey = await chromeStorageGet<string | undefined>(
    chromeLike?.storage?.session,
    PHONE_OTP_UNLOCKED_SESSION_KEY,
    undefined
  );

  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    return undefined;
  }

  return privateKeyToAccount(privateKey as `0x${string}`).address;
};

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

const getRpcUrl = (chainId: number) =>
  getEtherspotBundlerUrl({
    chainId,
    apiKey: bundlerApiKey,
  });

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
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_sendRawTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'wallet_sendCalls',
  'wallet_getCallsStatus',
]);

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

const openSidePanel = async () => {
  if (!chromeLike?.sidePanel?.open) {
    throw new Error('Chrome side panel API is unavailable.');
  }

  const windowId = await getLastFocusedWindowId();
  await chromeLike.sidePanel.open({ windowId });
};

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
      const address = await getUnlockedAddress();
      if (!address) {
        openSidePanel().catch(() => undefined);
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

chromeLike?.runtime?.onMessage?.addListener(
  (message, _sender, sendResponse) => {
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
