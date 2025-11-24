import { useState, useEffect } from 'react';

interface ChainBalance {
  chainId: string;
  balance: string;
}

interface GasTankBalanceResponse {
  balance: {
    [chainId: string]: ChainBalance;
  };
}

interface UseGasTankBalanceReturn {
  totalBalance: number;
  chainBalances: ChainBalance[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useGasTankBalance(walletAddress: string | null): UseGasTankBalanceReturn {
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [chainBalances, setChainBalances] = useState<ChainBalance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const paymasterUrl = import.meta.env.VITE_PAYMASTER_URL;

  const fetchGasTankBalance = async () => {
    if (!walletAddress || !paymasterUrl) {
      setTotalBalance(0);
      setChainBalances([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${paymasterUrl}/getGasTankBalance?sender=${walletAddress}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch gas tank balance: ${response.status}`);
      }

      const data: GasTankBalanceResponse = await response.json();

      // Extract chain balances
      const balances: ChainBalance[] = Object.values(data.balance || {});
      setChainBalances(balances);

      // Calculate total balance by summing all chain balances
      const total = balances.reduce((sum, chainBalance) => {
        const balance = parseFloat(chainBalance.balance) || 0;
        return sum + balance;
      }, 0);

      setTotalBalance(total);
    } catch (err) {
      const errorMessage = err instanceof Error ? err : new Error('Unknown error occurred');
      setError(errorMessage);
      setTotalBalance(0);
      setChainBalances([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGasTankBalance();
  }, [walletAddress, paymasterUrl]);

  return {
    totalBalance,
    chainBalances,
    isLoading,
    error,
    refetch: fetchGasTankBalance,
  };
}
