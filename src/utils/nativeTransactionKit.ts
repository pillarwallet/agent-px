/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
import {
  checksumAddress,
  createPublicClient,
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  parseUnits,
  zeroAddress,
} from 'viem';
import type {
  Address,
  Chain,
  Hex,
  LocalAccount,
  PublicClient,
  SignableMessage,
  TypedData,
  TypedDataDefinition,
  WalletClient,
} from 'viem';
import type {
  EstimateUserOperationGasReturnType,
  SmartAccount,
} from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';
import type { SignAuthorizationReturnType } from 'viem/accounts';

import type { WalletProviderLike } from '../types/walletProvider';
import { supportedChains } from './blockchain';
import { getEtherspotBundlerUrl } from './bundler';
import {
  createPillarSmartAccountClient,
  PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
  type PillarCall,
  type PillarSmartAccount,
} from './pillarSmartAccountClient';

export type WalletMode = 'modular' | 'delegatedEoa';

export interface EtherspotTransactionKitConfig {
  chainId: number;
  walletMode?: WalletMode;
  debugMode?: boolean;
  provider?: WalletProviderLike;
  privateKey?: string;
  viemLocalAccount?: LocalAccount;
  bundlerApiKey?: string;
  bundlerUrl?: string;
  bundlerApiKeyFormat?: string;
}

export interface TransactionBuilder {
  chainId?: number;
  to?: string;
  value?: bigint | string;
  data?: string;
  transactionName?: string;
  batchName?: string;
}

export interface TransactionParams {
  chainId: number;
  to: string;
  value?: bigint | string;
  data?: string;
}

export interface TransactionEstimateResult {
  to?: string;
  value?: string;
  data?: string;
  chainId?: number;
  cost?: bigint;
  userOp?: Record<string, unknown>;
  errorMessage?: string;
  errorType?: 'ESTIMATION_ERROR' | 'VALIDATION_ERROR';
  isEstimatedSuccessfully: boolean;
}

export interface TransactionSendResult extends TransactionEstimateResult {
  userOpHash?: string;
  errorType?: 'ESTIMATION_ERROR' | 'SEND_ERROR' | 'VALIDATION_ERROR';
  isSentSuccessfully: boolean;
}

export interface BatchEstimateResult {
  batches: {
    [batchName: string]: {
      transactions: TransactionEstimateResult[];
      chainGroups?: {
        [chainId: number]: {
          transactions: TransactionEstimateResult[];
          totalCost?: bigint;
          errorMessage?: string;
          isEstimatedSuccessfully: boolean;
        };
      };
      totalCost?: bigint;
      errorMessage?: string;
      isEstimatedSuccessfully: boolean;
    };
  };
  isEstimatedSuccessfully: boolean;
}

export interface BatchSendResult {
  batches: {
    [batchName: string]: {
      transactions: TransactionSendResult[];
      chainGroups?: {
        [chainId: number]: {
          transactions: TransactionSendResult[];
          userOpHash?: string;
          totalCost?: bigint;
          errorMessage?: string;
          isEstimatedSuccessfully: boolean;
          isSentSuccessfully: boolean;
        };
      };
      totalCost?: bigint;
      errorMessage?: string;
      isEstimatedSuccessfully: boolean;
      isSentSuccessfully: boolean;
    };
  };
  isEstimatedSuccessfully: boolean;
  isSentSuccessfully: boolean;
}

export interface TransactionKitState {
  selectedTransactionName?: string;
  selectedBatchName?: string;
  workingTransaction?: TransactionBuilder;
  namedTransactions: Record<string, TransactionBuilder>;
  batches: Record<string, TransactionBuilder[]>;
  isEstimating: boolean;
  isSending: boolean;
  containsSendingError: boolean;
  containsEstimatingError: boolean;
  walletAddresses: Record<number, string>;
}

type EstimateParams = {
  authorization?: SignAuthorizationReturnType;
};

type SendParams = {
  authorization?: SignAuthorizationReturnType;
};

type BatchParams = {
  onlyBatchNames?: string[];
  authorization?: SignAuthorizationReturnType;
};

type BundlerClient = Awaited<ReturnType<typeof createPillarSmartAccountClient>>;

const retainCompatibleParameter = (...values: unknown[]) => values.length;

