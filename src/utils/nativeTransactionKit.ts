/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
import {
  checksumAddress,
  createPublicClient,
  createWalletClient,
  custom,
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
import {
  createPaymasterClient,
  formatUserOperationGas,
  formatUserOperationRequest,
  type EstimateUserOperationGasReturnType,
  type RpcEstimateUserOperationGasReturnType,
  type SmartAccount,
  type UserOperation,
} from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';
import type { SignAuthorizationReturnType } from 'viem/accounts';

import type { WalletProviderLike } from '../types/walletProvider';
import { getSupportedChainById } from './blockchain';
import { getEtherspotBundlerUrl } from './bundler';
import { getCustomChainById } from './customChains';
import {
  encodePillarValidatorInstallData,
  encodePillarExecuteCall,
  createPillarSmartAccountClient,
  PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
  PILLAR_MODULE_TYPE,
  PILLAR_MULTIPLE_OWNER_ECDSA_VALIDATOR_ADDRESS,
  type PillarCall,
  type PillarSmartAccount,
} from './pillarSmartAccountClient';
import { transactionDebugError, transactionDebugLog } from './transactionDebug';

export type WalletMode = 'delegatedEoa';

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
  authorization?: SignAuthorizationReturnType;
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

export interface EoaTransactionEstimateResult
  extends TransactionEstimateResult {
  gas?: bigint;
  feePerGas?: bigint;
}

export interface EoaTransactionSendResult extends TransactionSendResult {
  transactionHash?: Hex;
}

export interface EoaTransactionReceiptResult {
  chainId: number;
  transactionHash: Hex;
  status?: 'success' | 'reverted';
  blockHash?: Hex;
  blockNumber?: bigint;
  errorMessage?: string;
  errorType?: 'CONFIRMATION_ERROR';
  isConfirmed: boolean;
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

type PaymasterDetails = {
  url?: string;
  context?: unknown;
};

type EstimateParams = {
  authorization?: SignAuthorizationReturnType;
  paymasterDetails?: PaymasterDetails;
};

type SendParams = {
  authorization?: SignAuthorizationReturnType;
  paymasterDetails?: PaymasterDetails;
};

type BatchParams = {
  onlyBatchNames?: string[];
  authorization?: SignAuthorizationReturnType;
  paymasterDetails?: PaymasterDetails;
};

type BundlerClient = Awaited<ReturnType<typeof createPillarSmartAccountClient>>;

type EstimateTransactionsResult = {
  cost: bigint;
  calls: PillarCall[];
  fees: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
  gas: EstimateUserOperationGasReturnType;
  isDelegated: boolean | undefined;
  preparedUserOperation: Partial<UserOperation>;
  shouldUseAuthorization: boolean;
};

type EoaDelegationStatus = {
  code?: Hex;
  delegateAddress?: Address;
  isDelegated: boolean | undefined;
  walletAddress?: string;
};

type AuthorizationExecutor = 'self' | Address;

type PreparedDelegatedEoaTransaction = {
  account: Address;
  outerData: Hex;
  outerTo: Address;
  outerValue: bigint;
};

type UserOperationFeeEstimate = {
  feePerGas: bigint;
  fees: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
};

const retainCompatibleParameter = (...values: unknown[]) => values.length;

const redactBundlerUrl = (url: string) =>
  url.replace(/([?&]api-key=)[^&]+/i, '$1<redacted>');

const isPaymasterDetailsEnabled = (paymasterDetails?: PaymasterDetails) =>
  Boolean(paymasterDetails && paymasterDetails.url !== '');

const summarizeAuthorization = (authorization?: SignAuthorizationReturnType) =>
  authorization
    ? {
        chainId: authorization.chainId,
        address: authorization.address,
        nonce: authorization.nonce?.toString(),
        hasSignature: Boolean(authorization.r && authorization.s),
      }
    : undefined;

const summarizeTransaction = (transaction: TransactionBuilder) => ({
  chainId: transaction.chainId,
  to: transaction.to,
  value: transaction.value?.toString(),
  dataLength: transaction.data?.length ?? 0,
  dataPrefix: transaction.data?.slice(0, 18),
  transactionName: transaction.transactionName,
  batchName: transaction.batchName,
});

const getEstimateAuthorizationCachePayload = (
  authorization?: SignAuthorizationReturnType
) =>
  authorization
    ? {
        chainId: authorization.chainId,
        address: authorization.address.toLowerCase(),
        nonce: authorization.nonce?.toString(),
        yParity: authorization.yParity,
        r: authorization.r,
        s: authorization.s,
      }
    : undefined;

const getEstimatePaymasterCachePayload = (
  paymasterDetails?: PaymasterDetails
) =>
  paymasterDetails
    ? {
        enabled: paymasterDetails.url !== '',
        url: paymasterDetails.url || '<bundler-url>',
        context: paymasterDetails.context ?? null,
      }
    : undefined;

const getEstimateTransactionCachePayload = (
  transaction: TransactionBuilder
) => ({
  chainId: transaction.chainId,
  to: transaction.to?.toLowerCase(),
  value: transaction.value?.toString() ?? '0',
  data: transaction.data ?? '0x',
});

const getEstimateTransactionsCacheKey = ({
  chainId,
  transactions,
  authorization,
  paymasterDetails,
}: {
  chainId: number;
  transactions: TransactionBuilder[];
  authorization?: SignAuthorizationReturnType;
  paymasterDetails?: PaymasterDetails;
}) =>
  JSON.stringify({
    chainId,
    transactions: transactions.map(getEstimateTransactionCachePayload),
    authorization: getEstimateAuthorizationCachePayload(authorization),
    paymasterDetails: getEstimatePaymasterCachePayload(paymasterDetails),
  });

const summarizeError = (error: unknown) => ({
  name: error instanceof Error ? error.name : undefined,
  message: error instanceof Error ? error.message : String(error),
  cause:
    error instanceof Error && 'cause' in error
      ? (error as Error & { cause?: unknown }).cause
      : undefined,
});

const getChainById = (chainId: number): Chain => {
  const chain = getSupportedChainById(chainId);

  if (!chain) {
    throw new Error(`Unsupported chain ID ${chainId}`);
  }

  return chain;
};

const getDirectTransport = (chainId: number) => {
  const customRpcUrl = getCustomChainById(chainId)?.rpcUrl;
  return customRpcUrl ? http(customRpcUrl) : http();
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

const toDelegatedEoaExecutionTransaction = ({
  account,
  data,
  to,
  value,
}: {
  account: Address;
  to: string;
  value?: bigint | string;
  data?: string;
}): PreparedDelegatedEoaTransaction => {
  if (!to || !isAddress(to)) {
    throw new Error('Transaction is missing a valid recipient address');
  }

  const innerCall = {
    to: checksumAddress(to as Address),
    value: parseTransactionValue(value),
    data: toHexData(data),
  };

  return {
    account: checksumAddress(account),
    outerTo: checksumAddress(account),
    outerValue: BigInt(0),
    outerData: encodePillarExecuteCall(innerCall),
  };
};

const toPlainEoaExecutionTransaction = ({
  account,
  data,
  to,
  value,
}: {
  account: Address;
  to: string;
  value?: bigint | string;
  data?: string;
}): PreparedDelegatedEoaTransaction => {
  if (!to || !isAddress(to)) {
    throw new Error('Transaction is missing a valid recipient address');
  }

  return {
    account: checksumAddress(account),
    outerTo: checksumAddress(to as Address),
    outerValue: parseTransactionValue(value),
    outerData: toHexData(data),
  };
};

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

const getPreparedUserOperationGas = (
  preparedUserOperation: Partial<UserOperation>
): EstimateUserOperationGasReturnType => {
  const {
    callGasLimit,
    preVerificationGas,
    verificationGasLimit,
    paymasterPostOpGasLimit,
    paymasterVerificationGasLimit,
  } = preparedUserOperation;

  if (
    typeof callGasLimit === 'undefined' ||
    typeof preVerificationGas === 'undefined' ||
    typeof verificationGasLimit === 'undefined'
  ) {
    throw new Error('Paymaster user operation is missing gas fields.');
  }

  return {
    callGasLimit,
    preVerificationGas,
    verificationGasLimit,
    ...(typeof paymasterPostOpGasLimit !== 'undefined'
      ? { paymasterPostOpGasLimit }
      : {}),
    ...(typeof paymasterVerificationGasLimit !== 'undefined'
      ? { paymasterVerificationGasLimit }
      : {}),
  };
};

const getPreparedUserOperationFeeEstimate = (
  preparedUserOperation: Partial<UserOperation>
): UserOperationFeeEstimate => {
  const { maxFeePerGas, maxPriorityFeePerGas } = preparedUserOperation;

  if (
    typeof maxFeePerGas === 'undefined' ||
    typeof maxPriorityFeePerGas === 'undefined'
  ) {
    throw new Error('Paymaster user operation is missing fee fields.');
  }

  return {
    feePerGas: maxFeePerGas,
    fees: {
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
  };
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
    return this.config.walletMode || 'delegatedEoa';
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
    const customChain = getCustomChainById(chainId);
    const configuredBundlerUrl =
      this.config.bundlerUrl || customChain?.bundlerUrl;
    const bundlerUrl = getEtherspotBundlerUrl({
      chainId,
      apiKey: this.config.bundlerApiKey,
      bundlerUrl: configuredBundlerUrl,
      apiKeyFormat: this.config.bundlerApiKeyFormat,
    });

    transactionDebugLog('[TransactionKit] resolved bundler URL', {
      chainId,
      bundlerUrl: redactBundlerUrl(bundlerUrl),
      hasConfiguredBundlerUrl: Boolean(configuredBundlerUrl),
      isCustomChain: Boolean(customChain),
      hasBundlerApiKey: Boolean(this.config.bundlerApiKey),
    });

    return bundlerUrl;
  }

  async getOwnerAccount(): Promise<LocalAccount> {
    if (this.config.viemLocalAccount) {
      transactionDebugLog('[TransactionKit] using viem local account owner', {
        address: this.config.viemLocalAccount.address,
      });
      return this.config.viemLocalAccount;
    }

    if (this.config.privateKey) {
      const account = privateKeyToAccount(this.config.privateKey as Hex);
      transactionDebugLog('[TransactionKit] using private key owner', {
        address: account.address,
      });
      return account;
    }

    const account = await createProviderBackedAccount(this.config.provider);
    transactionDebugLog('[TransactionKit] using provider-backed owner', {
      address: account.address,
    });
    return account;
  }

  async getPublicClient(chainId = this.config.chainId): Promise<PublicClient> {
    if (!this.publicClientPerChain[chainId]) {
      transactionDebugLog('[TransactionKit] creating public client', {
        chainId,
      });
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
      transactionDebugLog('[TransactionKit] creating wallet client', {
        chainId,
      });
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

  async getDirectPublicClient(
    chainId = this.config.chainId
  ): Promise<PublicClient> {
    transactionDebugLog('[TransactionKit] creating direct public client', {
      chainId,
    });

    return createPublicClient({
      chain: getChainById(chainId),
      transport: getDirectTransport(chainId),
    });
  }

  async getDirectWalletClient(
    chainId = this.config.chainId
  ): Promise<WalletClient> {
    const chain = getChainById(chainId);

    if (this.config.viemLocalAccount || this.config.privateKey) {
      const owner = await this.getOwnerAccount();
      transactionDebugLog(
        '[TransactionKit] creating direct local wallet client',
        {
          chainId,
          address: owner.address,
        }
      );

      return createWalletClient({
        account: owner,
        chain,
        transport: getDirectTransport(chainId),
      });
    }

    const provider = this.config.provider as WalletClient | undefined;
    if (provider && 'sendTransaction' in provider && 'transport' in provider) {
      const account = await getProviderAccountAddress(provider);
      transactionDebugLog(
        '[TransactionKit] creating direct provider wallet client',
        {
          chainId,
          address: account,
        }
      );

      return createWalletClient({
        account,
        chain,
        transport: provider.transport,
      });
    }

    if (
      this.config.provider &&
      'request' in this.config.provider &&
      typeof this.config.provider.request === 'function'
    ) {
      const account = await getProviderAccountAddress(this.config.provider);
      transactionDebugLog(
        '[TransactionKit] creating direct EIP-1193 wallet client',
        {
          chainId,
          address: account,
        }
      );

      return createWalletClient({
        account,
        chain,
        transport: custom(this.config.provider),
      });
    }

    throw new Error('No direct EOA wallet provider configured');
  }

  async getDelegatedEoaAccount(
    chainId = this.config.chainId
  ): Promise<SmartAccount> {
    if (!this.accountPerChain[chainId]) {
      transactionDebugLog('[TransactionKit] creating delegated EOA account', {
        chainId,
      });
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
      transactionDebugLog('[TransactionKit] creating bundler client', {
        chainId,
      });
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

  private estimateTransactionsCache = new Map<
    string,
    EstimateTransactionsResult
  >();

  private eoaDelegationStatusCache: Record<
    number,
    Promise<EoaDelegationStatus>
  > = {};

  constructor(private readonly config: EtherspotTransactionKitConfig) {
    this.etherspotProvider = new PillarTransactionProvider(config);
    this.debugMode = Boolean(config.debugMode);
  }

  private log(message: string, data?: unknown) {
    if (this.debugMode) {
      console.log(`[PillarTransactionKit] ${message}`, data);
      return;
    }

    transactionDebugLog(`[PillarTransactionKit] ${message}`, data);
  }

  private clearWorkingState() {
    this.selectedTransactionName = undefined;
    this.selectedBatchName = undefined;
    this.workingTransaction = undefined;
  }

  private clearEstimateTransactionsCache() {
    this.estimateTransactionsCache.clear();
  }

  private clearEoaDelegationStatusCache(chainId?: number) {
    if (typeof chainId === 'number') {
      delete this.eoaDelegationStatusCache[chainId];
      return;
    }

    this.eoaDelegationStatusCache = {};
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

  private async getUserOperationFeeEstimate(
    chainId: number
  ): Promise<UserOperationFeeEstimate> {
    const publicClient = await this.etherspotProvider.getPublicClient(chainId);

    try {
      const fees = await publicClient.estimateFeesPerGas();
      const maxFeePerGas = fees.maxFeePerGas || fees.gasPrice || BigInt(0);
      const maxPriorityFeePerGas =
        fees.maxPriorityFeePerGas || fees.gasPrice || BigInt(0);
      transactionDebugLog('[TransactionKit] fee estimate resolved', {
        chainId,
        maxFeePerGas: fees.maxFeePerGas?.toString(),
        gasPrice: fees.gasPrice?.toString(),
        feePerGas: maxFeePerGas.toString(),
      });
      return {
        feePerGas: maxFeePerGas,
        fees: {
          // Match viem's sendUserOperation fee buffer without paying for
          // viem's second prepare/fee-estimation pass.
          maxFeePerGas: maxFeePerGas * BigInt(2),
          maxPriorityFeePerGas: maxPriorityFeePerGas * BigInt(2),
        },
      };
    } catch (error) {
      transactionDebugError('[TransactionKit] estimateFeesPerGas failed', {
        chainId,
        error: summarizeError(error),
      });
      const gasPrice = await publicClient.getGasPrice();
      transactionDebugLog('[TransactionKit] gas price fallback resolved', {
        chainId,
        gasPrice: gasPrice.toString(),
      });
      return {
        feePerGas: gasPrice,
        fees: {
          maxFeePerGas: gasPrice,
          maxPriorityFeePerGas: gasPrice,
        },
      };
    }
  }

  private async getCost({
    chainId,
    feeEstimate,
    gas,
  }: {
    chainId: number;
    feeEstimate: UserOperationFeeEstimate;
    gas: EstimateUserOperationGasReturnType;
  }): Promise<{
    cost: bigint;
    fees: {
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    };
  }> {
    const totalGas = sumUserOperationGas(gas);
    const cost = totalGas * feeEstimate.feePerGas;
    transactionDebugLog('[TransactionKit] calculating estimated cost', {
      chainId,
      gas,
      totalGas: totalGas.toString(),
      feePerGas: feeEstimate.feePerGas.toString(),
      cost: cost.toString(),
    });

    return {
      cost,
      fees: feeEstimate.fees,
    };
  }

  private createPaymasterClientForChain({
    chainId,
    paymasterDetails,
  }: {
    chainId: number;
    paymasterDetails?: PaymasterDetails;
  }) {
    if (!isPaymasterDetailsEnabled(paymasterDetails)) {
      return undefined;
    }

    const paymasterUrl =
      paymasterDetails?.url?.trim() ||
      this.etherspotProvider.getBundlerUrl(chainId);

    transactionDebugLog('[TransactionKit] creating paymaster client', {
      chainId,
      paymasterUrl: redactBundlerUrl(paymasterUrl),
      usesBundlerUrl: !paymasterDetails?.url,
      hasContext: Boolean(paymasterDetails?.context),
    });

    return createPaymasterClient({
      transport: http(paymasterUrl),
    });
  }

  private async isPillarModuleInstalled({
    account,
    chainId,
    moduleType,
    module,
    name,
  }: {
    account: PillarSmartAccount;
    chainId: number;
    moduleType: bigint;
    module: Address;
    name: string;
  }): Promise<boolean> {
    try {
      const installed = await account.isModuleInstalled({
        moduleType,
        module,
        additionalContext: '0x',
      });
      transactionDebugLog('[TransactionKit] module install probe completed', {
        chainId,
        account: account.address,
        name,
        module,
        moduleType: moduleType.toString(),
        installed,
      });
      return installed;
    } catch (error) {
      transactionDebugError('[TransactionKit] module install probe failed', {
        chainId,
        account: account.address,
        name,
        module,
        moduleType: moduleType.toString(),
        error: summarizeError(error),
      });
      return false;
    }
  }

  private async getPillarModuleInstallCallsIfNeeded({
    account,
    chainId,
  }: {
    account: PillarSmartAccount;
    chainId: number;
  }): Promise<PillarCall[]> {
    const isValidatorInstalled = await this.isPillarModuleInstalled({
      account,
      chainId,
      name: 'MultipleOwnerECDSA validator',
      moduleType: PILLAR_MODULE_TYPE.VALIDATOR,
      module: PILLAR_MULTIPLE_OWNER_ECDSA_VALIDATOR_ADDRESS,
    });

    const installCalls: PillarCall[] = [];

    if (!isValidatorInstalled) {
      installCalls.push({
        to: account.address,
        data: account.encodeInstallModule({
          moduleType: PILLAR_MODULE_TYPE.VALIDATOR,
          module: PILLAR_MULTIPLE_OWNER_ECDSA_VALIDATOR_ADDRESS,
          initData: encodePillarValidatorInstallData({
            validatorData: account.address,
          }),
        }),
      });
    }

    transactionDebugLog('[TransactionKit] module install calls resolved', {
      chainId,
      account: account.address,
      isValidatorInstalled,
      installCalls: installCalls.map((call) => ({
        to: call.to,
        dataLength: call.data?.length ?? 0,
        dataPrefix: call.data?.slice(0, 18),
      })),
    });

    return installCalls;
  }

  private async estimateTransactions({
    chainId,
    transactions,
    authorization,
    paymasterDetails,
  }: {
    chainId: number;
    transactions: TransactionBuilder[];
    authorization?: SignAuthorizationReturnType;
    paymasterDetails?: PaymasterDetails;
  }): Promise<EstimateTransactionsResult> {
    const cacheKey = getEstimateTransactionsCacheKey({
      chainId,
      transactions,
      authorization,
      paymasterDetails,
    });
    const cachedEstimate = this.estimateTransactionsCache.get(cacheKey);

    if (cachedEstimate) {
      transactionDebugLog('[TransactionKit] estimateTransactions cache hit', {
        chainId,
        transactions: transactions.map(summarizeTransaction),
        cost: cachedEstimate.cost.toString(),
        shouldUseAuthorization: cachedEstimate.shouldUseAuthorization,
      });
      return cachedEstimate;
    }

    transactionDebugLog('[TransactionKit] estimateTransactions started', {
      chainId,
      walletMode: this.etherspotProvider.getWalletMode(),
      transactions: transactions.map(summarizeTransaction),
      authorization: summarizeAuthorization(authorization),
      hasPaymasterDetails: isPaymasterDetailsEnabled(paymasterDetails),
      paymasterContext: paymasterDetails?.context,
    });

    const authorizationError = this.validateAuthorization(
      authorization,
      chainId
    );
    if (authorizationError) {
      transactionDebugError(
        '[TransactionKit] authorization validation failed',
        {
          chainId,
          authorization: summarizeAuthorization(authorization),
          authorizationError,
        }
      );
      throw new Error(authorizationError);
    }

    const isDelegated = await this.isDelegateSmartAccountToEoa(chainId);
    transactionDebugLog('[TransactionKit] EOA delegation status resolved', {
      chainId,
      isDelegated,
      hasAuthorization: Boolean(authorization),
    });

    if (!isDelegated && !authorization) {
      transactionDebugError('[TransactionKit] missing EIP-7702 authorization', {
        chainId,
        isDelegated,
      });
      throw new Error(
        'EOA is not designated for EIP-7702. Please authorize first or provide authorization.'
      );
    }

    const bundlerClient =
      await this.etherspotProvider.getBundlerClient(chainId);
    if (!bundlerClient.account) {
      throw new Error('No smart account configured for user operation');
    }

    const moduleInstallCalls = await this.getPillarModuleInstallCallsIfNeeded({
      account: bundlerClient.account as PillarSmartAccount,
      chainId,
    });
    const calls = [...moduleInstallCalls, ...transactions.map(toCall)];
    const paymasterClient = this.createPaymasterClientForChain({
      chainId,
      paymasterDetails,
    });
    const shouldUseAuthorization = Boolean(
      authorization && authorization.chainId === chainId && !isDelegated
    );
    transactionDebugLog('[TransactionKit] estimating user operation gas', {
      chainId,
      sender: bundlerClient.account?.address,
      calls,
      moduleInstallCallCount: moduleInstallCalls.length,
      hasPaymasterClient: Boolean(paymasterClient),
      paymasterContext: paymasterDetails?.context,
      shouldUseAuthorization,
      authorization: shouldUseAuthorization
        ? summarizeAuthorization(authorization)
        : undefined,
    });

    let gas: EstimateUserOperationGasReturnType;
    let feeEstimate: UserOperationFeeEstimate;
    let preparedUserOperation: Partial<UserOperation>;
    try {
      const prepareRequest = {
        account: bundlerClient.account,
        calls,
        ...(shouldUseAuthorization ? { authorization } : {}),
      };

      if (paymasterClient) {
        preparedUserOperation = await bundlerClient.prepareUserOperation({
          ...prepareRequest,
          paymaster: paymasterClient,
          paymasterContext: paymasterDetails?.context,
          parameters: [
            'authorization',
            'factory',
            'fees',
            'gas',
            'nonce',
            'paymaster',
            'signature',
          ],
        });
      } else {
        preparedUserOperation = await bundlerClient.prepareUserOperation({
          ...prepareRequest,
          parameters: [
            'authorization',
            'factory',
            'nonce',
            'paymaster',
            'signature',
          ],
        });
      }

      transactionDebugLog('[TransactionKit] user operation prepared', {
        chainId,
        sender: preparedUserOperation.sender,
        nonce: preparedUserOperation.nonce?.toString(),
        callDataLength: preparedUserOperation.callData?.length,
        hasPaymaster: Boolean(
          preparedUserOperation.paymaster ||
            preparedUserOperation.paymasterAndData
        ),
        hasAuthorization: Boolean(preparedUserOperation.authorization),
      });

      if (paymasterClient) {
        gas = getPreparedUserOperationGas(preparedUserOperation);
        feeEstimate = getPreparedUserOperationFeeEstimate(
          preparedUserOperation
        );
      } else {
        const [rpcGas, resolvedFeeEstimate] = await Promise.all([
          bundlerClient.request({
            method: 'eth_estimateUserOperationGas',
            params: [
              formatUserOperationRequest(preparedUserOperation),
              bundlerClient.account.entryPoint.address,
            ],
          }),
          this.getUserOperationFeeEstimate(chainId),
        ]);
        feeEstimate = resolvedFeeEstimate;
        gas = formatUserOperationGas(
          rpcGas as RpcEstimateUserOperationGasReturnType
        );
      }

      transactionDebugLog('[TransactionKit] user operation gas estimated', {
        chainId,
        gas,
        usedPaymasterPrepare: Boolean(paymasterClient),
      });
    } catch (error) {
      transactionDebugError(
        '[TransactionKit] estimateUserOperationGas failed',
        {
          chainId,
          sender: bundlerClient.account?.address,
          calls,
          shouldUseAuthorization,
          authorization: shouldUseAuthorization
            ? summarizeAuthorization(authorization)
            : undefined,
          error: summarizeError(error),
        }
      );
      throw error;
    }

    const { cost, fees } = await this.getCost({
      chainId,
      feeEstimate,
      gas,
    });
    transactionDebugLog('[TransactionKit] estimateTransactions completed', {
      chainId,
      cost: cost.toString(),
      maxFeePerGas: fees.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
    });

    const estimateResult = {
      cost,
      calls,
      fees,
      gas,
      isDelegated,
      preparedUserOperation,
      shouldUseAuthorization,
    };
    this.estimateTransactionsCache.set(cacheKey, estimateResult);

    return estimateResult;
  }

  private async sendPreparedUserOperation({
    bundlerClient,
    estimate,
  }: {
    bundlerClient: BundlerClient;
    estimate: EstimateTransactionsResult;
  }) {
    if (!bundlerClient.account) {
      throw new Error('No smart account configured for user operation');
    }

    if (!bundlerClient.account.signUserOperation) {
      throw new Error('Smart account cannot sign user operations');
    }

    const userOperation = {
      ...estimate.preparedUserOperation,
      ...estimate.fees,
      callGasLimit: estimate.gas.callGasLimit,
      preVerificationGas: estimate.gas.preVerificationGas,
      verificationGasLimit: estimate.gas.verificationGasLimit,
      ...(typeof estimate.gas.paymasterPostOpGasLimit !== 'undefined'
        ? {
            paymasterPostOpGasLimit: estimate.gas.paymasterPostOpGasLimit,
          }
        : {}),
      ...(typeof estimate.gas.paymasterVerificationGasLimit !== 'undefined'
        ? {
            paymasterVerificationGasLimit:
              estimate.gas.paymasterVerificationGasLimit,
          }
        : {}),
    } as UserOperation;

    const signature =
      await bundlerClient.account.signUserOperation(userOperation);
    const signedUserOperation = {
      ...userOperation,
      signature,
    };

    transactionDebugLog('[TransactionKit] sending prepared user operation', {
      sender: signedUserOperation.sender,
      nonce: signedUserOperation.nonce?.toString(),
      callGasLimit: signedUserOperation.callGasLimit?.toString(),
      verificationGasLimit:
        signedUserOperation.verificationGasLimit?.toString(),
      preVerificationGas: signedUserOperation.preVerificationGas?.toString(),
      maxFeePerGas: signedUserOperation.maxFeePerGas?.toString(),
      maxPriorityFeePerGas:
        signedUserOperation.maxPriorityFeePerGas?.toString(),
      hasAuthorization: Boolean(signedUserOperation.authorization),
      hasSignature: Boolean(signedUserOperation.signature),
    });

    return bundlerClient.request(
      {
        method: 'eth_sendUserOperation',
        params: [
          formatUserOperationRequest(signedUserOperation),
          bundlerClient.account.entryPoint.address,
        ],
      },
      { retryCount: 0 }
    );
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

  async getDelegateSmartAccountToEoaStatus(
    chainId = this.config.chainId
  ): Promise<EoaDelegationStatus> {
    if (await this.eoaDelegationStatusCache[chainId]) {
      transactionDebugLog('[TransactionKit] EOA delegation cache hit', {
        chainId,
      });
      return this.eoaDelegationStatusCache[chainId];
    }

    this.eoaDelegationStatusCache[chainId] =
      this.fetchEoaDelegationStatus(chainId);

    return this.eoaDelegationStatusCache[chainId];
  }

  private async fetchEoaDelegationStatus(
    chainId = this.config.chainId
  ): Promise<EoaDelegationStatus> {
    transactionDebugLog('[TransactionKit] checking EOA delegation code', {
      chainId,
    });
    const publicClient =
      await this.etherspotProvider.getDirectPublicClient(chainId);
    const walletAddress = await this.getWalletAddress(chainId);

    if (!walletAddress) {
      transactionDebugError('[TransactionKit] wallet address unavailable', {
        chainId,
      });
      return {
        isDelegated: undefined,
      };
    }

    const code = await publicClient.getCode({
      address: walletAddress as Address,
    });
    const isDelegated = Boolean(
      code && code !== '0x' && code.startsWith('0xef0100')
    );
    const match = code?.match(/^0xef0100(.{40})$/);
    const delegateAddress = match
      ? getAddress(`0x${match[1]}` as Address)
      : undefined;
    transactionDebugLog('[TransactionKit] EOA delegation code result', {
      chainId,
      walletAddress,
      code,
      isDelegated,
      delegateAddress,
    });

    return {
      code,
      delegateAddress,
      isDelegated,
      walletAddress,
    };
  }

  async isDelegateSmartAccountToEoa(chainId = this.config.chainId) {
    const status = await this.getDelegateSmartAccountToEoaStatus(chainId);
    return status.isDelegated;
  }

  async delegateSmartAccountToEoa({
    chainId = this.config.chainId,
    delegateImmediately = false,
    authorizationExecutor,
  }: {
    chainId?: number;
    delegateImmediately?: boolean;
    authorizationExecutor?: AuthorizationExecutor;
  } = {}) {
    transactionDebugLog('[TransactionKit] delegateSmartAccountToEoa started', {
      chainId,
      delegateImmediately,
      delegateAddress: PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS,
      authorizationExecutor,
    });
    const owner = await this.etherspotProvider.getOwnerAccount();
    const walletClient =
      await this.etherspotProvider.getDirectWalletClient(chainId);
    const eoaAddress = owner.address;
    const delegateAddress = PILLAR_KERNEL_7702_IMPLEMENTATION_ADDRESS;
    const isAlreadyInstalled = Boolean(
      await this.isDelegateSmartAccountToEoa(chainId)
    );
    transactionDebugLog('[TransactionKit] delegation preflight result', {
      chainId,
      eoaAddress,
      delegateAddress,
      isAlreadyInstalled,
    });

    if (isAlreadyInstalled) {
      transactionDebugLog('[TransactionKit] delegation already installed', {
        chainId,
        eoaAddress,
        delegateAddress,
      });
      return {
        authorization: undefined,
        isAlreadyInstalled: true,
        eoaAddress,
        delegateAddress,
      };
    }

    let authorization: SignAuthorizationReturnType;
    try {
      transactionDebugLog('[TransactionKit] signing EIP-7702 authorization', {
        chainId,
        eoaAddress,
        delegateAddress,
      });
      authorization = await walletClient.signAuthorization({
        account: owner,
        contractAddress: delegateAddress,
        ...(authorizationExecutor ? { executor: authorizationExecutor } : {}),
      });
      transactionDebugLog('[TransactionKit] EIP-7702 authorization signed', {
        chainId,
        eoaAddress,
        delegateAddress,
        authorizationExecutor,
        authorization: summarizeAuthorization(authorization),
      });
    } catch (error) {
      transactionDebugError('[TransactionKit] signAuthorization failed', {
        chainId,
        eoaAddress,
        delegateAddress,
        error: summarizeError(error),
      });
      throw error;
    }

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
      transactionDebugLog(
        '[TransactionKit] sending immediate delegation user operation',
        {
          chainId,
          sender: bundlerClient.account?.address,
          eoaAddress,
          authorization: summarizeAuthorization(authorization),
        }
      );
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
      transactionDebugLog('[TransactionKit] delegation user operation sent', {
        chainId,
        userOpHash,
      });

      return {
        authorization,
        isAlreadyInstalled: false,
        eoaAddress,
        delegateAddress,
        userOpHash,
      };
    } catch (error) {
      transactionDebugError(
        '[TransactionKit] failed to send delegation user operation',
        {
          chainId,
          eoaAddress,
          authorization: summarizeAuthorization(authorization),
          error: summarizeError(error),
        }
      );
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

  async estimateEoaTransaction({
    chainId,
    to,
    value = '0',
    data = '0x',
    authorization,
  }: TransactionParams): Promise<EoaTransactionEstimateResult> {
    const transaction = { chainId, to, value, data };
    const baseResult = toBaseResult(transaction);

    try {
      if (!to || !isAddress(to)) {
        throw new Error('Transaction is missing a valid recipient address');
      }

      const publicClient =
        await this.etherspotProvider.getDirectPublicClient(chainId);
      const owner = await this.etherspotProvider.getOwnerAccount();
      const isCustomChain = Boolean(getCustomChainById(chainId));
      const authorizationList =
        !isCustomChain && authorization ? [authorization] : undefined;
      const preparedTransaction = isCustomChain
        ? toPlainEoaExecutionTransaction({
            account: owner.address,
            to,
            value,
            data,
          })
        : toDelegatedEoaExecutionTransaction({
            account: owner.address,
            to,
            value,
            data,
          });
      const request = {
        account: preparedTransaction.account,
        to: preparedTransaction.outerTo,
        value: preparedTransaction.outerValue,
        data: preparedTransaction.outerData,
        ...(authorizationList ? { authorizationList } : {}),
      };

      transactionDebugLog(
        '[TransactionKit] estimating direct EOA transaction',
        {
          chainId,
          isPlainCustomChainTransaction: isCustomChain,
          innerTransaction: summarizeTransaction(transaction),
          outerTransaction: summarizeTransaction({
            chainId,
            to: preparedTransaction.outerTo,
            value: preparedTransaction.outerValue,
            data: preparedTransaction.outerData,
          }),
          authorization: summarizeAuthorization(authorization),
        }
      );

      const gas = await publicClient.estimateGas(request);
      let feePerGas: bigint;

      try {
        const fees = await publicClient.estimateFeesPerGas();
        feePerGas = fees.maxFeePerGas || fees.gasPrice || BigInt(0);
      } catch {
        feePerGas = await publicClient.getGasPrice();
      }

      const cost = gas * feePerGas;

      transactionDebugLog('[TransactionKit] direct EOA estimate resolved', {
        chainId,
        gas: gas.toString(),
        feePerGas: feePerGas.toString(),
        cost: cost.toString(),
      });

      return {
        ...baseResult,
        chainId,
        cost,
        gas,
        feePerGas,
        isEstimatedSuccessfully: true,
      };
    } catch (error) {
      transactionDebugError('[TransactionKit] direct EOA estimate failed', {
        chainId,
        transaction: summarizeTransaction(transaction),
        error: summarizeError(error),
      });

      return {
        ...baseResult,
        chainId,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Failed to estimate direct EOA transaction',
        errorType: 'ESTIMATION_ERROR',
        isEstimatedSuccessfully: false,
      };
    }
  }

  async sendEoaTransaction({
    chainId,
    to,
    value = '0',
    data = '0x',
    authorization,
    gas,
  }: TransactionParams & { gas?: bigint }): Promise<EoaTransactionSendResult> {
    const transaction = { chainId, to, value, data };
    const baseResult = toBaseResult(transaction);

    try {
      if (!to || !isAddress(to)) {
        throw new Error('Transaction is missing a valid recipient address');
      }

      const walletClient =
        await this.etherspotProvider.getDirectWalletClient(chainId);
      const owner = await this.etherspotProvider.getOwnerAccount();
      const account = walletClient.account || owner.address;
      const isCustomChain = Boolean(getCustomChainById(chainId));
      const authorizationList =
        !isCustomChain && authorization ? [authorization] : undefined;
      const preparedTransaction = isCustomChain
        ? toPlainEoaExecutionTransaction({
            account: owner.address,
            to,
            value,
            data,
          })
        : toDelegatedEoaExecutionTransaction({
            account: owner.address,
            to,
            value,
            data,
          });

      transactionDebugLog('[TransactionKit] sending direct EOA transaction', {
        chainId,
        isPlainCustomChainTransaction: isCustomChain,
        innerTransaction: summarizeTransaction(transaction),
        outerTransaction: summarizeTransaction({
          chainId,
          to: preparedTransaction.outerTo,
          value: preparedTransaction.outerValue,
          data: preparedTransaction.outerData,
        }),
        hasGasEstimate: typeof gas === 'bigint',
        authorization: summarizeAuthorization(authorization),
      });

      const transactionHash = await walletClient.sendTransaction({
        account,
        chain: getChainById(chainId),
        to: preparedTransaction.outerTo,
        value: preparedTransaction.outerValue,
        data: preparedTransaction.outerData,
        ...(authorizationList ? { authorizationList } : {}),
        ...(typeof gas === 'bigint' ? { gas } : {}),
      });

      transactionDebugLog('[TransactionKit] direct EOA transaction sent', {
        chainId,
        transactionHash,
        hasAuthorization: Boolean(authorization),
      });

      if (authorization) {
        this.clearEoaDelegationStatusCache(chainId);
      }

      return {
        ...baseResult,
        chainId,
        transactionHash,
        isEstimatedSuccessfully: true,
        isSentSuccessfully: true,
      };
    } catch (error) {
      transactionDebugError('[TransactionKit] direct EOA send failed', {
        chainId,
        transaction: summarizeTransaction(transaction),
        error: summarizeError(error),
      });

      return {
        ...baseResult,
        chainId,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Failed to send direct EOA transaction',
        errorType: 'SEND_ERROR',
        isEstimatedSuccessfully: false,
        isSentSuccessfully: false,
      };
    }
  }

  async waitForEoaTransactionReceipt({
    chainId,
    transactionHash,
    confirmations = 1,
    timeout = 120000,
  }: {
    chainId: number;
    transactionHash: string;
    confirmations?: number;
    timeout?: number;
  }): Promise<EoaTransactionReceiptResult> {
    try {
      const publicClient =
        await this.etherspotProvider.getDirectPublicClient(chainId);

      transactionDebugLog(
        '[TransactionKit] waiting for direct EOA transaction receipt',
        {
          chainId,
          transactionHash,
          confirmations,
          timeout,
        }
      );

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash as Hex,
        confirmations,
        timeout,
      });

      transactionDebugLog(
        '[TransactionKit] direct EOA transaction receipt received',
        {
          chainId,
          transactionHash: receipt.transactionHash,
          status: receipt.status,
          blockNumber: receipt.blockNumber.toString(),
        }
      );

      return {
        chainId,
        transactionHash: receipt.transactionHash,
        status: receipt.status,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        isConfirmed: receipt.status === 'success',
      };
    } catch (error) {
      transactionDebugError(
        '[TransactionKit] direct EOA transaction receipt wait failed',
        {
          chainId,
          transactionHash,
          error: summarizeError(error),
        }
      );

      return {
        chainId,
        transactionHash: transactionHash as Hex,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Failed to confirm direct EOA transaction',
        errorType: 'CONFIRMATION_ERROR',
        isConfirmed: false,
      };
    }
  }

  transaction({ chainId, to, value = '0', data = '0x' }: TransactionParams) {
    this.clearEstimateTransactionsCache();
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
    this.clearEstimateTransactionsCache();
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
    this.clearEstimateTransactionsCache();

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
    this.clearEstimateTransactionsCache();

    return this;
  }

  async estimate(params: EstimateParams = {}) {
    const transaction = this.getSelectedTransaction();

    if (!transaction) {
      transactionDebugError('[TransactionKit] estimate skipped', {
        reason: 'No transaction selected for estimation',
      });
      return {
        isEstimatedSuccessfully: false,
        errorMessage: 'No transaction selected for estimation',
        errorType: 'VALIDATION_ERROR' as const,
        ...this.resultMethods(),
      };
    }

    this.isEstimating = true;
    try {
      const chainId = transaction.chainId || this.config.chainId;
      transactionDebugLog('[TransactionKit] estimate started', {
        chainId,
        transaction: summarizeTransaction(transaction),
        authorization: summarizeAuthorization(params.authorization),
        hasPaymasterDetails: isPaymasterDetailsEnabled(params.paymasterDetails),
      });
      const { cost } = await this.estimateTransactions({
        chainId,
        transactions: [transaction],
        authorization: params.authorization,
        paymasterDetails: params.paymasterDetails,
      });
      transactionDebugLog('[TransactionKit] estimate succeeded', {
        chainId,
        cost: cost.toString(),
      });

      return {
        ...toBaseResult(transaction),
        cost,
        isEstimatedSuccessfully: true,
        ...this.resultMethods(),
      };
    } catch (error) {
      this.containsEstimatingError = true;
      transactionDebugError('[TransactionKit] estimate failed', {
        transaction: summarizeTransaction(transaction),
        authorization: summarizeAuthorization(params.authorization),
        error: summarizeError(error),
      });
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
      transactionDebugError('[TransactionKit] send skipped', {
        reason: 'No transaction selected for sending',
      });
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
      transactionDebugLog('[TransactionKit] send started', {
        chainId,
        transaction: summarizeTransaction(transaction),
        authorization: summarizeAuthorization(params.authorization),
        hasPaymasterDetails: isPaymasterDetailsEnabled(params.paymasterDetails),
      });
      const estimate = await this.estimateTransactions({
        chainId,
        transactions: [transaction],
        authorization: params.authorization,
        paymasterDetails: params.paymasterDetails,
      });
      const { cost, calls, shouldUseAuthorization } = estimate;
      const bundlerClient =
        await this.etherspotProvider.getBundlerClient(chainId);
      transactionDebugLog('[TransactionKit] sending user operation', {
        chainId,
        sender: bundlerClient.account?.address,
        calls,
        shouldUseAuthorization,
        authorization: shouldUseAuthorization
          ? summarizeAuthorization(params.authorization)
          : undefined,
      });
      const userOpHash = await this.sendPreparedUserOperation({
        bundlerClient,
        estimate,
      });
      transactionDebugLog('[TransactionKit] user operation sent', {
        chainId,
        userOpHash,
        cost: cost.toString(),
      });
      this.clearEoaDelegationStatusCache(chainId);
      this.clearEstimateTransactionsCache();

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
      transactionDebugError('[TransactionKit] send failed', {
        transaction: summarizeTransaction(transaction),
        authorization: summarizeAuthorization(params.authorization),
        error: summarizeError(error),
      });
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
              paymasterDetails: params.paymasterDetails,
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
            const estimate = await this.estimateTransactions({
              chainId,
              transactions: chainTransactions,
              authorization: params.authorization,
              paymasterDetails: params.paymasterDetails,
            });
            const { cost } = estimate;
            const bundlerClient =
              await this.etherspotProvider.getBundlerClient(chainId);
            const userOpHash = await this.sendPreparedUserOperation({
              bundlerClient,
              estimate,
            });
            this.clearEoaDelegationStatusCache(chainId);
            this.clearEstimateTransactionsCache();
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
    this.clearEstimateTransactionsCache();
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
