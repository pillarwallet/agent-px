import { EtherspotTransactionKit } from '@etherspot/transaction-kit';
import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// utils
import { visibleChains } from '../utils/blockchain';
import { sanitizeError } from '../utils/common';
import { OUR_EIP7702_IMPLEMENTATION_ADDRESS } from '../utils/eip7702Authorization';

type WalletMode = 'modular' | 'delegatedEoa';

export interface EIP7702Info {
  [chainId: number]: {
    hasImplementation: boolean;
    isOurImplementation: boolean;
    isOtherImplementation: boolean;
    delegateAddress: string | null;
  };
}

interface WalletModeVerificationResult {
  walletMode: WalletMode;
  isLoading: boolean;
  error: string | null;
  eip7702Info: EIP7702Info;
}

interface UseWalletModeVerificationProps {
  privateKey?: string;
  eoaAddress?: string;
  kit: EtherspotTransactionKit | null;
}

export const useWalletModeVerification = ({
  privateKey,
  eoaAddress,
  kit,
}: UseWalletModeVerificationProps): WalletModeVerificationResult => {
  const [walletMode, setWalletMode] = useState<WalletMode>('modular');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eip7702Info, setEip7702Info] = useState<EIP7702Info>({});

  useEffect(() => {
    let cancelled = false;

    const verifyWalletMode = async () => {
      // Need either privateKey or eoaAddress, and kit
      if ((!privateKey && !eoaAddress) || !kit) {
        if (cancelled) return;
        setWalletMode('modular');
        setEip7702Info({});
        return;
      }

      if (cancelled) return;
      setIsLoading(true);
      setError(null);

      try {
        // Resolve the address to check (could be from privateKey or eoaAddress prop)
        let resolvedAddress: string | undefined;
        if (privateKey) {
          const eoaAccount = privateKeyToAccount(privateKey as `0x${string}`);
          resolvedAddress = eoaAccount.address;
        }

        if (eoaAddress) {
          resolvedAddress = eoaAddress;
        }

        if (!resolvedAddress) {
          if (cancelled) return;
          setEip7702Info({});
          setWalletMode('modular');
          setError('No address available');
          return;
        }

        if (cancelled) return;

        // Get code for resolvedAddress across all chains (reused for both validation and EIP-7702 checks)
        const eoaAddressCodeChecks = await Promise.all(
          visibleChains.map(async (chain) => {
            const publicClient = createPublicClient({
              chain,
              transport: http(),
            });

            const code = await publicClient.getCode({
              address: resolvedAddress as `0x${string}`,
            });

            return {
              chainId: chain.id,
              code,
              isSmartContract:
                code !== undefined &&
                code !== '0x' &&
                !code.startsWith('0xef0100'),
            };
          })
        );

        // Validate that resolvedAddress is actually an EOA, not a smart contract
        // If the address is a smart contract (not EIP-7702) on any chain, treat it as a contract
        const isSmartContract = eoaAddressCodeChecks.some(
          (check) => check.isSmartContract
        );

        if (isSmartContract) {
          // The provided address (from eoaAddress prop or privateKey) is a smart contract, not an EOA
          // EIP-7702 is only applicable to EOAs, so skip the check and default to modular
          const contractChains = eoaAddressCodeChecks
            .filter((check) => check.isSmartContract)
            .map((check) => check.chainId)
            .join(', ');
          console.warn(
            `Address ${resolvedAddress} is a smart contract on chain(s): ${contractChains}, not an EOA. Skipping EIP-7702 check and getWalletAddress() call.`
          );
          if (cancelled) return;
          setEip7702Info({});
          setWalletMode('modular');
          return;
        }

        // At this point, resolvedAddress is confirmed to be an EOA (or has EIP-7702 designation)
        // Get counterfactual address from kit (in modular mode)
        const counterfactualAddress = await kit.getWalletAddress();

        // Check all supported chains
        let shouldRemainModular = false;

        // Check deployment and asset status across all chains
        const deploymentChecks = await Promise.all(
          visibleChains.map(async (chain) => {
            const publicClient = createPublicClient({
              chain,
              transport: http(),
            });

            // Check if smart account is deployed
            const code = await publicClient.getCode({
              address: counterfactualAddress as `0x${string}`,
            });

            const isDeployed = code && code !== '0x';

            if (isDeployed) {
              return { shouldRemainModular: true, chainId: chain.id };
            }

            // Smart account not deployed, check if it has assets
            const balance = await publicClient.getBalance({
              address: counterfactualAddress as `0x${string}`,
            });

            if (balance > BigInt(0)) {
              return { shouldRemainModular: true, chainId: chain.id };
            }

            return { shouldRemainModular: false, chainId: chain.id };
          })
        );
        if (cancelled) return;

        // Check if any chain indicates we should remain modular
        shouldRemainModular = deploymentChecks.some(
          (result) => result.shouldRemainModular
        );

        if (shouldRemainModular) {
          if (cancelled) return;
          setEip7702Info({});
          setWalletMode('modular');
          return;
        }

        // If we reach here, smart account is not deployed and has no assets
        // Check for EIP-7702 implementation on EOA
        const eip7702Checks = eoaAddressCodeChecks.map((check) => {
          const senderCode = check.code;

          const hasEIP7702Designation =
            senderCode !== undefined &&
            senderCode !== '0x' &&
            senderCode.startsWith('0xef0100');

          // Extract delegate address from EIP-7702 code if present
          let delegateAddress: string | null = null;
          let isOurImplementation = false;

          if (hasEIP7702Designation) {
            // EIP-7702 format: 0xef0100 + XX-byte delegate address
            // Extract delegate address using regex
            const match = senderCode.match(/^0xef0100(.{40})$/);
            delegateAddress = match ? `0x${match[1]}` : null;

            // Check if it's our implementation (Kernel V3)
            isOurImplementation =
              delegateAddress?.toLowerCase() ===
              OUR_EIP7702_IMPLEMENTATION_ADDRESS.toLowerCase();
          }

          return {
            hasEIP7702: hasEIP7702Designation,
            chainId: check.chainId,
            delegateAddress,
            isOurImplementation,
          };
        });
        if (cancelled) return;

        // Build per-chain implementation details
        const perChainData: EIP7702Info = {};
        eip7702Checks.forEach((result) => {
          perChainData[result.chainId] = {
            hasImplementation: result.hasEIP7702,
            isOurImplementation:
              result.hasEIP7702 && result.isOurImplementation,
            isOtherImplementation:
              result.hasEIP7702 && !result.isOurImplementation,
            delegateAddress: result.delegateAddress,
          };
        });

        // Update EIP-7702 info state
        if (cancelled) return;
        setEip7702Info(perChainData);

        // Since we reached this point, smart account is not deployed and has no assets
        // Therefore, we always use delegatedEoa mode regardless of EIP-7702 status
        setWalletMode('delegatedEoa');
      } catch (err) {
        if (cancelled) return;
        const sanitizedError = sanitizeError(err, privateKey);
        console.error('Wallet mode verification failed:', sanitizedError);
        setEip7702Info({});
        setError(sanitizedError);
        setWalletMode('modular'); // Default to modular on error
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    verifyWalletMode();

    return () => {
      cancelled = true;
    };
  }, [privateKey, eoaAddress, kit]);

  return {
    walletMode,
    isLoading,
    error,
    eip7702Info,
  };
};
