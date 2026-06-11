import type { EtherspotTransactionKit } from '@etherspot/transaction-kit';
import { createSmartAccountClient } from 'permissionless';
import { toSimpleSmartAccount } from 'permissionless/accounts';
import {
  type Address,
  type Hex,
  type WalletClient,
  createPublicClient,
  defineChain,
  http,
  type PublicClient,
} from 'viem';
import { toAccount } from 'viem/accounts';
import { entryPoint07Address } from 'viem/account-abstraction';

import type { WalletProviderLike } from '../types/walletProvider';

export const ARC_TESTNET_ENABLED =
  import.meta.env.ARC_TESTNET_ENABLED === 'true';
export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_RPC_URL = 'http://0.0.0.0:14337/rpc';
export const ARC_TESTNET_BUNDLER_URL = ARC_TESTNET_RPC_URL;
export const ARC_TESTNET_EXPLORER_URL = 'https://testnet.arcscan.app';
export const ARC_TESTNET_SIMPLE_ACCOUNT_FACTORY_ADDRESS =
  '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985';
export const ARC_TESTNET_NATIVE_TOKEN_SYMBOL = 'USDC';
export const ARC_TESTNET_NATIVE_TOKEN_DECIMALS = 6;

export const arcTestnetChain = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: ARC_TESTNET_NATIVE_TOKEN_SYMBOL,
    symbol: ARC_TESTNET_NATIVE_TOKEN_SYMBOL,
    decimals: ARC_TESTNET_NATIVE_TOKEN_DECIMALS,
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC_URL],
    },
    public: {
      http: [ARC_TESTNET_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: ARC_TESTNET_EXPLORER_URL,
    },
  },
  testnet: true,
});

type ArcQueuedTransaction = {
  batchName?: string;
  chainId: number;
  data?: Hex;
  to: Address;
  transactionName?: string;
  value: bigint;
};

type ArcKitState = {
  batches: Record<string, ArcQueuedTransaction[]>;
  containsEstimatingError: boolean;
  containsSendingError: boolean;
  isEstimating: boolean;
  isSending: boolean;
  namedTransactions: Record<string, ArcQueuedTransaction>;
};

const DEFAULT_ARC_GAS_UNITS = 330_000n;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeValue = (
  value: bigint | number | string | undefined
): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.max(0, Math.trunc(value)));

  try {
    return BigInt(value || '0');
  } catch {
    return 0n;
  }
};

const normalizeTransaction = (transaction: {
  chainId: number;
  data?: Hex;
  to: Address;
  transactionName?: string;
  value?: bigint | number | string;
}): ArcQueuedTransaction => {
  if (transaction.chainId !== ARC_TESTNET_CHAIN_ID) {
    throw new Error(
      `Arc testnet mode only supports chainId ${ARC_TESTNET_CHAIN_ID}`
    );
  }

  return {
    chainId: transaction.chainId,
    data:
      transaction.data && transaction.data !== '0x'
        ? (transaction.data as Hex)
        : undefined,
    to: transaction.to,
    transactionName: transaction.transactionName,
    value: normalizeValue(transaction.value),
  };
};

export const isArcChainId = (chainId: number | undefined): boolean =>
  chainId === ARC_TESTNET_CHAIN_ID;

export const createArcPublicClient = (): PublicClient =>
  createPublicClient({
    chain: arcTestnetChain,
    transport: http(ARC_TESTNET_RPC_URL),
  });

const createArcOwnerAccount = (walletClient: WalletClient) => {
  const { account } = walletClient;

  if (!account) {
    throw new Error('Owner wallet client account is not available');
  }

  return toAccount({
    address: account.address,
    async sign({ hash }) {
      return walletClient.signMessage({
        account,
        message: { raw: hash },
      });
    },
    async signMessage({ message }) {
      return walletClient.signMessage({
        account,
        message,
      });
    },
    async signTransaction(transaction) {
      return walletClient.signTransaction({
        account,
        chain: walletClient.chain,
        ...(transaction as Record<string, unknown>),
      } as never);
    },
    async signTypedData(typedData) {
      return walletClient.signTypedData({
        account,
        ...(typedData as Record<string, unknown>),
      } as never);
    },
  });
};

const createArcSmartAccount = async (walletClient: WalletClient) => {
  const publicClient = createArcPublicClient();
  const owner = createArcOwnerAccount(walletClient);

  return toSimpleSmartAccount({
    client: publicClient,
    owner,
    factoryAddress: ARC_TESTNET_SIMPLE_ACCOUNT_FACTORY_ADDRESS,
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  });
};

export const getArcSmartAccountAddress = async (
  walletClient: WalletClient
): Promise<string> => {
  const account = await createArcSmartAccount(walletClient);
  return account.address;
};

const createArcSmartAccountClientInternal = async (
  walletClient: WalletClient
) => {
  const account = await createArcSmartAccount(walletClient);

  return createSmartAccountClient({
    account,
    chain: arcTestnetChain,
    bundlerTransport: http(ARC_TESTNET_BUNDLER_URL),
  });
};

