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
    chainId: 42161,
    tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    paymasterAddress: MULTITOKEN_PAYMASTER_ADDRESS,
  },
];

const MIN_GASLESS_TOKEN_BALANCE = 0.01;

const gaslessChainNameToChainId = (chainName: string) => {
  const normalizedChainName = chainName.toLowerCase();

  if (
    normalizedChainName === 'arbitrum' ||
    normalizedChainName === 'arbitrum one'
  ) {
    return 42161;
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
            (token.balance ?? 0) > MIN_GASLESS_TOKEN_BALANCE
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
