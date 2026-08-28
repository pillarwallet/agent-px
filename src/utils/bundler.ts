const ETHERSPOST_MAINNET_BUNDLER_CHAIN_IDS = new Set([
  1, 10, 14, 30, 50, 56, 122, 137, 5000, 8453, 42161, 42220, 43114, 534352,
  59144, 888888888,
]);

const ETHERSPOST_TESTNET_BUNDLER_CHAIN_IDS = new Set([
  31, 51, 97, 114, 123, 5003, 80002, 84532, 421614, 44787, 5042002, 11155111,
  11155420, 28122024, 534351, 79479957,
]);

const getDefaultEtherspotBundlerBaseUrl = (chainId: number): string => {
  if (ETHERSPOST_MAINNET_BUNDLER_CHAIN_IDS.has(chainId)) {
    return `https://rpc.etherspot.io/v2/${chainId}`;
  }

  if (ETHERSPOST_TESTNET_BUNDLER_CHAIN_IDS.has(chainId)) {
    return `https://testnet-rpc.etherspot.io/v2/${chainId}`;
  }

  throw new Error(
    `No Etherspot bundler URL configured for chain ID ${chainId}`
  );
};

export const getEtherspotBundlerUrl = ({
  chainId,
  apiKey,
  bundlerUrl,
  apiKeyFormat,
}: {
  chainId: number;
  apiKey?: string;
  bundlerUrl?: string;
  apiKeyFormat?: string;
}): string => {
  const baseUrl = bundlerUrl || getDefaultEtherspotBundlerBaseUrl(chainId);

  if (!apiKey) {
    return baseUrl;
  }

  if (apiKeyFormat !== undefined) {
    return `${baseUrl}${apiKeyFormat}${apiKey}`;
  }

  if (baseUrl.includes('?api-key=')) {
    return `${baseUrl}${apiKey}`;
  }

  return `${baseUrl}?api-key=${apiKey}`;
};

export const getEtherspotRpcUrl = (chainId: number): string =>
  getEtherspotBundlerUrl({
    chainId,
    apiKey: import.meta.env.VITE_ETHERSPOT_BUNDLER_API_KEY,
  });

export const getEtherspotExternalWalletRpcUrl = (chainId: number): string =>
  getEtherspotBundlerUrl({ chainId });
