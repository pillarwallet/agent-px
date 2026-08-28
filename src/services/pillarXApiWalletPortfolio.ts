/* eslint-disable no-restricted-syntax */
import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';

// types
import {
  AssetDataMobula,
  AssetMobula,
  ContractsBalanceMobula,
  PortfolioData,
  PrimeAssetType,
  WalletPortfolioMobulaResponse,
} from '../types/api';

// store
import { addMiddleware } from '../store';

// utils
import {
  CompatibleChains,
  getWrappedTokenSymbol,
  isTestnet,
  isWrappedNativeToken,
} from '../utils/blockchain';
import { writeCachedWalletPortfolio } from '../utils/walletPortfolioCache';
import {
  CUSTOM_NATIVE_TOKEN_ADDRESS,
  CustomChain,
  CustomChainToken,
  fetchNativeBalanceRaw,
  fetchTokenBalanceRaw,
  formatRawTokenBalance,
  readCustomChains,
} from '../utils/customChains';

// services
import { PortfolioToken, chainIdToChainNameTokensData } from './tokensData';

export const convertPortfolioAPIResponseToToken = (
  portfolioData: PortfolioData
): PortfolioToken[] => {
  if (!portfolioData) return [];

  return portfolioData.assets.flatMap((asset) =>
    asset.contracts_balances
      .filter((contract) => contract.balance > 0)
      .map((contract) => {
        const chainId = Number(contract.chainId.split(':')[1]);
        const isWrapped = isWrappedNativeToken(contract.address, chainId);

        const displayName = isWrapped
          ? `Wrapped ${asset.asset.name}`
          : asset.asset.name;
        const displaySymbol = isWrapped
          ? getWrappedTokenSymbol(chainId)
          : asset.asset.symbol;

        return {
          id: asset.asset.id,
          name: displayName,
          symbol: displaySymbol,
          logo: asset.asset.logo,
          blockchain: chainIdToChainNameTokensData(chainId),
          contract: contract.address,
          decimals: contract.decimals,
          balance: contract.balance,
          price: asset.price,
          price_change_24h: asset.price_change_24h,
          cross_chain_balance: asset.token_balance,
        };
      })
  );
};

export const getPrimeAssetsWithBalances = (
  walletPortfolio: PortfolioData,
  primeAssets: PrimeAssetType[]
): {
  name: string;
  symbol: string;
  primeAssets: { asset: AssetMobula; usd_balance: number }[];
}[] => {
  return primeAssets.map(({ name, symbol }) => {
    const primeAssetsMatch = walletPortfolio.assets
      .filter(
        (assetData) =>
          assetData.asset.name === name && assetData.asset.symbol === symbol
      )
      .map((assetData) => ({
        asset: assetData.asset,
        usd_balance: assetData.estimated_balance,
      }));

    return {
      name,
      symbol,
      primeAssets: primeAssetsMatch,
    };
  });
};

export const getTopNonPrimeAssetsAcrossChains = (
  walletPortfolio: PortfolioData,
  primeAssets: PrimeAssetType[]
): {
  asset: AssetMobula;
  usdBalance: number;
  tokenBalance: number;
  unrealizedPnLUsd: number;
  unrealizedPnLPercentage: number;
  contract: ContractsBalanceMobula;
  price: number;
}[] => {
  const primeAssetSet = new Set(
    primeAssets.map((a) => `${a.name}|${a.symbol}`)
  );

  // Here we are filtering the tokens and removing the ones that are Prime Assets
  // We then select the top three tokens with the highest USD value
  const nonPrimeAssetBalances = walletPortfolio.assets
    // Filter out assets that are prime assets
    .filter(
      (assetData) =>
        !primeAssetSet.has(`${assetData.asset.name}|${assetData.asset.symbol}`)
    )
    // Flat map to recreate an array of assets with their balances
    .flatMap((assetData) =>
      assetData.contracts_balances
        .filter((contract) => contract.balance > 0)
        .map((contract) => {
          const usdBalance = contract.balance * assetData.price;
          const priceChangePercent = assetData.price_change_24h ?? 0;

          const previousBalance =
            priceChangePercent === -100
              ? 0
              : usdBalance / (1 + priceChangePercent / 100);

          const unrealizedPnLUsd = usdBalance - previousBalance;

          const unrealizedPnLPercentage =
            previousBalance > 0
              ? (unrealizedPnLUsd / previousBalance) * 100
              : 0;

          return {
            asset: assetData.asset,
            usdBalance,
            tokenBalance: contract.balance,
            unrealizedPnLUsd,
            unrealizedPnLPercentage,
            contract,
            price: assetData.price,
          };
        })
    );

  const topThree = nonPrimeAssetBalances
    .sort((a, b) => b.usdBalance - a.usdBalance)
    .slice(0, 3);

  return topThree;
};