const getChainById = (chainId: number): Chain => {
  const chain = supportedChains.find((supported) => supported.id === chainId);

  if (!chain) {
    throw new Error(`Unsupported chain ID ${chainId}`);
  }

  return chain;
};

const getProviderAccountAddress = async (
  provider: WalletProviderLike | undefined
): Promise<Address> => {
  if (!provider) {
    throw new Error('No wallet provider configured');
  }

  const { account } = provider as WalletClient;

  if (typeof account === 'string' && isAddress(account)) {
    return getAddress(account);
  }

  if (
    typeof account === 'object' &&
    account !== null &&
    'address' in account &&
    typeof account.address === 'string' &&
    isAddress(account.address)
  ) {
    return getAddress(account.address);
  }

  if ('request' in provider && typeof provider.request === 'function') {
    const accounts = await provider.request<string[]>({
      method: 'eth_accounts',
    });

    const [firstAccount] = accounts || [];
    if (firstAccount && isAddress(firstAccount)) {
      return getAddress(firstAccount);
    }
  }

  throw new Error('Unable to resolve wallet provider account address');
};

const createProviderBackedAccount = async (
  provider: WalletProviderLike | undefined
): Promise<LocalAccount> => {
  const walletClient = provider as WalletClient | undefined;
  const address = await getProviderAccountAddress(provider);

  return {
    address,
    publicKey: '0x',
    source: 'provider',
    type: 'local',
    async signMessage({ message }: { message: SignableMessage }) {
      if (walletClient?.signMessage) {
        return walletClient.signMessage({
          account: address,
          message,
        });
      }

      if (provider && 'request' in provider) {
        let messageToSign: string | Hex;
        if (typeof message === 'string') {
          messageToSign = message;
        } else if ('raw' in message) {
          messageToSign = message.raw;
        } else {
          messageToSign = message.toString();
        }

        return provider.request<Hex>({
          method: 'personal_sign',
          params: [messageToSign, address],
        });
      }

      throw new Error('Wallet provider does not support message signing');
    },
    async signTransaction() {
      throw new Error('Provider-backed account cannot sign raw transactions');
    },
    async signTypedData(parameters) {
      if (walletClient?.signTypedData) {
        return walletClient.signTypedData({
          account: address,
          ...parameters,
        });
      }

      if (provider && 'request' in provider) {
        return provider.request<Hex>({
          method: 'eth_signTypedData_v4',
          params: [address, JSON.stringify(parameters)],
        });
      }

      throw new Error('Wallet provider does not support typed data signing');
    },
  } as LocalAccount;
};

const parseTransactionValue = (value?: bigint | string): bigint => {
  if (typeof value === 'bigint') {
    return value;
  }

  if (!value) {
    return BigInt(0);
  }

  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
};

const toHexData = (data?: string): Hex => {
  if (!data || data === '') {
    return '0x';
  }

  return data as Hex;
};

const toCall = (transaction: TransactionBuilder): PillarCall => {
  if (!transaction.to || !isAddress(transaction.to)) {
    throw new Error('Transaction is missing a valid recipient address');
  }

  return {
    to: checksumAddress(transaction.to as Address),
    value: parseTransactionValue(transaction.value),
    data: toHexData(transaction.data),
  };
};

const toBaseResult = (
  transaction: TransactionBuilder
): Pick<TransactionEstimateResult, 'to' | 'value' | 'data' | 'chainId'> => ({
  to: transaction.to,
  value:
    typeof transaction.value === 'bigint'
      ? transaction.value.toString()
      : transaction.value,
  data: transaction.data,
  chainId: transaction.chainId,
});

const sumUserOperationGas = (
  gas: EstimateUserOperationGasReturnType
): bigint => {
  return (
    BigInt(gas.callGasLimit ?? 0) +
    BigInt(gas.verificationGasLimit ?? 0) +
    BigInt(gas.preVerificationGas ?? 0) +
    BigInt(gas.paymasterPostOpGasLimit ?? 0) +
    BigInt(gas.paymasterVerificationGasLimit ?? 0)
  );
};

const groupTransactionsByChainId = (
  transactions: TransactionBuilder[]
): Record<number, TransactionBuilder[]> => {
  return transactions.reduce<Record<number, TransactionBuilder[]>>(
    (groups, transaction) => {
      if (typeof transaction.chainId !== 'number') {
        return groups;
      }

      return {
        ...groups,
        [transaction.chainId]: [
          ...(groups[transaction.chainId] || []),
          transaction,
        ],
      };
    },
    {}
  );
};

