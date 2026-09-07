/* eslint-disable import/extensions */
import type { Token } from './tokensData';

export type Paymasters = {
  gasToken: string;
  chainId: number;
  epVersion: string;
  paymasterAddress: string;
};

export type SupportedGaslessToken = {
  chainId: number;
  tokenAddress: string;
  paymasterAddress: string;
};

export const MULTITOKEN_PAYMASTER_ADDRESS =
  '0x5E6ce32Bb6Fa47001cf87f2f9E07d5Fd3dE57990' as const;

export const supportedGaslessTokens: SupportedGaslessToken[] = [
  {
    chainId: 137,
    tokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 137,
    tokenAddress: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 137,
    tokenAddress: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 42161,
    tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 42161,
    tokenAddress: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 42161,
    tokenAddress: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 42161,
    tokenAddress: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 10,
    tokenAddress: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 10,
    tokenAddress: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 10,
    tokenAddress: '0x7f5c764cbc14f9669b88837ca1490cca17c31607',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 10,
    tokenAddress: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 10,
    tokenAddress: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 8453,
    tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 8453,
    tokenAddress: '0x820c137fa70c8691f0e44dc420a5e53c168921dc',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 8453,
    tokenAddress: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 8453,
    tokenAddress: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 1,
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 1,
    tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 1,
    tokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 1,
    tokenAddress: '0xdc035d45d973e3ec169d2276ddab16f1e407384f',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 56,
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 56,
    tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 56,
    tokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
  {
    chainId: 56,
    tokenAddress: '0xdc035d45d973e3ec169d2276ddab16f1e407384f',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
];

export const GASLESS_TOKEN_APPROVAL_AMOUNT = '0.1';
const MIN_GASLESS_TOKEN_BALANCE = 0.01;

const normalizeGaslessChainName = (chainName: string) =>
  chainName
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

const gaslessChainNameToChainId = (chainName: string) => {
  const normalizedChainName = normalizeGaslessChainName(chainName);

  if (
    normalizedChainName === 'ethereum' ||
    normalizedChainName === 'ethereum mainnet'
  ) {
    return 1;
  }

  if (
    normalizedChainName === 'arbitrum' ||
    normalizedChainName === 'arbitrum one'
  ) {
    return 42161;
  }

  if (
    normalizedChainName === 'polygon' ||
    normalizedChainName === 'polygon pos' ||
    normalizedChainName === 'polygon mainnet'
  ) {
    return 137;
  }

  if (
    normalizedChainName === 'bnb' ||
    normalizedChainName === 'bsc' ||
    normalizedChainName === 'binance smart chain' ||
    normalizedChainName === 'bnb smart chain' ||
    normalizedChainName === 'bnb smart chain (bep20)' ||
    normalizedChainName === 'bnb chain'
  ) {
    return 56;
  }

  if (
    normalizedChainName === 'optimism' ||
    normalizedChainName === 'optimistic' ||
    normalizedChainName === 'optimistic ethereum'
  ) {
    return 10;
  }

  if (
    normalizedChainName === 'base' ||
    normalizedChainName === 'base mainnet' ||
    normalizedChainName === 'base chain'
  ) {
    return 8453;
  }

  return undefined;
};

export const GasConsumptions = {
  native: 510000,
  native_arb: 910000,
  token: 550000,
  token_arb: 960000,
  nft: 630000,
  nft_arb: 1050000,
  // TopUp-specific gas costs
  topup_install_modules: 610000,
  topup_install_modules_arb: 810000, // 610000 + 200000
  topup_deposit: 610000,
  topup_deposit_arb: 810000,
  topup_swap: 1610000,
  topup_swap_arb: 1810000,
};

export const getAllGaslessPaymasters = async (
  chainId: number,
  tokens_list: Token[]
): Promise<Paymasters[] | null> => {
  try {
    const availableSupportedTokens = supportedGaslessTokens.filter(
      (supportedToken) =>
        supportedToken.chainId === chainId &&
        tokens_list.some(
          (token) =>
            gaslessChainNameToChainId(token.blockchain) === chainId &&
            token.contract.toLowerCase() ===
              supportedToken.tokenAddress.toLowerCase() &&
            (token.balance ?? 0) >= MIN_GASLESS_TOKEN_BALANCE
        )
    );

    if (!availableSupportedTokens.length) return null;

    return availableSupportedTokens.map((supportedToken) => ({
      gasToken: supportedToken.tokenAddress,
      chainId: supportedToken.chainId,
      epVersion: 'EPV_07',
      paymasterAddress: supportedToken.paymasterAddress,
    }));
  } catch (err) {
    console.error(err);
    return null;
  }
};