const CUSTOM_CHAIN_ID_PREFIX = 'evm';

const getCustomChainPortfolioChainId = (chainId: number) =>
  `${CUSTOM_CHAIN_ID_PREFIX}:${chainId}`;

const getCustomAssetId = (chainId: number, address: string) => {
  if (address.toLowerCase() === CUSTOM_NATIVE_TOKEN_ADDRESS) {
    return chainId;
  }

  try {
    return Number(BigInt(address) % 1_000_000_000n);
  } catch {
    return chainId;
  }
};

const createCustomPortfolioAsset = ({
  wallet,
  customChain,
  token,
  balanceRaw,
  balance,
}: {
  wallet: string;
  customChain: CustomChain;
  token: CustomChainToken & { address: `0x${string}` };
  balanceRaw: string;
  balance: number;
}): AssetDataMobula => {
  const portfolioChainId = getCustomChainPortfolioChainId(customChain.chainId);

  return {
    contracts_balances: [
      {
        address: token.address,
        balance,
        balanceRaw,
        chainId: portfolioChainId,
        decimals: token.decimals,
      },
    ],
    cross_chain_balances: {
      [customChain.chainName]: {
        address: token.address,
        balance,
        balanceRaw,
        chainId: String(customChain.chainId),
      },
    },
    price_change_24h: 0,
    estimated_balance: 0,
    price: 0,
    token_balance: balance,
    allocation: 0,
    asset: {
      id: getCustomAssetId(customChain.chainId, token.address),
      name: token.name,
      symbol: token.symbol,
      logo: '',
      decimals: [String(token.decimals)],
      contracts: [token.address],
      blockchains: [customChain.chainName],
    },
    wallets: [wallet],
  };
};

const fetchCustomChainPortfolioAssets = async ({
  wallet,
  customChain,
}: {
  wallet: string;
  customChain: CustomChain;
}): Promise<AssetDataMobula[]> => {
  const assets: AssetDataMobula[] = [];

  try {
    const nativeBalanceRaw = await fetchNativeBalanceRaw({
      rpcUrl: customChain.rpcUrl,
      wallet,
    });
    const nativeBalance = formatRawTokenBalance(
      nativeBalanceRaw,
      customChain.nativeTokenDecimals
    );

    if (nativeBalance > 0) {
      assets.push(
        createCustomPortfolioAsset({
          wallet,
          customChain,
          token: {
            address: CUSTOM_NATIVE_TOKEN_ADDRESS,
            name: `${customChain.chainName} Native Token`,
            symbol: customChain.nativeTokenSymbol,
            decimals: customChain.nativeTokenDecimals,
          },
          balanceRaw: nativeBalanceRaw,
          balance: nativeBalance,
        })
      );
    }
  } catch (error) {
    console.warn(
      `Failed to fetch native balance for custom chain ${customChain.chainId}`,
      error
    );
  }

  const tokenAssets = await Promise.all(
    customChain.tokens.map(async (token) => {
      try {
        const balanceRaw = await fetchTokenBalanceRaw({
          rpcUrl: customChain.rpcUrl,
          tokenAddress: token.address,
          wallet,
        });
        const balance = formatRawTokenBalance(balanceRaw, token.decimals);

        if (balance <= 0) return undefined;

        return createCustomPortfolioAsset({
          wallet,
          customChain,
          token,
          balanceRaw,
          balance,
        });
      } catch (error) {
        console.warn(
          `Failed to fetch token balance for ${token.address} on custom chain ${customChain.chainId}`,
          error
        );
        return undefined;
      }
    })
  );

  tokenAssets.forEach((asset) => {
    if (asset) assets.push(asset);
  });

  return assets;
};