export const getArcNativeBalance = async (walletAddress: string) => {
  const publicClient = createArcPublicClient();
  return publicClient.getBalance({
    address: walletAddress as Address,
  });
};

const getArcGasPrice = async () => {
  const publicClient = createArcPublicClient();

  try {
    const fees = await publicClient.estimateFeesPerGas();
    return fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
  } catch {
    try {
      const gasPrice = await publicClient.request({
        method: 'eth_gasPrice',
      });
      return normalizeValue(gasPrice as string);
    } catch {
      return 0n;
    }
  }
};

const getArcEstimatedCost = async (transactionCount = 1) => {
  const gasPrice = await getArcGasPrice();
  const count = BigInt(Math.max(transactionCount, 1));
  return gasPrice * DEFAULT_ARC_GAS_UNITS * count;
};

export const createArcTransactionKitAdapter = ({
  walletClient,
  walletProvider,
}: {
  walletClient: WalletClient;
  walletProvider?: WalletProviderLike;
}): EtherspotTransactionKit => {
  const state: ArcKitState = {
    batches: {},
    containsEstimatingError: false,
    containsSendingError: false,
    isEstimating: false,
    isSending: false,
    namedTransactions: {},
  };

  let pendingTransaction: ArcQueuedTransaction | null = null;
  let selectedTransactionName: string | null = null;
  let smartAccountClientPromise: Promise<
    Awaited<ReturnType<typeof createArcSmartAccountClientInternal>>
  > | null = null;

  const transactionNameToBatchName = new Map<string, string>();

  const getSmartAccountClient = async () => {
    if (!smartAccountClientPromise) {
      smartAccountClientPromise =
        createArcSmartAccountClientInternal(walletClient);
    }

    return smartAccountClientPromise;
  };

  const removeNamedTransaction = (transactionName: string) => {
    const batchName = transactionNameToBatchName.get(transactionName);

    delete state.namedTransactions[transactionName];
    transactionNameToBatchName.delete(transactionName);

    if (!batchName) return;

    const remainingTransactions = (state.batches[batchName] || []).filter(
      (transaction) => transaction.transactionName !== transactionName
    );

    if (remainingTransactions.length > 0) {
      state.batches[batchName] = remainingTransactions;
      return;
    }

    delete state.batches[batchName];
  };

  const removeBatch = (batchName: string) => {
    const batchTransactions = state.batches[batchName] || [];
    batchTransactions.forEach((transaction) => {
      if (transaction.transactionName) {
        delete state.namedTransactions[transaction.transactionName];
        transactionNameToBatchName.delete(transaction.transactionName);
      }
    });
    delete state.batches[batchName];
  };

  const sendTransactions = async (
    transactions: ArcQueuedTransaction[]
  ): Promise<{
    chainId?: number;
    errorMessage?: string;
    userOpHash?: string;
  }> => {
    if (!transactions.length) {
      return {
        errorMessage: 'No Arc transactions are queued',
      };
    }

    const smartAccountClient = await getSmartAccountClient();
    const userOpHash = await smartAccountClient.sendUserOperation({
      calls: transactions.map((transaction) => ({
        to: transaction.to,
        value: transaction.value,
        ...(transaction.data ? { data: transaction.data } : {}),
      })),
    });

    return {
      chainId: ARC_TESTNET_CHAIN_ID,
      userOpHash,
    };
  };

  const adapter = {
    batch: ({ batchName }: { batchName: string }) => ({
      remove: () => {
        removeBatch(batchName);
      },
    }),
    delegateSmartAccountToEoa: async () => ({
      authorization: null,
    }),
    estimate: async () => {
      const transactions = Object.values(state.namedTransactions).filter(
        (transaction) => !transaction.batchName
      );

      if (!transactions.length) {
        return {
          chainId: ARC_TESTNET_CHAIN_ID,
          cost: 0n,
          errorMessage: 'No Arc transaction available for estimation',
        };
      }

      return {
        chainId: ARC_TESTNET_CHAIN_ID,
        cost: await getArcEstimatedCost(transactions.length),
      };
    },
    estimateBatches: async ({
      onlyBatchNames,
    }: {
      onlyBatchNames?: string[];
    }) => {
      const batchNames = onlyBatchNames || Object.keys(state.batches);
      const batches = Object.fromEntries(
        await Promise.all(
          batchNames.map(async (batchName) => {
            const transactions = state.batches[batchName] || [];
            const cost = await getArcEstimatedCost(transactions.length);

            return [
              batchName,
              {
                transactions: transactions.map((transaction) => ({
                  chainId: transaction.chainId,
                  cost,
                })),
              },
            ];
          })
        )
      );

      return {
        batches,
        isEstimatedSuccessfully: true,
      };
    },
    getEtherspotProvider: () => ({
      getChainId: () => ARC_TESTNET_CHAIN_ID,
      getConfig: () => ({
        chainId: ARC_TESTNET_CHAIN_ID,
        walletMode: 'delegatedEoa' as const,
      }),
      getPublicClient: async () => createArcPublicClient(),
      getWalletClient: async () => walletClient,
      getWalletMode: () => 'delegatedEoa' as const,
    }),
    getProvider: () => {
      if (walletProvider && 'request' in walletProvider) {
        return walletProvider;
      }

      throw new Error(
        'A raw EIP-1193 provider is not available for Arc testnet mode'
      );
    },
    getState: () => state,
    getTransactionHash: async (
      userOpHash: string,
      chainId = ARC_TESTNET_CHAIN_ID,
      timeoutMs = 120_000,
      intervalMs = 3_000
    ) => {
      const smartAccountClient = await getSmartAccountClient();
      const startedAt = Date.now();

      if (chainId !== ARC_TESTNET_CHAIN_ID) {
        console.warn(
          `Arc transaction hash lookup received non-Arc chainId ${chainId}`
        );
      }

      const pollForReceipt = async (): Promise<string | undefined> => {
        if (Date.now() - startedAt >= timeoutMs) {
          return undefined;
        }

        const receipt = await smartAccountClient
          .getUserOperationReceipt({
            hash: userOpHash as Hex,
          })
          .catch(() => undefined);

        if (receipt?.receipt?.transactionHash) {
          return receipt.receipt.transactionHash;
        }

        await sleep(intervalMs);

        return pollForReceipt();
      };

      return pollForReceipt();
    },
    getWalletAddress: async () => getArcSmartAccountAddress(walletClient),
    isDelegateSmartAccountToEoa: async () => false,
    name: ({ transactionName }: { transactionName: string }) => {
      selectedTransactionName = transactionName;
      return adapter;
    },
    remove: () => {
      if (!selectedTransactionName) return;
      removeNamedTransaction(selectedTransactionName);
      selectedTransactionName = null;
    },
    reset: () => {
      pendingTransaction = null;
      selectedTransactionName = null;
      state.batches = {};
      state.namedTransactions = {};
      transactionNameToBatchName.clear();
    },
    send: async () => {
      const transactionNames = Object.keys(state.namedTransactions).filter(
        (transactionName) => !transactionNameToBatchName.has(transactionName)
      );
      const transactions = transactionNames
        .map((transactionName) => state.namedTransactions[transactionName])
        .filter(Boolean);

      const result = await sendTransactions(transactions);

      if (!result.errorMessage) {
        transactionNames.forEach((transactionName) =>
          removeNamedTransaction(transactionName)
        );
      }

      return result;
    },
    sendBatches: async ({ onlyBatchNames }: { onlyBatchNames?: string[] }) => {
      const batchNames = onlyBatchNames || Object.keys(state.batches);
      const batchEntries = await Promise.all(
        batchNames.map(async (batchName) => {
          const transactions = state.batches[batchName] || [];

          try {
            const sent = await sendTransactions(transactions);

            if (sent.errorMessage || !sent.userOpHash) {
              return [
                batchName,
                {
                  errorMessage:
                    sent.errorMessage ||
                    'Arc batch submission failed unexpectedly',
                },
              ] as const;
            }

            removeBatch(batchName);

            return [
              batchName,
              {
                chainGroups: {
                  [ARC_TESTNET_CHAIN_ID]: {
                    userOpHash: sent.userOpHash,
                  },
                },
              },
            ] as const;
          } catch (error) {
            return [
              batchName,
              {
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : 'Arc batch submission failed',
              },
            ] as const;
          }
        })
      );
      const batches = Object.fromEntries(batchEntries) as Record<
        string,
        {
          chainGroups?: Record<number, { userOpHash: string }>;
          errorMessage?: string;
        }
      >;

      const isSentSuccessfully = Object.values(batches).every(
        (batch) => !batch.errorMessage
      );

      return {
        batches,
        isSentSuccessfully,
      };
    },
    transaction: ({
      chainId,
      data,
      to,
      value,
    }: {
      chainId: number;
      data?: Hex;
      to: Address;
      value?: bigint | number | string;
    }) => {
      pendingTransaction = normalizeTransaction({
        chainId,
        data,
        to,
        value,
      });

      return {
        name: ({ transactionName }: { transactionName: string }) => {
          if (!pendingTransaction) {
            throw new Error('No Arc transaction is pending');
          }

          const namedTransaction = {
            ...pendingTransaction,
            transactionName,
          };

          state.namedTransactions[transactionName] = namedTransaction;
          selectedTransactionName = transactionName;
          pendingTransaction = null;

          return {
            addToBatch: ({ batchName }: { batchName: string }) => {
              state.batches[batchName] = [
                ...(state.batches[batchName] || []),
                {
                  ...namedTransaction,
                  batchName,
                },
              ];
              transactionNameToBatchName.set(transactionName, batchName);
              state.namedTransactions[transactionName] = {
                ...namedTransaction,
                batchName,
              };
              return adapter;
            },
          };
        },
      };
    },
  };

  return adapter as unknown as EtherspotTransactionKit;
};
