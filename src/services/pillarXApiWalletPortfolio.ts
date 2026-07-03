/* eslint-disable no-restricted-syntax */
import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';
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
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_NATIVE_TOKEN_DECIMALS,
  ARC_TESTNET_RPC_URL,
  CompatibleChains,
  getNativeAssetForChainId,
  getWrappedTokenSymbol,
  isTestnet,
  isWrappedNativeToken,
} from '../utils/blockchain';
import { writeCachedWalletPortfolio } from '../utils/walletPortfolioCache';

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

const ARC_CHAIN_ID_KEY = `eip155:${ARC_TESTNET_CHAIN_ID}`;

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
  if (!portfolioData?.assets?.length) {
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

type JsonRpcBalanceResponse = {
  result?: string;
  error?: {
    message?: string;
  };
};

const fetchArcNativeBalanceRaw = async (
  wallet: string
): Promise<string | undefined> => {
  try {
    const response = await fetch(ARC_TESTNET_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [wallet, 'latest'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Arc balance RPC failed with status ${response.status}`);
    }

    const data = (await response.json()) as JsonRpcBalanceResponse;

    if (data.error || !data.result) {
      throw new Error(
        data.error?.message || 'Arc balance RPC returned no result'
      );
    }

    return BigInt(data.result).toString();
  } catch (error) {
    console.warn('Failed to fetch Arc Testnet native balance', error);
    return undefined;
  }
};

const addArcNativeBalanceToPortfolioData = async (
  portfolioData: PortfolioData,
  wallet: string
): Promise<PortfolioData> => {
  if (!isTestnet || !wallet) {
    return portfolioData;
  }

  const balanceRaw = await fetchArcNativeBalanceRaw(wallet);

  if (!balanceRaw) {
    return portfolioData;
  }

  const balance = normalizeArcBalanceValue(
    balanceRaw,
    ARC_TESTNET_NATIVE_TOKEN_DECIMALS
  );

  if (balance <= 0) {
    return portfolioData;
  }

  const nativeAsset = getNativeAssetForChainId(ARC_TESTNET_CHAIN_ID);
  const nativeAssetAddress = nativeAsset.address.toLowerCase();
  const existingAssets = portfolioData.assets || [];

  const arcContractBalance = {
    address: nativeAsset.address,
    balance,
    balanceRaw,
    chainId: ARC_CHAIN_ID_KEY,
    decimals: nativeAsset.decimals,
  };

  const arcCrossChainBalance = {
    address: nativeAsset.address,
    balance,
    balanceRaw,
    chainId: ARC_CHAIN_ID_KEY,
  };

  const existingArcAssetIndex = existingAssets.findIndex((asset) =>
    asset.contracts_balances.some(
      (contract) =>
        contract.chainId === ARC_CHAIN_ID_KEY &&
        contract.address.toLowerCase() === nativeAssetAddress
    )
  );

  const existingNativeAssetIndex = existingAssets.findIndex(
    (asset) => asset.asset.symbol === nativeAsset.symbol
  );

  const targetAssetIndex =
    existingArcAssetIndex >= 0
      ? existingArcAssetIndex
      : existingNativeAssetIndex;

  if (targetAssetIndex < 0) {
    return {
      ...portfolioData,
      total_wallet_balance: (portfolioData.total_wallet_balance || 0) + balance,
      balances_length: (portfolioData.balances_length || 0) + 1,
      assets: [
        ...existingAssets,
        {
          contracts_balances: [arcContractBalance],
          cross_chain_balances: {
            [ARC_CHAIN_ID_KEY]: arcCrossChainBalance,
          },
          price_change_24h: 0,
          estimated_balance: balance,
          price: 1,
          token_balance: balance,
          allocation: 0,
          asset: {
            id: ARC_TESTNET_CHAIN_ID,
            name: nativeAsset.name,
            symbol: nativeAsset.symbol,
            logo: nativeAsset.logoURI || '',
            decimals: [String(nativeAsset.decimals)],
            contracts: [nativeAsset.address],
            blockchains: ['Arc Testnet'],
          },
          wallets: [wallet],
        },
      ],
    };
  }

  const updatedAssets = existingAssets.map((asset, index) => {
    if (index !== targetAssetIndex) {
      return asset;
    }

    const existingArcContract = asset.contracts_balances.find(
      (contract) =>
        contract.chainId === ARC_CHAIN_ID_KEY &&
        contract.address.toLowerCase() === nativeAssetAddress
    );
    const previousArcBalance = existingArcContract?.balance || 0;
    const balanceDelta = balance - previousArcBalance;
    const assetPrice = asset.price || 1;
    const contracts = existingArcContract
      ? asset.contracts_balances.map((contract) =>
          contract.chainId === ARC_CHAIN_ID_KEY &&
          contract.address.toLowerCase() === nativeAssetAddress
            ? arcContractBalance
            : contract
        )
      : [...asset.contracts_balances, arcContractBalance];

    return {
      ...asset,
      contracts_balances: contracts,
      cross_chain_balances: {
        ...asset.cross_chain_balances,
        [ARC_CHAIN_ID_KEY]: arcCrossChainBalance,
      },
      estimated_balance: asset.estimated_balance + balanceDelta * assetPrice,
      token_balance: asset.token_balance + balanceDelta,
      price: assetPrice,
      asset: {
        ...asset.asset,
        logo: asset.asset.logo || nativeAsset.logoURI || '',
        contracts: Array.from(
          new Set([...asset.asset.contracts, nativeAsset.address])
        ),
        blockchains: Array.from(
          new Set([...asset.asset.blockchains, 'Arc Testnet'])
        ),
        decimals: Array.from(
          new Set([...asset.asset.decimals, String(nativeAsset.decimals)])
        ),
      },
    };
  });

  const previousArcBalance =
    targetAssetIndex >= 0
      ? existingAssets[targetAssetIndex].contracts_balances.find(
          (contract) =>
            contract.chainId === ARC_CHAIN_ID_KEY &&
            contract.address.toLowerCase() === nativeAssetAddress
        )?.balance || 0
      : 0;
  const balanceDelta = balance - previousArcBalance;
  const targetAssetPrice = existingAssets[targetAssetIndex]?.price || 1;

  return {
    ...portfolioData,
    total_wallet_balance:
      (portfolioData.total_wallet_balance || 0) +
      balanceDelta * targetAssetPrice,
    balances_length:
      previousArcBalance > 0
        ? portfolioData.balances_length
        : (portfolioData.balances_length || 0) + 1,
    assets: updatedAssets,
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

        const normalizedPortfolioData =
          normalizeArcPortfolioData(portfolioData);
        const portfolioDataWithArcBalance =
          await addArcNativeBalanceToPortfolioData(
            normalizedPortfolioData,
            wallet
          );

        writeCachedWalletPortfolio({
          wallet,
          isPnl,
          data: portfolioDataWithArcBalance,
        });

        return {
          data: {
            ...baseResponse,
            result: {
              ...baseResponse.result,
              data: portfolioDataWithArcBalance,
            },
          },
        };
      },
    }),
  }),
});

addMiddleware(pillarXApiWalletPortfolio);

export const { useGetWalletPortfolioQuery } = pillarXApiWalletPortfolio;
