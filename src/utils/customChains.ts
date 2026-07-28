import {
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  isAddress,
  parseAbi,
} from 'viem';

const CUSTOM_CHAINS_STORAGE_KEY = 'customChains';
export const CUSTOM_CHAINS_UPDATED_EVENT = 'pillarx:customChainsUpdated';
export const CUSTOM_NATIVE_TOKEN_ADDRESS =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const erc20MetadataAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]);

export type CustomChainToken = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
};

export type CustomChain = {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeTokenDecimals: number;
  nativeTokenSymbol: string;
  bundlerUrl?: string;
  gaslessEnabled: boolean;
  tokens: CustomChainToken[];
  createdAt: number;
  updatedAt: number;
};

type JsonRpcResponse<T> = {
  result?: T;
  error?: {
    message?: string;
  };
};

const getStorage = () => {
  if (typeof window === 'undefined') return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const isCustomChainToken = (value: unknown): value is CustomChainToken => {
  const token = value as CustomChainToken;

  return (
    !!token &&
    typeof token.address === 'string' &&
    isAddress(token.address) &&
    typeof token.name === 'string' &&
    typeof token.symbol === 'string' &&
    Number.isInteger(token.decimals)
  );
};

const normalizeNativeTokenSymbol = (symbol: unknown) => {
  if (typeof symbol !== 'string') return 'NATIVE';

  const normalizedSymbol = symbol.trim();

  return normalizedSymbol || 'NATIVE';
};

const isCustomChain = (
  value: unknown
): value is Omit<CustomChain, 'nativeTokenSymbol'> & {
  nativeTokenSymbol?: string;
} => {
  const chain = value as CustomChain;

  return (
    !!chain &&
    Number.isInteger(chain.chainId) &&
    chain.chainId > 0 &&
    typeof chain.chainName === 'string' &&
    typeof chain.rpcUrl === 'string' &&
    Number.isInteger(chain.nativeTokenDecimals) &&
    (chain.nativeTokenSymbol === undefined ||
      typeof chain.nativeTokenSymbol === 'string') &&
    typeof chain.gaslessEnabled === 'boolean' &&
    Array.isArray(chain.tokens) &&
    chain.tokens.every(isCustomChainToken)
  );
};

export const readCustomChains = (): CustomChain[] => {
  const storage = getStorage();
  if (!storage) return [];

  const rawValue = storage.getItem(CUSTOM_CHAINS_STORAGE_KEY);
  if (!rawValue) return [];

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter(isCustomChain).map((chain) => ({
      ...chain,
      nativeTokenSymbol: normalizeNativeTokenSymbol(chain.nativeTokenSymbol),
    }));
  } catch {
    storage.removeItem(CUSTOM_CHAINS_STORAGE_KEY);
    return [];
  }
};

export const writeCustomChains = (chains: CustomChain[]) => {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(CUSTOM_CHAINS_STORAGE_KEY, JSON.stringify(chains));

  window.dispatchEvent(new Event(CUSTOM_CHAINS_UPDATED_EVENT));
};

export const upsertCustomChain = (chain: CustomChain) => {
  const customChains = readCustomChains();
  const existingChainIndex = customChains.findIndex(
    (item) => item.chainId === chain.chainId
  );

  if (existingChainIndex < 0) {
    writeCustomChains([...customChains, chain]);
    return;
  }

  writeCustomChains(
    customChains.map((item, index) =>
      index === existingChainIndex ? chain : item
    )
  );
};

export const getCustomChainById = (chainId: number): CustomChain | undefined =>
  readCustomChains().find((chain) => chain.chainId === chainId);

export const getCustomChainName = (chainId: number): string | undefined =>
  getCustomChainById(chainId)?.chainName;

export const getCustomChainIdByName = (
  chainName: string | undefined
): number | undefined => {
  if (!chainName) return undefined;

  return readCustomChains().find((chain) => chain.chainName === chainName)
    ?.chainId;
};

const normalizeRpcUrl = (rpcUrl: string) => rpcUrl.trim();