export class EtherspotUtils {
  static checksumAddress(address: string): string {
    if (!isAddress(address)) {
      throw new Error(`Invalid address: ${address}`);
    }

    return checksumAddress(address);
  }

  static async verifyEip1271Message(): Promise<boolean> {
    return false;
  }

  static toBigNumber(value: string | number, decimals = 18): bigint {
    return parseUnits(`${value}`, decimals);
  }

  static parseBigNumber(value: bigint | number | string | Hex, decimals = 18) {
    return formatUnits(BigInt(value), decimals);
  }

  static isZeroAddress(address: string): boolean {
    const zeroAddresses = [
      zeroAddress,
      '0x000000000000000000000000000000000000dEaD',
      '0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD',
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      '0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd',
      '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
    ];

    return zeroAddresses.some(
      (zeroAddressValue) =>
        isAddress(address) &&
        isAddressEqual(zeroAddressValue as Address, address as Address)
    );
  }

  static addressesEqual(address1: string, address2: string): boolean {
    return (
      isAddress(address1) &&
      isAddress(address2) &&
      isAddressEqual(address1 as Address, address2 as Address)
    );
  }
}

export class PillarTransactionProvider {
  private publicClientPerChain: Record<number, Promise<PublicClient>> = {};

  private walletClientPerChain: Record<number, Promise<WalletClient>> = {};

  private accountPerChain: Record<number, Promise<PillarSmartAccount>> = {};

  private bundlerClientPerChain: Record<number, Promise<BundlerClient>> = {};

  constructor(private readonly config: EtherspotTransactionKitConfig) {}

  getChainId() {
    return this.config.chainId;
  }

  getWalletMode(): WalletMode {
    return this.config.walletMode || 'modular';
  }

  getConfig() {
    return {
      chainId: this.config.chainId,
      walletMode: this.getWalletMode(),
      debugMode: this.config.debugMode,
      bundlerUrl: this.config.bundlerUrl,
      provider: this.config.provider,
    };
  }

  getProvider(): WalletProviderLike {
    if (!this.config.provider) {
      throw new Error('No wallet provider configured');
    }

    return this.config.provider;
  }

  getBundlerUrl(chainId = this.config.chainId): string {
    return getEtherspotBundlerUrl({
      chainId,
      apiKey: this.config.bundlerApiKey,
      bundlerUrl: this.config.bundlerUrl,
      apiKeyFormat: this.config.bundlerApiKeyFormat,
    });
  }

  async getOwnerAccount(): Promise<LocalAccount> {
    if (this.config.viemLocalAccount) {
      return this.config.viemLocalAccount;
    }

    if (this.config.privateKey) {
      return privateKeyToAccount(this.config.privateKey as Hex);
    }

    return createProviderBackedAccount(this.config.provider);
  }

  async getPublicClient(chainId = this.config.chainId): Promise<PublicClient> {
    if (!this.publicClientPerChain[chainId]) {
      this.publicClientPerChain[chainId] = Promise.resolve(
        createPublicClient({
          chain: getChainById(chainId),
          transport: http(this.getBundlerUrl(chainId)),
        })
      );
    }

    return this.publicClientPerChain[chainId];
  }

  async getWalletClient(chainId = this.config.chainId): Promise<WalletClient> {
    if (!this.walletClientPerChain[chainId]) {
      this.walletClientPerChain[chainId] = this.getOwnerAccount().then(
        (account) =>
          createWalletClient({
            account,
            chain: getChainById(chainId),
            transport: http(this.getBundlerUrl(chainId)),
          })
      );
    }

    return this.walletClientPerChain[chainId];
  }

  async getDelegatedEoaAccount(
    chainId = this.config.chainId
  ): Promise<SmartAccount> {
    if (!this.accountPerChain[chainId]) {
      this.accountPerChain[chainId] = (async () => {
        const publicClient = await this.getPublicClient(chainId);
        const owner = await this.getOwnerAccount();

        return createPillarSmartAccountClient({
          client: publicClient,
          owner,
          chain: getChainById(chainId),
          chainId,
          bundlerUrl: this.getBundlerUrl(chainId),
        }).then((client) => client.account as PillarSmartAccount);
      })();
    }

    return this.accountPerChain[chainId];
  }

