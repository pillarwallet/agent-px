/* eslint-disable @typescript-eslint/no-explicit-any */
import { EtherspotTransactionKit } from '@etherspot/transaction-kit';
import { renderHook, waitFor } from '@testing-library/react';
import { privateKeyToAccount } from 'viem/accounts';
import { vi } from 'vitest';

import { OUR_EIP7702_IMPLEMENTATION_ADDRESS } from '../../utils/eip7702Authorization';
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

      mockGetCode
        .mockResolvedValueOnce(TEST_OTHER_CONTRACT_CODE)
        .mockResolvedValue('0x')
        .mockResolvedValue(BigInt(0));

      mockGetBalance.mockResolvedValue(BigInt(0));

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

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('is a smart contract, not an EOA')
      );
      expect(mockGetCode).toHaveBeenCalledWith({
        address: TEST_SMART_CONTRACT_ADDRESS,
      });

      consoleWarnSpy.mockRestore();
    });

    it('should not treat EIP-7702 code as a smart contract', async () => {
      mockGetCode
        .mockResolvedValueOnce(TEST_EIP7702_CODE)
        .mockResolvedValue('0x')
        .mockResolvedValue('0x');

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

      const firstCall = mockGetCode.mock.calls[0];
      expect(firstCall[0].address).toBe(TEST_EOA_ADDRESS);
    });

    it('should treat empty code (0x) as EOA', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValue('0x')
        .mockResolvedValue('0x');

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
      mockGetCode.mockResolvedValue('0x');
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

      const firstCall = mockGetCode.mock.calls[0];
      expect(firstCall[0].address).toBe(TEST_EOA_ADDRESS);
    });

    it('should derive EOA from privateKey when eoaAddress not provided', async () => {
      mockGetCode.mockResolvedValue('0x');
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
      const firstCall = mockGetCode.mock.calls[0];
      expect(firstCall[0].address).toBe(TEST_EOA_ADDRESS);
    });

    it('should prioritize eoaAddress over privateKey', async () => {
      const customEoaAddress = '0x9999999999999999999999999999999999999999';
      mockGetCode.mockResolvedValue('0x');
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

      const firstCall = mockGetCode.mock.calls[0];
      expect(firstCall[0].address).toBe(customEoaAddress);
    });

    it('should set error when no EOA address is available', async () => {
      const { result } = renderHook(() =>
        useWalletModeVerification({
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
      });

      expect(mockGetCode).not.toHaveBeenCalled();
    });
  });

  describe('Smart Account Deployment Checks', () => {
    it('should remain modular when smart account is deployed', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x1234')
        .mockResolvedValue('0x');

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
      });
    });

    it('should remain modular when smart account has balance', async () => {
      mockGetCode.mockResolvedValueOnce('0x').mockResolvedValue('0x');

      mockGetBalance
        .mockResolvedValueOnce(BigInt(1000000000000000000))
        .mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
        expect(result.current.eip7702Info).toEqual({});
      });
    });
  });

  describe('EIP-7702 Detection', () => {
    it('should detect EIP-7702 implementation on EOA', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce(TEST_EIP7702_CODE)
        .mockResolvedValue('0x');

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

      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce(otherEip7702Code)
        .mockResolvedValue('0x');

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
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValue('0x');

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
      });
    });
  });

  describe('Smart Contract Detection - Additional Cases', () => {
    it('should detect smart contract when privateKey derives contract address', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const contractAddress = '0xContractFromPrivateKey';
      (privateKeyToAccount as any).mockReturnValue({
        address: contractAddress,
      });

      mockGetCode
        .mockResolvedValueOnce(TEST_OTHER_CONTRACT_CODE)
        .mockResolvedValue('0x');

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

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('is a smart contract, not an EOA')
      );
      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should NOT call getWalletAddress when contract is detected', async () => {
      mockGetCode.mockResolvedValueOnce(TEST_OTHER_CONTRACT_CODE);

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

    it('should handle getCode returning undefined', async () => {
      mockGetCode.mockResolvedValueOnce(undefined).mockResolvedValue('0x');
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

      expect(result.current.walletMode).toBe('delegatedEoa');
    });

    it('should handle both privateKey and eoaAddress where eoaAddress is contract', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      mockGetCode.mockResolvedValueOnce(TEST_OTHER_CONTRACT_CODE);

      const { result } = renderHook(() =>
        useWalletModeVerification({
          privateKey: TEST_PRIVATE_KEY,
          eoaAddress: TEST_SMART_CONTRACT_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
      });

      const firstCall = mockGetCode.mock.calls[0];
      expect(firstCall[0].address).toBe(TEST_SMART_CONTRACT_ADDRESS);
      expect(mockKit.getWalletAddress).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Loading State', () => {
    it('should set isLoading to true initially', async () => {
      mockGetCode.mockResolvedValue('0x');
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
      mockGetCode.mockResolvedValueOnce(TEST_OTHER_CONTRACT_CODE);

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

  describe('Multiple Chains', () => {
    it('should check deployment across all visible chains', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x1234')
        .mockResolvedValue('0x');

      mockGetBalance.mockResolvedValue(BigInt(0));

      const { result } = renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_EOA_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(result.current.walletMode).toBe('modular');
      });

      expect(mockGetCode).toHaveBeenCalledTimes(3);
      expect(mockGetBalance).toHaveBeenCalled();
    });

    it('should check EIP-7702 across all chains', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce(TEST_EIP7702_CODE)
        .mockResolvedValueOnce('0x')
        .mockResolvedValue('0x');

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
    });

    it('should handle EIP-7702 on one chain but not others', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce(TEST_EIP7702_CODE)
        .mockResolvedValueOnce('0x')
        .mockResolvedValue('0x');

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

      expect(result.current.eip7702Info[1].hasImplementation).toBe(true);
      expect(result.current.eip7702Info[137].hasImplementation).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle getWalletAddress() error after validation', async () => {
      mockGetCode.mockResolvedValueOnce('0x').mockResolvedValue('0x');
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
        expect(result.current.error).toBeTruthy();
        expect(result.current.walletMode).toBe('modular');
      });
    });

    it('should handle error in deployment checks', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('0x');

      mockGetBalance.mockResolvedValue(BigInt(0));

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

    it('should handle error in EIP-7702 checks', async () => {
      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('0x');

      mockGetBalance.mockResolvedValue(BigInt(0));

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

  describe('EIP-7702 Code Parsing', () => {
    it('should handle malformed EIP-7702 code', async () => {
      const malformedCode = '0xef0100'; // Missing delegate address

      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce(malformedCode)
        .mockResolvedValue('0x');

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

      mockGetCode
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce('0x')
        .mockResolvedValueOnce(eip7702Code)
        .mockResolvedValue('0x');

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

    it('should handle errors gracefully', async () => {
      const error = new Error('Network error');
      mockGetCode.mockRejectedValueOnce(error);

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

    it('should check mainnet first for smart contract detection', async () => {
      mockGetCode
        .mockResolvedValueOnce(TEST_OTHER_CONTRACT_CODE)
        .mockResolvedValue('0x');

      mockGetBalance.mockResolvedValue(BigInt(0));

      renderHook(() =>
        useWalletModeVerification({
          eoaAddress: TEST_SMART_CONTRACT_ADDRESS,
          kit: mockKit,
        })
      );

      await waitFor(() => {
        expect(mockGetCode).toHaveBeenCalled();
      });

      const firstCall = mockGetCode.mock.calls[0];
      expect(firstCall[0].address).toBe(TEST_SMART_CONTRACT_ADDRESS);
    });

    it('should handle chain fallback when mainnet not available', async () => {
      vi.doMock('../../utils/blockchain', () => ({
        visibleChains: [{ id: 137, name: 'Polygon', testnet: false }],
      }));

      mockGetCode.mockResolvedValueOnce('0x').mockResolvedValue('0x');
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
    });

    it('should clear error on successful verification', async () => {
      mockGetCode.mockResolvedValue('0x');
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
