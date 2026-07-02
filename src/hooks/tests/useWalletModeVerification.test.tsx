/* eslint-disable no-plusplus */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, waitFor } from '@testing-library/react';
import { privateKeyToAccount } from 'viem/accounts';
import { vi } from 'vitest';

import { OUR_EIP7702_IMPLEMENTATION_ADDRESS } from '../../utils/eip7702Authorization';
import type { EtherspotTransactionKit } from '../../utils/nativeTransactionKit';
import { useWalletModeVerification } from '../useWalletModeVerification';

vi.mock('viem', () => ({
  createPublicClient: vi.fn(),
  http: vi.fn(),
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(),
}));

vi.mock('../../utils/blockchain', () => ({
  visibleChains: [
    { id: 1, name: 'Ethereum', testnet: false },
    { id: 137, name: 'Polygon', testnet: false },
  ],
}));

vi.mock('../../utils/common', () => ({
  sanitizeError: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err);
  }),
}));

const mockGetCode = vi.fn();
const mockGetBalance = vi.fn();
const mockPublicClient = {
  getCode: mockGetCode,
  getBalance: mockGetBalance,
};

// Helper to setup mockGetCode responses in a clear, grouped way
// Responses are returned in order: first all EOA checks (one per chain), then all counterfactual checks (one per chain)
const setupMockGetCode = (config: {
  eoaResponses: string[]; // Responses for EOA address checks, one per chain in visibleChains order
  counterfactualResponses?: string[]; // Responses for counterfactual address checks, one per chain
  defaultResponse?: string; // Default response if queue runs out
}) => {
  const responses: string[] = [
    ...config.eoaResponses,
    ...(config.counterfactualResponses || []),
  ];
  let callIndex = 0;

  mockGetCode.mockImplementation(() => {
    const response = responses[callIndex] ?? config.defaultResponse ?? '0x';
    callIndex++;
    return Promise.resolve(response);
  });
};

const mockKit = {
  getWalletAddress: vi.fn(),
} as unknown as EtherspotTransactionKit;

const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_EOA_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TEST_SMART_CONTRACT_ADDRESS =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TEST_COUNTERFACTUAL_ADDRESS =
  '0x1234567890123456789012345678901234567890';
const TEST_EIP7702_CODE = `0xef0100${OUR_EIP7702_IMPLEMENTATION_ADDRESS.slice(2)}`;
const TEST_OTHER_CONTRACT_CODE = '0x6080604052348015600f57600080fd5b50';