  async getBundlerClient(
    chainId = this.config.chainId
  ): Promise<BundlerClient> {
    if (!this.bundlerClientPerChain[chainId]) {
      this.bundlerClientPerChain[chainId] = (async () => {
        const publicClient = await this.getPublicClient(chainId);
        const owner = await this.getOwnerAccount();

        return createPillarSmartAccountClient({
          client: publicClient,
          owner,
          chain: getChainById(chainId),
          chainId,
          bundlerUrl: this.getBundlerUrl(chainId),
        });
      })();
    }

    return this.bundlerClientPerChain[chainId];
  }

  async getSdk(chainId = this.config.chainId) {
    retainCompatibleParameter(chainId);
    const owner = await this.getOwnerAccount();

    return {
      getEOAAddress: () => owner.address,
      signMessage: ({ message }: { message: SignableMessage }) =>
        owner.signMessage({ message }),
      signTypedData: <
        const TTypedData extends TypedData,
        TPrimaryType extends keyof TTypedData | 'EIP712Domain',
      >(
        parameters: TypedDataDefinition<TTypedData, TPrimaryType>
      ) => owner.signTypedData(parameters),
    };
  }
}

export class EtherspotTransactionKit {
  static utils = EtherspotUtils;

  private readonly etherspotProvider: PillarTransactionProvider;

  private batches: Record<string, TransactionBuilder[]> = {};

  private namedTransactions: Record<string, TransactionBuilder> = {};

  private walletAddresses: Record<number, string> = {};

  private selectedTransactionName?: string;

  private selectedBatchName?: string;

  private workingTransaction?: TransactionBuilder;

  private isEstimating = false;

  private isSending = false;

  private containsSendingError = false;

  private containsEstimatingError = false;

  private debugMode = false;

  constructor(private readonly config: EtherspotTransactionKitConfig) {
    this.etherspotProvider = new PillarTransactionProvider(config);
    this.debugMode = Boolean(config.debugMode);
  }

  private log(message: string, data?: unknown) {
    if (this.debugMode) {
      console.log(`[PillarTransactionKit] ${message}`, data);
    }
  }

  private clearWorkingState() {
    this.selectedTransactionName = undefined;
    this.selectedBatchName = undefined;
    this.workingTransaction = undefined;
  }

  private resultMethods() {
    return {
      estimate: (params?: EstimateParams) => this.estimate(params),
      send: (params?: SendParams) => this.send(params),
      getState: () => this.getState(),
      reset: () => this.reset(),
    };
  }

  private getSelectedTransaction(): TransactionBuilder | undefined {
    if (this.workingTransaction) {
      return this.workingTransaction;
    }

    if (this.selectedTransactionName) {
      return this.namedTransactions[this.selectedTransactionName];
    }

    return undefined;
  }

  private getTargetBatchNames(onlyBatchNames?: string[]) {
    return onlyBatchNames?.length ? onlyBatchNames : Object.keys(this.batches);
  }

  private validateAuthorization(
    authorization: SignAuthorizationReturnType | undefined,
    chainId: number
  ): string | undefined {
    if (!authorization) {
      return undefined;
    }

    if (authorization.chainId !== chainId) {
      return `Invalid authorization: Authorization chain ID (${authorization.chainId}) does not match transaction chain ID (${chainId}).`;
    }

    if (
      authorization.address.toLowerCase() !==
      PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS.toLowerCase()
    ) {
      return `Invalid authorization: expected ${PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS}.`;
    }

    return undefined;
  }

  private async getCost({
    chainId,
    gas,
  }: {
    chainId: number;
    gas: EstimateUserOperationGasReturnType;
  }) {
    const publicClient = await this.etherspotProvider.getPublicClient(chainId);
    const totalGas = sumUserOperationGas(gas);

    try {
      const fees = await publicClient.estimateFeesPerGas();
      return totalGas * (fees.maxFeePerGas || fees.gasPrice || BigInt(0));
    } catch {
      const gasPrice = await publicClient.getGasPrice();
      return totalGas * gasPrice;
    }
  }

