import { useMemo } from 'react';
import { WalletPortfolioMobulaResponse } from '../../../types/api';
import { getStableCurrencyBalanceOnEachChain } from '../utils/utils';

interface UseTotalUsdcBalanceReturn {
  totalUsdcBalance: number;
  balanceByChain: { [chainId: number]: { balance: number; price?: number } };
}

export function useTotalUsdcBalance(
  walletPortfolioData: WalletPortfolioMobulaResponse | undefined
): UseTotalUsdcBalanceReturn {
  const result = useMemo(() => {
    if (!walletPortfolioData) {
      return {
        totalUsdcBalance: 0,
        balanceByChain: {},
      };
    }

    const balanceByChain =
      getStableCurrencyBalanceOnEachChain(walletPortfolioData);
    const totalUsdcBalance = Object.values(balanceByChain).reduce(
      (sum, balanceObj) => sum + balanceObj.balance,
      0
    );

    return {
      totalUsdcBalance,
      balanceByChain,
    };
  }, [walletPortfolioData]);

  return result;
}