const addCustomChainBalancesToPortfolioData = async (
  portfolioData: PortfolioData,
  wallet: string
): Promise<PortfolioData> => {
  const customChains = readCustomChains();

  if (!wallet || customChains.length === 0) {
    return portfolioData;
  }

  const customAssetsByChain = await Promise.all(
    customChains.map((customChain) =>
      fetchCustomChainPortfolioAssets({ wallet, customChain })
    )
  );
  const customAssets = customAssetsByChain.flat();

  if (customAssets.length === 0) {
    return portfolioData;
  }

  return {
    ...portfolioData,
    assets: [...(portfolioData.assets || []), ...customAssets],
    wallets: Array.from(new Set([...(portfolioData.wallets || []), wallet])),
    balances_length:
      (portfolioData.balances_length || 0) +
      customAssets.reduce(
        (count, asset) => count + asset.contracts_balances.length,
        0
      ),
  };
};

const fetchBaseQueryWithRetry = retry(
  fetchBaseQuery({
    baseUrl: isTestnet
      ? 'https://hifidata-nubpgwxpiq-uc.a.run.app'
      : 'https://hifidata-7eu4izffpa-uc.a.run.app',
    headers: {
      'Content-Type': 'application/json',
    },
  }),
  { maxRetries: 5 }
);

// Define a service using a base path and params
export const pillarXApiWalletPortfolio = createApi({
  reducerPath: 'pillarXApiWalletPortfolio',
  baseQuery: fetchBaseQueryWithRetry,
  endpoints: (builder) => ({
    getWalletPortfolio: builder.query<
      WalletPortfolioMobulaResponse,
      { wallet: string; isPnl: boolean }
    >({
      queryFn: async ({ wallet, isPnl }, _api, _extraOptions, baseQuery) => {
        const chainIds = isTestnet
          ? [11155111]
          : CompatibleChains.map((chain) => chain.chainId);
        const chainIdsQuery = chainIds.map((id) => `chainIds=${id}`).join('&');

        const response = await baseQuery({
          url: `?${chainIdsQuery}&testnets=${String(isTestnet)}`,
          method: 'POST',
          body: {
            path: 'wallet/portfolio',
            params: {
              wallet,
              blockchains: CompatibleChains.map((chain) => chain.chainId).join(
                ','
              ),
              unlistedAssets: 'true',
              filterSpam: 'true',
              pnl: isPnl,
            },
          },
        });

        if ('error' in response) {
          return { error: response.error };
        }

        const baseResponse = response.data as WalletPortfolioMobulaResponse;
        const portfolioData = baseResponse?.result?.data;

        if (!portfolioData) {
          return { data: baseResponse };
        }

        const portfolioDataWithCustomChainBalances =
          await addCustomChainBalancesToPortfolioData(
            portfolioData,
            wallet
          );

        writeCachedWalletPortfolio({
          wallet,
          isPnl,
          data: portfolioDataWithCustomChainBalances,
        });

        return {
          data: {
            ...baseResponse,
            result: {
              ...baseResponse.result,
              data: portfolioDataWithCustomChainBalances,
            },
          },
        };
      },
    }),
  }),
});

addMiddleware(pillarXApiWalletPortfolio);

export const { useGetWalletPortfolioQuery } = pillarXApiWalletPortfolio;