const jsonRpcRequest = async <T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T> => {
  const response = await fetch(normalizeRpcUrl(rpcUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: '2.0',
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`);
  }

  const data = (await response.json()) as JsonRpcResponse<T>;

  if (data.error || data.result === undefined) {
    throw new Error(data.error?.message || 'RPC request returned no result');
  }

  return data.result;
};

export const fetchChainIdFromRpc = async (rpcUrl: string): Promise<number> => {
  const chainIdHex = await jsonRpcRequest<string>(rpcUrl, 'eth_chainId', []);
  const chainId = Number.parseInt(chainIdHex, 16);

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('RPC returned an invalid chain id');
  }

  return chainId;
};

const callContract = async ({
  rpcUrl,
  to,
  data,
}: {
  rpcUrl: string;
  to: `0x${string}`;
  data: `0x${string}`;
}) =>
  jsonRpcRequest<`0x${string}`>(rpcUrl, 'eth_call', [
    {
      to,
      data,
    },
    'latest',
  ]);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

const callErc20Metadata = async ({
  field,
  rpcUrl,
  tokenAddress,
}: {
  field: 'decimals' | 'name' | 'symbol';
  rpcUrl: string;
  tokenAddress: `0x${string}`;
}) => {
  try {
    return await callContract({
      rpcUrl,
      to: tokenAddress,
      data: encodeFunctionData({
        abi: erc20MetadataAbi,
        functionName: field,
      }),
    });
  } catch (error) {
    throw new Error(`Unable to fetch ERC-20 ${field}: ${getErrorMessage(error)}`);
  }
};

export const fetchErc20TokenMetadata = async ({
  rpcUrl,
  tokenAddress,
}: {
  rpcUrl: string;
  tokenAddress: string;
}): Promise<CustomChainToken> => {
  if (!isAddress(tokenAddress)) {
    throw new Error('Invalid token address');
  }

  const address = tokenAddress as `0x${string}`;

  const [decimalsResult, nameResult, symbolResult] = await Promise.all([
    callErc20Metadata({
      field: 'decimals',
      rpcUrl,
      tokenAddress: address,
    }),
    callErc20Metadata({
      field: 'name',
      rpcUrl,
      tokenAddress: address,
    }),
    callErc20Metadata({
      field: 'symbol',
      rpcUrl,
      tokenAddress: address,
    }),
  ]);

  let decimals: number;
  let name: unknown;
  let symbol: unknown;

  try {
    decimals = Number(
      decodeFunctionResult({
        abi: erc20MetadataAbi,
        functionName: 'decimals',
        data: decimalsResult,
      })
    );
    name = decodeFunctionResult({
      abi: erc20MetadataAbi,
      functionName: 'name',
      data: nameResult,
    });
    symbol = decodeFunctionResult({
      abi: erc20MetadataAbi,
      functionName: 'symbol',
      data: symbolResult,
    });
  } catch (error) {
    throw new Error(`Unable to decode ERC-20 metadata: ${getErrorMessage(error)}`);
  }

  if (
    !Number.isInteger(decimals) ||
    typeof name !== 'string' ||
    typeof symbol !== 'string'
  ) {
    throw new Error('Token metadata response is invalid');
  }

  return {
    address,
    name,
    symbol,
    decimals,
  };
};

export const fetchNativeBalanceRaw = async ({
  rpcUrl,
  wallet,
}: {
  rpcUrl: string;
  wallet: string;
}) => {
  if (!isAddress(wallet)) {
    throw new Error('Invalid wallet address');
  }

  const balanceHex = await jsonRpcRequest<string>(rpcUrl, 'eth_getBalance', [
    wallet,
    'latest',
  ]);

  return BigInt(balanceHex).toString();
};

export const fetchTokenBalanceRaw = async ({
  rpcUrl,
  tokenAddress,
  wallet,
}: {
  rpcUrl: string;
  tokenAddress: `0x${string}`;
  wallet: string;
}) => {
  if (!isAddress(wallet)) {
    throw new Error('Invalid wallet address');
  }

  const balanceResult = await callContract({
    rpcUrl,
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20MetadataAbi,
      functionName: 'balanceOf',
      args: [wallet as `0x${string}`],
    }),
  });

  const balance = decodeFunctionResult({
    abi: erc20MetadataAbi,
    functionName: 'balanceOf',
    data: balanceResult,
  });

  return balance.toString();
};

export const formatRawTokenBalance = (balanceRaw: string, decimals: number) => {
  try {
    return Number(formatUnits(BigInt(balanceRaw), decimals));
  } catch {
    return 0;
  }
};