describe('useWalletModeVerification', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { createPublicClient } = await import('viem');
    (createPublicClient as any).mockReturnValue(mockPublicClient);

    (mockKit.getWalletAddress as any).mockResolvedValue(
      TEST_COUNTERFACTUAL_ADDRESS
    );

    (privateKeyToAccount as any).mockReturnValue({
      address: TEST_EOA_ADDRESS,
    });
  });

  describe('Smart Contract Detection', () => {
    it('should detect when eoaAddress is a smart contract and skip EIP-7702 check', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      setupMockGetCode({
        eoaResponses: [TEST_OTHER_CONTRACT_CODE, '0x'], // Chain 1: contract, Chain 137: EOA
      });

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_SMART_CONTRACT_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
        expect(result.current.error).toBeNull();
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      const warningMessage = consoleWarnSpy.mock.calls[0][0] as string;
      expect(warningMessage).toContain('is a smart contract');
      expect(warningMessage).toContain('not an EOA');
      expect(warningMessage).toContain('chain(s): 1');
      expect(mockGetCode).toHaveBeenCalledTimes(2);
      expect(mockGetCode).toHaveBeenCalledWith({
        address: TEST_SMART_CONTRACT_ADDRESS,
      });
      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should detect contract on multiple chains', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      setupMockGetCode({
        eoaResponses: [TEST_OTHER_CONTRACT_CODE, TEST_OTHER_CONTRACT_CODE], // Contract on both chains
      });

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_SMART_CONTRACT_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
      });

      const warningMessage = consoleWarnSpy.mock.calls[0][0] as string;
      expect(warningMessage).toContain('chain(s): 1, 137');

      consoleWarnSpy.mockRestore();
    });

    it('should not treat EIP-7702 code as a smart contract', async () => {
      setupMockGetCode({
        eoaResponses: [TEST_EIP7702_CODE, '0x'], // Chain 1: EIP-7702, Chain 137: EOA
        counterfactualResponses: ['0x', '0x'], // Not deployed on either chain
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
      });

      expect(mockGetCode).toHaveBeenCalledWith({
        address: TEST_EOA_ADDRESS,
      });
    });

    it('should treat empty code (0x) as EOA', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'], // EOA on both chains
        counterfactualResponses: ['0x', '0x'], // Not deployed on either chain
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
      });
    });

    it('should handle undefined code as EOA', async () => {
      setupMockGetCode({
        eoaResponses: [undefined as any, '0x'], // Chain 1: undefined, Chain 137: EOA
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
      });
    });
  });

  describe('EOA Address Resolution', () => {
    it('should use eoaAddress prop when provided', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x', '0x'],
      });
      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBeDefined();
      });

      expect(mockGetCode).toHaveBeenCalledWith({
        address: TEST_EOA_ADDRESS,
      });
    });

    it('should derive EOA from privateKey when eoaAddress not provided', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x', '0x'],
      });
      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          privateKey: TEST_PRIVATE_KEY,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBeDefined();
      });

      expect(privateKeyToAccount).toHaveBeenCalledWith(TEST_PRIVATE_KEY);
      expect(mockGetCode).toHaveBeenCalledWith({
        address: TEST_EOA_ADDRESS,
      });
    });

    it('should prioritize eoaAddress over privateKey', async () => {
      const customEoaAddress = '0x9999999999999999999999999999999999999999';
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x', '0x'],
      });
      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          privateKey: TEST_PRIVATE_KEY,
          eoaAddress: customEoaAddress,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBeDefined();
      });

      expect(mockGetCode).toHaveBeenCalledWith({
        address: customEoaAddress,
      });
    });

    it('should return early when no EOA address is available', async () => {
      const { result } = renderHook(() =>
        useWalletModeVerification({
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
        // When both privateKey and eoaAddress are missing, hook returns early without error
        expect(result.current.error).toBeNull();
      });

      expect(mockGetCode).not.toHaveBeenCalled();
    });
  });

  describe('EOA EIP-7702 Mode Checks', () => {
    it('should use delegatedEoa for an EOA without checking a counterfactual wallet', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x1234', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
      });

      expect(mockGetCode).toHaveBeenCalledTimes(2);
      expect(mockGetBalance).not.toHaveBeenCalled();
      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();
    });

    it('should not force modular mode when the EOA has balance on any chain', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance
        .mockResolvedValueOnce(BigInt(1000000000000000000)) // Chain 1: has balance
        .mockResolvedValueOnce(BigInt(0)); // Chain 137: no balance

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
      });

      expect(mockGetBalance).not.toHaveBeenCalled();
    });

    it('should check EOA code across all visible chains', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
      });

      expect(mockGetCode).toHaveBeenCalledTimes(2);
      expect(mockGetBalance).not.toHaveBeenCalled();
    });
  });

  describe('EIP-7702 Detection', () => {
    it('should detect our EIP-7702 implementation on EOA', async () => {
      setupMockGetCode({
        eoaResponses: [TEST_EIP7702_CODE, '0x'], // Chain 1: our EIP-7702, Chain 137: no EIP-7702
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
        expect(result.current.eip7702Info[1]).toMatchObject({
          hasImplementation: true,
          isOurImplementation: true,
          isOtherImplementation: false,
        });
        expect(
          result.current.eip7702Info[1].delegateAddress?.toLowerCase()
        ).toBe(OUR_EIP7702_IMPLEMENTATION_ADDRESS.toLowerCase());
      });
    });

    it('should detect other EIP-7702 implementation', async () => {
      const otherImplementation = '0x2222222222222222222222222222222222222222';
      const otherEip7702Code = `0xef0100${otherImplementation.slice(2)}`;

      setupMockGetCode({
        eoaResponses: [otherEip7702Code, '0x'], // Chain 1: other EIP-7702, Chain 137: no EIP-7702
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
        expect(result.current.eip7702Info[1]).toEqual({
          hasImplementation: true,
          isOurImplementation: false,
          isOtherImplementation: true,
          delegateAddress: otherImplementation.toLowerCase(),
        });
      });
    });

    it('should handle no EIP-7702 implementation', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'], // No EIP-7702 on either chain
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
        expect(result.current.eip7702Info[1]).toEqual({
          hasImplementation: false,
          isOurImplementation: false,
          isOtherImplementation: false,
          delegateAddress: null,
        });
        expect(result.current.eip7702Info[137]).toEqual({
          hasImplementation: false,
          isOurImplementation: false,
          isOtherImplementation: false,
          delegateAddress: null,
        });
      });
    });

    it('should check EIP-7702 across all chains', async () => {
      setupMockGetCode({
        eoaResponses: [TEST_EIP7702_CODE, '0x'], // Chain 1: EIP-7702, Chain 137: no EIP-7702
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.eip7702Info[1]).toBeDefined();
        expect(result.current.eip7702Info[137]).toBeDefined();
      });

      expect(result.current.eip7702Info[1].hasImplementation).toBe(true);
      expect(result.current.eip7702Info[137].hasImplementation).toBe(false);
    });

    it('should handle malformed EIP-7702 code', async () => {
      const malformedCode = '0xef0100'; // Missing delegate address

      setupMockGetCode({
        eoaResponses: [malformedCode, '0x'], // Chain 1: malformed EIP-7702, Chain 137: no EIP-7702
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
      });

      expect(result.current.eip7702Info[1].delegateAddress).toBeNull();
    });

    it('should extract delegate address correctly from EIP-7702 code', async () => {
      const customDelegate = '0x3333333333333333333333333333333333333333';
      const eip7702Code = `0xef0100${customDelegate.slice(2)}`;

      setupMockGetCode({
        eoaResponses: [eip7702Code, '0x'], // Chain 1: EIP-7702 with custom delegate, Chain 137: no EIP-7702
        counterfactualResponses: ['0x', '0x'],
      });

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.eip7702Info[1].delegateAddress).toBe(
          customDelegate.toLowerCase()
        );
      });
    });
  });

  describe('Loading State', () => {
    it('should set isLoading to true initially', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x', '0x'],
      });
      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should set isLoading to false after contract detection', async () => {
      setupMockGetCode({
        eoaResponses: [TEST_OTHER_CONTRACT_CODE, '0x'],
      });

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_SMART_CONTRACT_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should not call getWalletAddress during EOA wallet mode verification', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
      });
      mockGetBalance.mockResolvedValue(BigInt(0));
      (mockKit.getWalletAddress as any).mockRejectedValueOnce(
        new Error('getWalletAddress failed')
      );

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.walletMode).toBe('delegatedEoa');
      });

      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();
    });

    it('should not run removed deployment checks after EOA validation', async () => {
      let callCount = 0;
      mockGetCode.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve('0x');
        }
        return Promise.reject(new Error('Unexpected deployment check'));
      });
      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.walletMode).toBe('delegatedEoa');
      });

      expect(callCount).toBe(2);
      expect(mockGetBalance).not.toHaveBeenCalled();
    });

    it('should handle error in EOA address checks', async () => {
      // Don't use setupMockGetCode here - we want to test error handling
      mockGetCode.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.walletMode).toBe('modular');
      });
    });

    it('should handle getCode error during contract detection', async () => {
      mockGetCode.mockRejectedValueOnce(new Error('RPC error'));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.walletMode).toBe('modular');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing kit', async () => {
      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: null,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
      });
    });

    it('should handle missing both privateKey and eoaAddress', async () => {
      const { result } = renderHook(() =>
        useWalletModeVerification({
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
      });
    });

    it('should check all chains for smart contract detection', async () => {
      setupMockGetCode({
        eoaResponses: [TEST_OTHER_CONTRACT_CODE, '0x'], // Contract on chain 1
      });

      renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_SMART_CONTRACT_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(mockGetCode).toHaveBeenCalled();
      });

      expect(mockGetCode).toHaveBeenCalledTimes(2);
      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();
    });

    it('should NOT call getWalletAddress when contract is detected', async () => {
      setupMockGetCode({
        eoaResponses: [TEST_OTHER_CONTRACT_CODE, '0x'],
      });

      renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_SMART_CONTRACT_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(mockGetCode).toHaveBeenCalled();
      });

      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();
    });

    it('should handle contract detection when privateKey derives contract address', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const contractAddress = '0xContractFromPrivateKey';
      (privateKeyToAccount as any).mockReturnValue({
        address: contractAddress,
      });

      setupMockGetCode({
        eoaResponses: [TEST_OTHER_CONTRACT_CODE, '0x'], // Contract on chain 1
      });

      const { result } = renderHook(() =>
        useWalletModeVerification({
          privateKey: TEST_PRIVATE_KEY,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      const warningMessage = consoleWarnSpy.mock.calls[0][0] as string;
      expect(warningMessage).toContain('is a smart contract');
      expect(warningMessage).toContain('not an EOA');
      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should clear error on successful verification', async () => {
      setupMockGetCode({
        eoaResponses: ['0x', '0x'],
        counterfactualResponses: ['0x', '0x'],
      });
      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(
        ({ eoaAddress }) =>
          useWalletModeVerification({
            eoaAddress,
            kit: mockKit,
          }),
        {
          initialProps: { eoaAddress: TEST_EOA_ADDRESS },
        }
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('delegatedEoa');
        expect(result.current.error).toBeNull();
      });
    });
  });
});