  private async estimateTransactions({
    chainId,
    transactions,
    authorization,
  }: {
    chainId: number;
    transactions: TransactionBuilder[];
    authorization?: SignAuthorizationReturnType;
  }) {
    const authorizationError = this.validateAuthorization(
      authorization,
      chainId
    );
    if (authorizationError) {
      throw new Error(authorizationError);
    }

    const isDelegated = await this.isDelegateSmartAccountToEoa(chainId);
    if (!isDelegated && !authorization) {
      throw new Error(
        'EOA is not designated for EIP-7702. Please authorize first or provide authorization.'
      );
    }

    const bundlerClient =
      await this.etherspotProvider.getBundlerClient(chainId);
    const calls = transactions.map(toCall);
    const shouldUseAuthorization = Boolean(
      authorization && authorization.chainId === chainId && !isDelegated
    );

    const gas = await bundlerClient.estimateUserOperationGas({
      account: bundlerClient.account,
      calls,
      ...(shouldUseAuthorization ? { authorization } : {}),
    });
    const cost = await this.getCost({ chainId, gas });

    return { cost, calls };
  }

  async getWalletAddress(chainId = this.config.chainId) {
    if (this.walletAddresses[chainId]) {
      return this.walletAddresses[chainId];
    }

    try {
      const account = await this.etherspotProvider.getOwnerAccount();
      this.walletAddresses[chainId] = account.address;
      return account.address;
    } catch (error) {
      this.log('Failed to get wallet address', error);
      return undefined;
    }
  }

  async isDelegateSmartAccountToEoa(chainId = this.config.chainId) {
    const publicClient = await this.etherspotProvider.getPublicClient(chainId);
    const walletAddress = await this.getWalletAddress(chainId);

    if (!walletAddress) {
      return undefined;
    }

    const code = await publicClient.getCode({
      address: walletAddress as Address,
    });

    return Boolean(code && code !== '0x' && code.startsWith('0xef0100'));
  }

  async delegateSmartAccountToEoa({
    chainId = this.config.chainId,
    delegateImmediately = false,
  }: {
    chainId?: number;
    delegateImmediately?: boolean;
  } = {}) {
    const owner = await this.etherspotProvider.getOwnerAccount();
    const walletClient = await this.etherspotProvider.getWalletClient(chainId);
    const eoaAddress = owner.address;
    const delegateAddress = PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS;
    const isAlreadyInstalled = Boolean(
      await this.isDelegateSmartAccountToEoa(chainId)
    );

    if (isAlreadyInstalled) {
      return {
        authorization: undefined,
        isAlreadyInstalled: true,
        eoaAddress,
        delegateAddress,
      };
    }

    const authorization = await walletClient.signAuthorization({
      account: owner,
      contractAddress: delegateAddress,
    });

    if (!delegateImmediately) {
      return {
        authorization,
        isAlreadyInstalled: false,
        eoaAddress,
        delegateAddress,
      };
    }

    try {
      const bundlerClient =
        await this.etherspotProvider.getBundlerClient(chainId);
      const userOpHash = await bundlerClient.sendUserOperation({
        account: bundlerClient.account,
        authorization,
        calls: [
          {
            to: eoaAddress,
            value: BigInt(0),
            data: '0x',
          },
        ],
      });

      return {
        authorization,
        isAlreadyInstalled: false,
        eoaAddress,
        delegateAddress,
        userOpHash,
      };
    } catch (error) {
      this.log('Failed to send delegation user operation', error);

      return {
        authorization,
        isAlreadyInstalled: false,
        eoaAddress,
        delegateAddress,
      };
    }
  }

  async signMessage(message: string | Hex, chainId = this.config.chainId) {
    retainCompatibleParameter(chainId);
    const owner = await this.etherspotProvider.getOwnerAccount();
    const messagePayload = message.startsWith('0x')
      ? { raw: message as Hex }
      : message;

    return owner.signMessage({ message: messagePayload });
  }

  transaction({ chainId, to, value = '0', data = '0x' }: TransactionParams) {
    this.selectedBatchName = undefined;
    this.workingTransaction = {
      chainId,
      to,
      value,
      data,
    };

    return this;
  }

  name({ transactionName }: { transactionName: string }) {
    if (!transactionName) {
      throw new Error('Transaction name is required');
    }

    this.selectedBatchName = undefined;

    if (!this.workingTransaction && this.namedTransactions[transactionName]) {
      this.selectedTransactionName = transactionName;
      this.workingTransaction = { ...this.namedTransactions[transactionName] };
      return this;
    }

    if (!this.workingTransaction) {
      throw new Error('No transaction available to name');
    }

    this.selectedTransactionName = transactionName;
    this.workingTransaction = {
      ...this.workingTransaction,
      transactionName,
    };
    this.namedTransactions[transactionName] = { ...this.workingTransaction };

    return this;
  }

