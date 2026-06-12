/* eslint-disable no-restricted-syntax */
import {
  type FetchBaseQueryError,
  createApi,
  fetchBaseQuery,
  retry,
} from '@reduxjs/toolkit/query/react';
import { formatUnits } from 'viem';

// types
import {
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
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_ENABLED,
  ARC_TESTNET_NATIVE_TOKEN_DECIMALS,
  ARC_TESTNET_NATIVE_TOKEN_SYMBOL,
  getArcNativeBalance,
} from '../utils/arcTestnet';

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
      assetData.contracts_balances.map((contract) => {
        const usdBalance = contract.balance * assetData.price;
        const priceChangePercent = assetData.price_change_24h ?? 0;

        const previousBalance =
          priceChangePercent === -100
            ? 0
            : usdBalance / (1 + priceChangePercent / 100);

        const unrealizedPnLUsd = usdBalance - previousBalance;

        const unrealizedPnLPercentage =
          previousBalance > 0 ? (unrealizedPnLUsd / previousBalance) * 100 : 0;

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

const ARC_NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
const ARC_NATIVE_TOKEN_ID = 504200200;
const ARC_CHAIN_ID_KEY = `eip155:${ARC_TESTNET_CHAIN_ID}`;

const createEmptyPortfolioData = (wallet: string): PortfolioData => ({
  total_wallet_balance: 0,
  wallets: wallet ? [wallet] : [],
  assets: [],
  balances_length: 0,
});

const normalizeArcBalanceValue = (
  balanceRawValue: string | undefined,
  decimals = ARC_TESTNET_NATIVE_TOKEN_DECIMALS
) => {
  if (!balanceRawValue) {
    return 0;
  }

  try {
    return Number(formatUnits(BigInt(balanceRawValue), decimals));
  } catch {
    return 0;
  }
};

const normalizeArcPortfolioData = (
  portfolioData: PortfolioData
): PortfolioData => {
  if (!ARC_TESTNET_ENABLED || !portfolioData?.assets?.length) {
    return portfolioData;
  }

  let totalWalletBalanceDelta = 0;

  const normalizedAssets = portfolioData.assets.map((asset) => {
    const hasArcBalance = asset.contracts_balances.some(
      (contract) => contract.chainId === ARC_CHAIN_ID_KEY
    );

    if (!hasArcBalance) {
      return asset;
    }

    const normalizedContracts = asset.contracts_balances.map((contract) => {
      if (contract.chainId !== ARC_CHAIN_ID_KEY) {
        return contract;
      }

      return {
        ...contract,
        balance: normalizeArcBalanceValue(
          contract.balanceRaw,
          contract.decimals || ARC_TESTNET_NATIVE_TOKEN_DECIMALS
        ),
      };
    });

    const arcCrossChainBalance = asset.cross_chain_balances[ARC_CHAIN_ID_KEY];
    const normalizedCrossChainBalances = arcCrossChainBalance
      ? {
          ...asset.cross_chain_balances,
          [ARC_CHAIN_ID_KEY]: {
            ...arcCrossChainBalance,
            balance: normalizeArcBalanceValue(
              arcCrossChainBalance.balanceRaw,
              ARC_TESTNET_NATIVE_TOKEN_DECIMALS
            ),
          },
        }
      : asset.cross_chain_balances;

    const normalizedTokenBalance = normalizedContracts.reduce(
      (sum, contract) => sum + contract.balance,
      0
    );
    const normalizedEstimatedBalance =
      normalizedTokenBalance * (asset.price ?? 1);

    totalWalletBalanceDelta +=
      normalizedEstimatedBalance - asset.estimated_balance;

    return {
      ...asset,
      contracts_balances: normalizedContracts,
      cross_chain_balances: normalizedCrossChainBalances,
      token_balance: normalizedTokenBalance,
      estimated_balance: normalizedEstimatedBalance,
    };
  });

  return {
    ...portfolioData,
    assets: normalizedAssets,
    total_wallet_balance:
      (portfolioData.total_wallet_balance || 0) + totalWalletBalanceDelta,
  };
};

const appendArcNativeBalance = async (
  portfolioData: PortfolioData,
  wallet: string
): Promise<PortfolioData> => {
  if (!ARC_TESTNET_ENABLED || !wallet) {
    return portfolioData;
  }

  const balanceRaw = await getArcNativeBalance(wallet);
  const balance = Number(
    formatUnits(balanceRaw, ARC_TESTNET_NATIVE_TOKEN_DECIMALS)
  );
  const chainId = ARC_CHAIN_ID_KEY;
  const basePortfolio = portfolioData || createEmptyPortfolioData(wallet);
  const assets = [...basePortfolio.assets];
  const usdcAssetIndex = assets.findIndex(
    (asset) => asset.asset.symbol === ARC_TESTNET_NATIVE_TOKEN_SYMBOL
  );

  if (usdcAssetIndex >= 0) {
    const existingAsset = assets[usdcAssetIndex];
    const price = existingAsset.price ?? 1;
    const existingContracts = existingAsset.contracts_balances.filter(
      (contract) => contract.chainId !== chainId
    );
    const arcContract = {
      address: ARC_NATIVE_TOKEN_ADDRESS,
      balance,
      balanceRaw: balanceRaw.toString(),
      chainId,
      decimals: ARC_TESTNET_NATIVE_TOKEN_DECIMALS,
    };

    assets[usdcAssetIndex] = {
      ...existingAsset,
      contracts_balances: [...existingContracts, arcContract],
      cross_chain_balances: {
        ...existingAsset.cross_chain_balances,
        [chainId]: {
          address: ARC_NATIVE_TOKEN_ADDRESS,
          balance,
          balanceRaw: balanceRaw.toString(),
          chainId,
        },
      },
      estimated_balance: existingAsset.estimated_balance + balance * price,
      token_balance: existingAsset.token_balance + balance,
      asset: {
        ...existingAsset.asset,
        blockchains: Array.from(
          new Set([...existingAsset.asset.blockchains, 'Arc Testnet'])
        ),
        contracts: Array.from(
          new Set([...existingAsset.asset.contracts, ARC_NATIVE_TOKEN_ADDRESS])
        ),
        decimals: Array.from(
          new Set([
            ...existingAsset.asset.decimals,
            ARC_TESTNET_NATIVE_TOKEN_DECIMALS.toString(),
          ])
        ),
      },
    };

    return normalizeArcPortfolioData({
      ...basePortfolio,
      assets,
      balances_length: basePortfolio.balances_length + (balance > 0 ? 1 : 0),
      total_wallet_balance:
        basePortfolio.total_wallet_balance + balance * price,
    });
  }

  const estimatedBalance = balance;

  return normalizeArcPortfolioData({
    ...basePortfolio,
    assets: [
      ...assets,
      {
        allocation: 0,
        asset: {
          id: ARC_NATIVE_TOKEN_ID,
          name: ARC_TESTNET_NATIVE_TOKEN_SYMBOL,
          symbol: ARC_TESTNET_NATIVE_TOKEN_SYMBOL,
          logo: '',
          decimals: [ARC_TESTNET_NATIVE_TOKEN_DECIMALS.toString()],
          contracts: [ARC_NATIVE_TOKEN_ADDRESS],
          blockchains: ['Arc Testnet'],
        },
        contracts_balances: [
          {
            address: ARC_NATIVE_TOKEN_ADDRESS,
            balance,
            balanceRaw: balanceRaw.toString(),
            chainId,
            decimals: ARC_TESTNET_NATIVE_TOKEN_DECIMALS,
          },
        ],
        cross_chain_balances: {
          [chainId]: {
            address: ARC_NATIVE_TOKEN_ADDRESS,
            balance,
            balanceRaw: balanceRaw.toString(),
            chainId,
          },
        },
        estimated_balance: estimatedBalance,
        price: 1,
        price_change_24h: 0,
        token_balance: balance,
        wallets: wallet ? [wallet] : [],
      },
    ],
    balances_length: basePortfolio.balances_length + (balance > 0 ? 1 : 0),
    total_wallet_balance: basePortfolio.total_wallet_balance + estimatedBalance,
  });
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
          const responseError = response.error as FetchBaseQueryError;

          if (!ARC_TESTNET_ENABLED) {
            return { error: responseError };
          }

          try {
            const data = await appendArcNativeBalance(
              createEmptyPortfolioData(wallet),
              wallet
            );
            return {
              data: {
                result: {
                  data,
                },
              },
            };
          } catch (error) {
            return { error: responseError };
          }
        }

        const baseResponse = response.data as WalletPortfolioMobulaResponse;

        if (!ARC_TESTNET_ENABLED) {
          return { data: baseResponse };
        }

        try {
          const augmentedData = await appendArcNativeBalance(
            baseResponse?.result?.data || createEmptyPortfolioData(wallet),
            wallet
          );

          return {
            data: {
              ...baseResponse,
              result: {
                ...baseResponse.result,
                data: augmentedData,
              },
            },
          };
        } catch (error) {
          console.error('Failed to append Arc native balance:', error);
          return { data: baseResponse };
        }
      },
    }),
  }),
});

addMiddleware(pillarXApiWalletPortfolio);

export const { useGetWalletPortfolioQuery } = pillarXApiWalletPortfolio;
