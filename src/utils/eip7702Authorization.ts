import { SignAuthorizationReturnType } from 'viem/accounts';
import type { EtherspotTransactionKit } from './nativeTransactionKit';
import { transactionDebugError, transactionDebugLog } from './transactionDebug';

// From KernelVersionToAddressesMap[KERNEL_V3_3].accountImplementationAddress
export const OUR_EIP7702_IMPLEMENTATION_ADDRESS =
  '0xd6CEDDe84be40893d153Be9d467CD6aD37875b28';

const summarizeAuthorization = (
  authorization?: SignAuthorizationReturnType | null
) =>
  authorization
    ? {
        chainId: authorization.chainId,
        address: authorization.address,
        nonce: authorization.nonce?.toString(),
        hasSignature: Boolean(authorization.r && authorization.s),
      }
    : authorization;

/**
 * Checks if EOA has our Kernel v3.3 EIP-7702 implementation on the given chain.
 * If not, gets authorization for our implementation.
 *
 * @param kit - The EtherspotTransactionKit instance
 * @param chainId - The chain ID to check
 * @returns Authorization object if needed, null if already has our implementation
 */
export async function getEIP7702AuthorizationIfNeeded(
  kit: EtherspotTransactionKit,
  chainId: number
): Promise<SignAuthorizationReturnType | null> {
  transactionDebugLog('[EIP7702] authorization check started', {
    chainId,
  });

  try {
    // Check if EOA is designated on this chain
    const delegationStatus =
      await kit.getDelegateSmartAccountToEoaStatus(chainId);
    const {
      code: senderCode,
      delegateAddress,
      isDelegated,
      walletAddress,
    } = delegationStatus;
    transactionDebugLog('[EIP7702] designation check result', {
      chainId,
      isDesignated: isDelegated,
      walletAddress,
      delegateAddress,
    });

    if (isDelegated === true) {
      // EOA is designated, check if it's our implementation
      if (!walletAddress) {
        transactionDebugError(
          `Cannot get wallet address for chain ${chainId}, skipping authorization check`
        );
        return null;
      }

      // Get code at EOA address
      transactionDebugLog('[EIP7702] sender code fetched', {
        chainId,
        walletAddress,
        senderCode,
      });

      if (senderCode && senderCode.startsWith('0xef0100')) {
        // Check if it's our implementation (Kernel V3.3)
        const isOurImplementation =
          delegateAddress?.toLowerCase() ===
          OUR_EIP7702_IMPLEMENTATION_ADDRESS.toLowerCase();
        transactionDebugLog('[EIP7702] delegate implementation check', {
          chainId,
          walletAddress,
          delegateAddress,
          expectedDelegateAddress: OUR_EIP7702_IMPLEMENTATION_ADDRESS,
          isOurImplementation,
        });

        if (isOurImplementation) {
          // Already has our implementation, no authorization needed
          transactionDebugLog('[EIP7702] authorization not needed', {
            chainId,
            reason: 'EOA already delegates to Pillar Kernel implementation',
          });
          return null;
        }
      }
    }

    // Not designated or not our implementation - need authorization
    transactionDebugLog('[EIP7702] signing authorization', {
      chainId,
      delegateAddress: OUR_EIP7702_IMPLEMENTATION_ADDRESS,
    });
    const authResult = await kit.delegateSmartAccountToEoa({
      chainId,
      delegateImmediately: false, // Just get authorization, don't execute
    });
    transactionDebugLog('[EIP7702] authorization result', {
      chainId,
      isAlreadyInstalled: authResult.isAlreadyInstalled,
      eoaAddress: authResult.eoaAddress,
      delegateAddress: authResult.delegateAddress,
      authorization: summarizeAuthorization(authResult.authorization),
    });

    return authResult.authorization || null;
  } catch (error: unknown) {
    // Log and try to get authorization anyway as a fallback
    const message = error instanceof Error ? error.message : String(error);
    transactionDebugError(
      `Failed to check/get EIP-7702 authorization for chain ${chainId}: ${message}`
    );
    try {
      transactionDebugLog('[EIP7702] fallback signing authorization', {
        chainId,
        delegateAddress: OUR_EIP7702_IMPLEMENTATION_ADDRESS,
      });
      const authResult = await kit.delegateSmartAccountToEoa({
        chainId,
        delegateImmediately: false,
      });
      transactionDebugLog('[EIP7702] fallback authorization result', {
        chainId,
        isAlreadyInstalled: authResult.isAlreadyInstalled,
        eoaAddress: authResult.eoaAddress,
        delegateAddress: authResult.delegateAddress,
        authorization: summarizeAuthorization(authResult.authorization),
      });
      return authResult.authorization || null;
    } catch (fallbackError: unknown) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      transactionDebugError(
        `Fallback authorization also failed for chain ${chainId}: ${fallbackMessage}`
      );
      return null;
    }
  }
}