  addToBatch({ batchName }: { batchName: string }) {
    if (!batchName) {
      throw new Error('Batch name is required');
    }

    if (!this.selectedTransactionName || !this.workingTransaction) {
      throw new Error('No selected transaction available to add to a batch');
    }

    const transaction = {
      ...this.workingTransaction,
      batchName,
    };
    this.workingTransaction = transaction;
    this.namedTransactions[this.selectedTransactionName] = transaction;

    const existingBatch = this.batches[batchName] || [];
    const existingIndex = existingBatch.findIndex(
      (tx) => tx.transactionName === this.selectedTransactionName
    );

    if (existingIndex >= 0) {
      this.batches[batchName] = existingBatch.map((tx, index) =>
        index === existingIndex ? transaction : tx
      );
    } else {
      this.batches[batchName] = [...existingBatch, transaction];
    }

    return this;
  }

  batch({ batchName }: { batchName: string }) {
    if (!this.batches[batchName]) {
      throw new Error(`Batch ${batchName} does not exist`);
    }

    this.selectedBatchName = batchName;
    this.selectedTransactionName = undefined;
    this.workingTransaction = undefined;
    return this;
  }

  remove() {
    if (this.selectedBatchName) {
      const transactions = this.batches[this.selectedBatchName] || [];
      transactions.forEach((tx) => {
        if (tx.transactionName) {
          delete this.namedTransactions[tx.transactionName];
        }
      });
      delete this.batches[this.selectedBatchName];
      this.clearWorkingState();
      return this;
    }

    if (this.selectedTransactionName) {
      const transaction = this.namedTransactions[this.selectedTransactionName];
      if (transaction?.batchName && this.batches[transaction.batchName]) {
        this.batches[transaction.batchName] = this.batches[
          transaction.batchName
        ].filter((tx) => tx.transactionName !== this.selectedTransactionName);

        if (!this.batches[transaction.batchName].length) {
          delete this.batches[transaction.batchName];
        }
      }

      delete this.namedTransactions[this.selectedTransactionName];
      this.clearWorkingState();
      return this;
    }

    throw new Error('No transaction or batch selected');
  }

  update() {
    if (!this.selectedTransactionName || !this.workingTransaction) {
      throw new Error('No selected transaction available to update');
    }

    this.namedTransactions[this.selectedTransactionName] = {
      ...this.workingTransaction,
      transactionName: this.selectedTransactionName,
    };

    return this;
  }

  async estimate(params: EstimateParams = {}) {
    const transaction = this.getSelectedTransaction();

    if (!transaction) {
      return {
        isEstimatedSuccessfully: false,
        errorMessage: 'No transaction selected for estimation',
        errorType: 'VALIDATION_ERROR' as const,
        ...this.resultMethods(),
      };
    }

    this.isEstimating = true;
    try {
      const { cost } = await this.estimateTransactions({
        chainId: transaction.chainId || this.config.chainId,
        transactions: [transaction],
        authorization: params.authorization,
      });

      return {
        ...toBaseResult(transaction),
        cost,
        isEstimatedSuccessfully: true,
        ...this.resultMethods(),
      };
    } catch (error) {
      this.containsEstimatingError = true;
      return {
        ...toBaseResult(transaction),
        isEstimatedSuccessfully: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: 'ESTIMATION_ERROR' as const,
        ...this.resultMethods(),
      };
    } finally {
      this.isEstimating = false;
    }
  }

