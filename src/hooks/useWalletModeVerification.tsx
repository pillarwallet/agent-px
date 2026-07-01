import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// utils
import { visibleChains } from '../utils/blockchain';
import { sanitizeError } from '../utils/common';
import { OUR_EIP7702_IMPLEMENTATION_ADDRESS } from '../utils/eip7702Authorization';
import type { EtherspotTransactionKit } from '../utils/nativeTransactionKit';

type WalletMode = 'delegatedEoa';

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
  const [walletMode, setWalletMode] = useState<WalletMode>('delegatedEoa');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eip7702Info, setEip7702Info] = useState<EIP7702Info>({});

  useEffect(() => {
    let cancelled = false;

    const verifyWalletMode = async () => {
      // Need either privateKey or eoaAddress, and kit
      if ((!privateKey && !eoaAddress) || !kit) {
        if (cancelled) return;
        setWalletMode('delegatedEoa');
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
          setWalletMode('delegatedEoa');
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
          // The provided address (from eoaAddress prop or privateKey) is a smart contract, not an EOA.
          // EIP-7702 is only applicable to EOAs, and this app no longer supports a modular fallback.
          const contractChains = eoaAddressCodeChecks
            .filter((check) => check.isSmartContract)
            .map((check) => check.chainId)
            .join(', ');
          const contractAddressError = `Address ${resolvedAddress} is a smart contract on chain(s): ${contractChains}, not an EOA.`;
          console.warn(contractAddressError);
          if (cancelled) return;
          setEip7702Info({});
          setWalletMode('delegatedEoa');
          setError(contractAddressError);
          return;
        }

        // At this point, resolvedAddress is confirmed to be an EOA or an
        // EIP-7702-designated EOA. The native viem transaction kit uses the EOA
        // itself as the account address, so an EOA balance must not force
        // a different account mode.
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

        // Use the EIP-7702 route for EOAs. If a chain is not delegated yet,
        // the send flow can request an authorization for that chain.
        setWalletMode('delegatedEoa');
      } catch (err) {
        if (cancelled) return;
        const sanitizedError = sanitizeError(err, privateKey);
        console.error('Wallet mode verification failed:', sanitizedError);
        setEip7702Info({});
        setError(sanitizedError);
        setWalletMode('delegatedEoa');
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