  async send(params: SendParams = {}) {
    const transaction = this.getSelectedTransaction();

    if (!transaction) {
      return {
        isEstimatedSuccessfully: false,
        isSentSuccessfully: false,
        errorMessage: 'No transaction selected for sending',
        errorType: 'VALIDATION_ERROR' as const,
        ...this.resultMethods(),
      };
    }

    this.isSending = true;
    try {
      const chainId = transaction.chainId || this.config.chainId;
      const { cost, calls } = await this.estimateTransactions({
        chainId,
        transactions: [transaction],
        authorization: params.authorization,
      });
      const isDelegated = await this.isDelegateSmartAccountToEoa(chainId);
      const bundlerClient =
        await this.etherspotProvider.getBundlerClient(chainId);
      const shouldUseAuthorization = Boolean(
        params.authorization &&
          params.authorization.chainId === chainId &&
          !isDelegated
      );
      const userOpHash = await bundlerClient.sendUserOperation({
        account: bundlerClient.account,
        calls,
        ...(shouldUseAuthorization
          ? { authorization: params.authorization }
          : {}),
      });

      if (this.selectedTransactionName) {
        this.remove();
      }

      return {
        ...toBaseResult(transaction),
        cost,
        userOpHash,
        isEstimatedSuccessfully: true,
        isSentSuccessfully: true,
        ...this.resultMethods(),
      };
    } catch (error) {
      this.containsSendingError = true;
      return {
        ...toBaseResult(transaction),
        isEstimatedSuccessfully: false,
        isSentSuccessfully: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: 'SEND_ERROR' as const,
        ...this.resultMethods(),
      };
    } finally {
      this.isSending = false;
    }
  }

  async estimateBatches(
    params: BatchParams = {}
  ): Promise<BatchEstimateResult> {
    this.isEstimating = true;
    const batches: BatchEstimateResult['batches'] = {};

    try {
      const batchNames = this.getTargetBatchNames(params.onlyBatchNames);

      for (const batchName of batchNames) {
        const transactions = this.batches[batchName] || [];
        const chainGroups = groupTransactionsByChainId(transactions);
        const batchTransactions: TransactionEstimateResult[] = [];
        const batchChainGroups: NonNullable<
          BatchEstimateResult['batches'][string]['chainGroups']
        > = {};
        let batchTotalCost = BigInt(0);
        let batchSuccess = true;
        let batchErrorMessage: string | undefined;

        for (const [chainIdString, chainTransactions] of Object.entries(
          chainGroups
        )) {
          const chainId = Number(chainIdString);

          try {
            const { cost } = await this.estimateTransactions({
              chainId,
              transactions: chainTransactions,
              authorization: params.authorization,
            });
            const transactionResults = chainTransactions.map((transaction) => ({
              ...toBaseResult(transaction),
              cost,
              isEstimatedSuccessfully: true,
            }));

            batchTransactions.push(...transactionResults);
            batchChainGroups[chainId] = {
              transactions: transactionResults,
              totalCost: cost,
              isEstimatedSuccessfully: true,
            };
            batchTotalCost += cost;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const transactionResults = chainTransactions.map((transaction) => ({
              ...toBaseResult(transaction),
              errorMessage,
              errorType: 'ESTIMATION_ERROR' as const,
              isEstimatedSuccessfully: false,
            }));

            batchSuccess = false;
            batchErrorMessage = errorMessage;
            batchTransactions.push(...transactionResults);
            batchChainGroups[chainId] = {
              transactions: transactionResults,
              errorMessage,
              isEstimatedSuccessfully: false,
            };
          }
        }

        batches[batchName] = {
          transactions: batchTransactions,
          chainGroups: batchChainGroups,
          totalCost: batchTotalCost,
          errorMessage: batchErrorMessage,
          isEstimatedSuccessfully: batchSuccess,
        };
      }

      return {
        batches,
        isEstimatedSuccessfully: Object.values(batches).every(
          (batch) => batch.isEstimatedSuccessfully
        ),
      };
    } finally {
      this.isEstimating = false;
    }
  }

  async sendBatches(params: BatchParams = {}): Promise<BatchSendResult> {
    this.isSending = true;
    const batches: BatchSendResult['batches'] = {};

    try {
      const batchNames = this.getTargetBatchNames(params.onlyBatchNames);

      for (const batchName of batchNames) {
        const transactions = this.batches[batchName] || [];
        const chainGroups = groupTransactionsByChainId(transactions);
        const batchTransactions: TransactionSendResult[] = [];
        const batchChainGroups: NonNullable<
          BatchSendResult['batches'][string]['chainGroups']
        > = {};
        let batchTotalCost = BigInt(0);
        let batchEstimated = true;
        let batchSent = true;
        let batchErrorMessage: string | undefined;

        for (const [chainIdString, chainTransactions] of Object.entries(
          chainGroups
        )) {
          const chainId = Number(chainIdString);

          try {
            const { cost, calls } = await this.estimateTransactions({
              chainId,
              transactions: chainTransactions,
              authorization: params.authorization,
            });
            const isDelegated = await this.isDelegateSmartAccountToEoa(chainId);
            const shouldUseAuthorization = Boolean(
              params.authorization &&
                params.authorization.chainId === chainId &&
                !isDelegated
            );
            const bundlerClient =
              await this.etherspotProvider.getBundlerClient(chainId);
            const userOpHash = await bundlerClient.sendUserOperation({
              account: bundlerClient.account,
              calls,
              ...(shouldUseAuthorization
                ? { authorization: params.authorization }
                : {}),
            });
            const transactionResults = chainTransactions.map((transaction) => ({
              ...toBaseResult(transaction),
              cost,
              userOpHash,
              isEstimatedSuccessfully: true,
              isSentSuccessfully: true,
            }));

            batchTransactions.push(...transactionResults);
            batchChainGroups[chainId] = {
              transactions: transactionResults,
              userOpHash,
              totalCost: cost,
              isEstimatedSuccessfully: true,
              isSentSuccessfully: true,
            };
            batchTotalCost += cost;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const transactionResults = chainTransactions.map((transaction) => ({
              ...toBaseResult(transaction),
              errorMessage,
              errorType: 'SEND_ERROR' as const,
              isEstimatedSuccessfully: false,
              isSentSuccessfully: false,
            }));

            batchEstimated = false;
            batchSent = false;
            batchErrorMessage = errorMessage;
            batchTransactions.push(...transactionResults);
            batchChainGroups[chainId] = {
              transactions: transactionResults,
              errorMessage,
              isEstimatedSuccessfully: false,
              isSentSuccessfully: false,
            };
          }
        }

        batches[batchName] = {
          transactions: batchTransactions,
          chainGroups: batchChainGroups,
          totalCost: batchTotalCost,
          errorMessage: batchErrorMessage,
          isEstimatedSuccessfully: batchEstimated,
          isSentSuccessfully: batchSent,
        };

        if (batchSent) {
          this.batch({ batchName }).remove();
        }
      }

      return {
        batches,
        isEstimatedSuccessfully: Object.values(batches).every(
          (batch) => batch.isEstimatedSuccessfully
        ),
        isSentSuccessfully: Object.values(batches).every(
          (batch) => batch.isSentSuccessfully
        ),
      };
    } finally {
      this.isSending = false;
    }
  }

  getState(): TransactionKitState {
    return {
      selectedTransactionName: this.selectedTransactionName,
      selectedBatchName: this.selectedBatchName,
      workingTransaction: this.workingTransaction
        ? { ...this.workingTransaction }
        : undefined,
      namedTransactions: { ...this.namedTransactions },
      batches: Object.fromEntries(
        Object.entries(this.batches).map(([batchName, transactions]) => [
          batchName,
          transactions.map((transaction) => ({ ...transaction })),
        ])
      ),
      isEstimating: this.isEstimating,
      isSending: this.isSending,
      containsSendingError: this.containsSendingError,
      containsEstimatingError: this.containsEstimatingError,
      walletAddresses: { ...this.walletAddresses },
    };
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }

  getProvider() {
    return this.etherspotProvider.getProvider();
  }

  getEtherspotProvider() {
    return this.etherspotProvider;
  }

  getSdk(chainId?: number) {
    return this.etherspotProvider.getSdk(chainId);
  }

  async getTransactionHash(
    userOpHash: string,
    txChainId: number,
    timeout = 60000,
    retryInterval = 2000
  ): Promise<string | null> {
    const bundlerClient =
      await this.etherspotProvider.getBundlerClient(txChainId);
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        const receipt = await bundlerClient.getUserOperationReceipt({
          hash: userOpHash as Hex,
        });

        if (receipt?.receipt?.transactionHash) {
          return receipt.receipt.transactionHash;
        }
      } catch {
        // Keep polling until the timeout expires.
      }

      await new Promise((resolve) => {
        setTimeout(resolve, retryInterval);
      });
    }

    return null;
  }

  reset() {
    this.batches = {};
    this.namedTransactions = {};
    this.walletAddresses = {};
    this.containsSendingError = false;
    this.containsEstimatingError = false;
    this.clearWorkingState();
  }
}

export const TransactionKit = (config: EtherspotTransactionKitConfig) =>
  new EtherspotTransactionKit(config);
