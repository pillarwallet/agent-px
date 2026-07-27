import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSignature,
  Globe2,
  KeyRound,
  LoaderCircle,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';

import {
  PILLARX_PROVIDER_APPROVAL_GET_PENDING,
  PILLARX_PROVIDER_APPROVAL_RESPOND,
  ProviderApprovalFeePayment,
  ProviderApprovalRequestView,
} from './providerMessages';
import {
  getPhoneOtpAddressFromPrivateKey,
  getPhoneOtpMinimumPasscodeLength,
  setUnlockedPhoneOtpAddress,
  unlockPhoneOtpPrivateKey,
} from '../utils/phoneOtpAuth';
import {
  unlockOrImportPillarKeyringPrivateKey,
  unlockPillarKeyring,
} from '../utils/pillarKeyringMessaging';

type ChromeRuntimeLike = {
  lastError?: {
    message?: string;
  };
  sendMessage: (
    message: unknown,
    callback: (response?: unknown) => void
  ) => void;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
};

type PendingResponse = {
  ok?: boolean;
  pending?: ProviderApprovalRequestView[];
};

type TransactionPreview = {
  data?: string;
  from?: string;
  to?: string;
  value?: string;
};

type ApprovalSummary = {
  description: string;
  icon: ReactNode;
  rows: { label: string; value: string }[];
  title: string;
  tone: 'connect' | 'signature' | 'transaction';
};

type SimulationChange = NonNullable<
  ProviderApprovalRequestView['simulation']
>['changes'][number];
type FeePaymentOption = NonNullable<
  ProviderApprovalRequestView['feePaymentOptions']
>[number];

const isActionableApproval = (request: ProviderApprovalRequestView) =>
  !request.status || request.status.phase === 'pending';

type ProviderApprovalOverlayProps = {
  closeWhenSettled?: boolean;
  standalone?: boolean;
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  11155111: 'Sepolia',
};

const CHAIN_NATIVE_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  10: 'ETH',
  56: 'BNB',
  137: 'POL',
  8453: 'ETH',
  42161: 'ETH',
  11155111: 'ETH',
};

const CHAIN_EXPLORER_TX_URLS: Record<number, { name: string; url: string }> = {
  1: { name: 'Etherscan', url: 'https://etherscan.io/tx/' },
  10: {
    name: 'Optimistic Etherscan',
    url: 'https://optimistic.etherscan.io/tx/',
  },
  56: { name: 'BscScan', url: 'https://bscscan.com/tx/' },
  137: { name: 'Polygonscan', url: 'https://polygonscan.com/tx/' },
  8453: { name: 'Basescan', url: 'https://basescan.org/tx/' },
  42161: { name: 'Arbiscan', url: 'https://arbiscan.io/tx/' },
  11155111: {
    name: 'Sepolia Etherscan',
    url: 'https://sepolia.etherscan.io/tx/',
  },
};

const sendRuntimeMessage = <T,>(message: unknown): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    if (!chromeLike?.runtime?.sendMessage) {
      resolve(undefined);
      return;
    }

    chromeLike.runtime.sendMessage(message, (response) => {
      const errorMessage = chromeLike.runtime?.lastError?.message;
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve(response as T);
    });
  });

const fetchPendingApprovals = async () => {
  const response = await sendRuntimeMessage<PendingResponse>({
    type: PILLARX_PROVIDER_APPROVAL_GET_PENDING,
  });

  return response?.pending ?? [];
};

const respondToApproval = (
  id: string,
  approved: boolean,
  feePayment?: ProviderApprovalFeePayment
) =>
  sendRuntimeMessage({
    type: PILLARX_PROVIDER_APPROVAL_RESPOND,
    id,
    approved,
    feePayment,
  });

const stringifyParams = (
  params: ProviderApprovalRequestView['params']
): string => {
  try {
    return JSON.stringify(params ?? [], null, 2);
  } catch {
    return String(params ?? '');
  }
};

const getParamsArray = (
  params: ProviderApprovalRequestView['params']
): readonly unknown[] => (Array.isArray(params) ? params : []);

const getFirstObjectParam = (
  params: ProviderApprovalRequestView['params']
): Record<string, unknown> | undefined => {
  const [firstParam] = getParamsArray(params);
  return typeof firstParam === 'object' && firstParam !== null
    ? (firstParam as Record<string, unknown>)
    : undefined;
};

const shortAddress = (value?: string) => {
  if (!value) return 'Unknown';
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const compactHex = (value?: string) => {
  if (!value) return '0x';
  if (value.length <= 22) return value;
  return `${value.slice(0, 14)}...${value.slice(-8)}`;
};

const getTransactionExplorer = (chainId: number, transactionHash?: string) => {
  const explorer = CHAIN_EXPLORER_TX_URLS[chainId];
  if (!explorer || !transactionHash) return undefined;

  return {
    name: explorer.name,
    url: `${explorer.url}${transactionHash}`,
  };
};

const getFeePaymentOptionSubtitle = (option: FeePaymentOption) => {
  if (option.type === 'native') {
    return option.value ? `Network gas in ${option.value}` : 'Network gas';
  }

  if (option.value) {
    return `Balance ${option.value} ${option.title}`;
  }

  return 'Gasless fee token';
};

const getFeePaymentOptionBadge = (option: FeePaymentOption) =>
  option.type === 'gasless' ? 'Gasless' : 'Native';

const FeePaymentOptionIcon = ({
  option,
  styles,
}: {
  option: FeePaymentOption;
  styles: Record<string, CSSProperties>;
}) => {
  const [hideImage, setHideImage] = useState(false);

  if (option.type === 'gasless' && option.imageSrc && !hideImage) {
    return (
      <img
        alt=""
        onError={() => setHideImage(true)}
        src={option.imageSrc}
        style={styles.feePaymentOptionImage}
      />
    );
  }

  return (
    <span style={styles.feePaymentOptionFallback}>
      {option.type === 'native' ? (
        <Send size={18} strokeWidth={2.2} />
      ) : (
        option.title.slice(0, 1).toUpperCase()
      )}
    </span>
  );
};

const formatValue = (value: unknown, chainId: number) => {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === '0x0'
  ) {
    return `0 ${CHAIN_NATIVE_SYMBOLS[chainId] ?? 'native'}`;
  }

  try {
    const parsedValue =
      typeof value === 'bigint' ? value : BigInt(String(value));
    const formatted = formatEther(parsedValue);
    const trimmed = formatted.includes('.')
      ? formatted.replace(/\.?0+$/, '')
      : formatted;

    return `${trimmed || '0'} ${CHAIN_NATIVE_SYMBOLS[chainId] ?? 'native'}`;
  } catch {
    return String(value);
  }
};

const getTransactionPreview = (
  request: ProviderApprovalRequestView
): TransactionPreview => {
  const tx = getFirstObjectParam(request.params);
  if (!tx) return {};

  return {
    data: typeof tx.data === 'string' ? tx.data : undefined,
    from: typeof tx.from === 'string' ? tx.from : undefined,
    to: typeof tx.to === 'string' ? tx.to : undefined,
    value: tx.value === undefined ? undefined : String(tx.value),
  };
};

const getWalletSendCallsPreview = (request: ProviderApprovalRequestView) => {
  const requestParam = getFirstObjectParam(request.params);
  const calls = Array.isArray(requestParam?.calls) ? requestParam.calls : [];
  let totalValue = BigInt(0);
  let dataBytes = 0;

  calls.forEach((call) => {
    if (!call || typeof call !== 'object') return;

    const callObject = call as Record<string, unknown>;
    try {
      if (callObject.value !== undefined) {
        totalValue += BigInt(String(callObject.value));
      }
    } catch {
      // Keep the preview resilient if a dapp sends malformed values.
    }

    if (typeof callObject.data === 'string' && callObject.data !== '0x') {
      dataBytes += Math.max((callObject.data.length - 2) / 2, 0);
    }
  });

  return {
    atomicRequired:
      typeof requestParam?.atomicRequired === 'boolean'
        ? requestParam.atomicRequired
        : true,
    callCount: calls.length,
    dataBytes,
    from:
      typeof requestParam?.from === 'string' ? requestParam.from : undefined,
    totalValue,
  };
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getTypedDataName = (request: ProviderApprovalRequestView) => {
  const [, payload] = getParamsArray(request.params);
  const parsedPayload =
    typeof payload === 'string' ? safeJsonParse(payload) : payload;

  if (typeof parsedPayload !== 'object' || parsedPayload === null) {
    return 'Typed data payload';
  }

  const typedData = parsedPayload as {
    domain?: { name?: unknown; verifyingContract?: unknown };
    primaryType?: unknown;
  };
  const pieces = [
    typeof typedData.domain?.name === 'string'
      ? typedData.domain.name
      : undefined,
    typeof typedData.primaryType === 'string'
      ? typedData.primaryType
      : undefined,
    typeof typedData.domain?.verifyingContract === 'string'
      ? shortAddress(typedData.domain.verifyingContract)
      : undefined,
  ].filter(Boolean);

  return pieces.join(' / ') || 'Typed data payload';
};

const getMessagePreview = (request: ProviderApprovalRequestView) => {
  const params = getParamsArray(request.params);
  const message = request.method === 'eth_sign' ? params[1] : params[0];
  const serialized =
    typeof message === 'string' ? message : JSON.stringify(message ?? '');

  return serialized.length > 80
    ? `${serialized.slice(0, 80)}...`
    : serialized || 'Message payload';
};

const getSimulationLabel = (direction: SimulationChange['direction']) => {
  if (direction === 'approve') return 'You approve';
  if (direction === 'spend') return 'You spend';
  return 'You receive';
};

const getSimulationAmountToneStyle = (
  direction: SimulationChange['direction'],
  styles: Record<string, CSSProperties>
) => {
  if (direction === 'approve') return styles.simulationAmountApprove;
  if (direction === 'receive') return styles.simulationAmountReceive;
  return styles.simulationAmountSpend;
};

const getSimulationAmount = (change: SimulationChange) => {
  const amount = change.amount ?? '';
  const symbol = change.symbol ?? change.name ?? change.assetType ?? 'Asset';
  if (change.direction === 'approve') {
    return amount ? `${amount} ${symbol}` : symbol;
  }

  const prefix = change.direction === 'spend' ? '-' : '+';

  return `${prefix}${amount ? `${amount} ` : ''}${symbol}`;
};

const getApprovalSummary = (
  request: ProviderApprovalRequestView
): ApprovalSummary => {
  if (request.method === 'eth_requestAccounts') {
    return {
      description: request.account
        ? 'Allow this site to view your wallet address'
        : 'Unlock PillarX and allow this site to view your wallet address',
      icon: <Globe2 size={22} strokeWidth={2.2} />,
      rows: [
        { label: 'Network', value: CHAIN_NAMES[request.chainId] ?? 'Unknown' },
        {
          label: 'Account',
          value: request.account ? shortAddress(request.account) : 'Locked',
        },
        { label: 'Permission', value: 'View wallet address' },
      ],
      title: 'Connect Wallet',
      tone: 'connect',
    };
  }

  if (
    request.method === 'eth_sendTransaction' ||
    request.method === 'eth_signTransaction' ||
    request.method === 'wallet_sendCalls'
  ) {
    const isSendCalls = request.method === 'wallet_sendCalls';
    const tx = isSendCalls ? undefined : getTransactionPreview(request);
    const batch = isSendCalls ? getWalletSendCallsPreview(request) : undefined;
    const dataLength = tx?.data ? Math.max((tx.data.length - 2) / 2, 0) : 0;
    const description = (() => {
      if (request.method === 'wallet_sendCalls') {
        return 'Confirm this batch of on-chain calls';
      }

      if (request.method === 'eth_sendTransaction') {
        return 'Confirm this on-chain request';
      }

      return 'Confirm this transaction signature';
    })();
    const title = (() => {
      if (request.method === 'eth_sendTransaction') return 'Send Transaction';
      if (request.method === 'wallet_sendCalls') return 'Send Calls';
      return 'Sign Transaction';
    })();

    return {
      description,
      icon: <Send size={22} strokeWidth={2.2} />,
      rows: isSendCalls
        ? [
            {
              label: 'Network',
              value: CHAIN_NAMES[request.chainId] ?? 'Unknown',
            },
            {
              label: 'From',
              value: shortAddress(batch?.from ?? request.account),
            },
            { label: 'Calls', value: String(batch?.callCount ?? 0) },
            {
              label: 'Total value',
              value: formatValue(batch?.totalValue ?? 0n, request.chainId),
            },
            {
              label: 'Estimated fee',
              value: request.estimatedFee?.formatted ?? 'Unavailable',
            },
            {
              label: 'Atomic',
              value: batch?.atomicRequired ? 'Required' : 'Supported',
            },
            {
              label: 'Data',
              value: batch?.dataBytes ? `${batch.dataBytes} bytes` : 'None',
            },
          ]
        : [
            {
              label: 'Network',
              value: CHAIN_NAMES[request.chainId] ?? 'Unknown',
            },
            { label: 'From', value: shortAddress(tx?.from ?? request.account) },
            { label: 'To', value: shortAddress(tx?.to) },
            { label: 'Value', value: formatValue(tx?.value, request.chainId) },
            {
              label: 'Estimated fee',
              value: request.estimatedFee?.formatted ?? 'Unavailable',
            },
            {
              label: 'Data',
              value: dataLength ? `${dataLength} bytes` : 'None',
            },
          ],
      title,
      tone: 'transaction',
    };
  }

  if (
    request.method === 'eth_signTypedData' ||
    request.method === 'eth_signTypedData_v3' ||
    request.method === 'eth_signTypedData_v4'
  ) {
    return {
      description: 'Review the structured data request',
      icon: <FileSignature size={22} strokeWidth={2.2} />,
      rows: [
        { label: 'Network', value: CHAIN_NAMES[request.chainId] ?? 'Unknown' },
        { label: 'Account', value: shortAddress(request.account) },
        { label: 'Payload', value: getTypedDataName(request) },
        { label: 'Method', value: request.method },
      ],
      title: 'Sign Typed Data',
      tone: 'signature',
    };
  }

  return {
    description: 'Review the message request',
    icon: <FileSignature size={22} strokeWidth={2.2} />,
    rows: [
      { label: 'Network', value: CHAIN_NAMES[request.chainId] ?? 'Unknown' },
      { label: 'Account', value: shortAddress(request.account) },
      { label: 'Message', value: getMessagePreview(request) },
      { label: 'Method', value: request.method },
    ],
    title: 'Sign Message',
    tone: 'signature',
  };
};

const unlockPillarXForConnect = async (passcode: string) => {
  try {
    const status = await unlockPillarKeyring(passcode);
    const accountAddress = status.accounts[0];
    if (accountAddress) return accountAddress;
  } catch {
    // Fall back to the legacy encrypted vault for first-run keyring migration.
  }

  const privateKey = await unlockPhoneOtpPrivateKey(passcode);
  const expectedAddress = getPhoneOtpAddressFromPrivateKey(privateKey);
  const status = await unlockOrImportPillarKeyringPrivateKey({
    passphrase: passcode,
    privateKey,
  });
  const accountAddress = status.accounts.find(
    (address) => address.toLowerCase() === expectedAddress.toLowerCase()
  );

  if (!accountAddress) {
    throw new Error('PillarX did not unlock the expected account.');
  }

  return accountAddress;
};

export default function ProviderApprovalOverlay({
  closeWhenSettled = false,
  standalone = false,
}: ProviderApprovalOverlayProps) {
  const styles = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    () => getApprovalOverlayStyles({ standalone }),
    [standalone]
  );
  const [pending, setPending] = useState<ProviderApprovalRequestView[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [showRawPayload, setShowRawPayload] = useState(false);
  const [selectedFeePaymentId, setSelectedFeePaymentId] =
    useState('native-token');
  const [isFeePaymentExpanded, setIsFeePaymentExpanded] = useState(false);
  const activeRequest = pending[0];
  const isConnectRequest = activeRequest?.method === 'eth_requestAccounts';
  const isTransactionRequest =
    activeRequest?.method === 'eth_sendTransaction' ||
    activeRequest?.method === 'wallet_sendCalls';
  const connectNeedsUnlock = Boolean(
    isConnectRequest && !activeRequest.account
  );
  const minimumPasscodeLength = getPhoneOtpMinimumPasscodeLength();
  const paramsPreview = useMemo(
    () => stringifyParams(activeRequest?.params),
    [activeRequest?.params]
  );
  const approvalSummary = useMemo(
    () => (activeRequest ? getApprovalSummary(activeRequest) : undefined),
    [activeRequest]
  );
  const transactionPreview = activeRequest
    ? getTransactionPreview(activeRequest)
    : undefined;
  const feePaymentOptions = useMemo(
    () => activeRequest?.feePaymentOptions ?? [],
    [activeRequest?.feePaymentOptions]
  );
  const showFeePaymentSelect =
    isTransactionRequest && feePaymentOptions.length > 1;
  const selectedFeePaymentOption =
    feePaymentOptions.find((option) => option.id === selectedFeePaymentId) ??
    feePaymentOptions[0];
  const firstFeePaymentOptionId = feePaymentOptions[0]?.id ?? 'native-token';
  const transactionStatus = activeRequest?.status;
  const showTransactionStatusView =
    isTransactionRequest &&
    transactionStatus !== undefined &&
    transactionStatus.phase !== 'pending';

  const refreshPending = async () => {
    try {
      const nextPending = await fetchPendingApprovals();
      setPending(nextPending);
      return nextPending;
    } catch {
      setPending([]);
      return [];
    }
  };

  useEffect(() => {
    refreshPending();
    const intervalId = window.setInterval(refreshPending, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setShowRawPayload(false);
    setPasscode('');
    setErrorMessage(undefined);
    setIsFeePaymentExpanded(false);
    setSelectedFeePaymentId(firstFeePaymentOptionId);
  }, [activeRequest?.id, firstFeePaymentOptionId]);

  useEffect(() => {
    if (!feePaymentOptions.length) return;
    if (
      feePaymentOptions.some((option) => option.id === selectedFeePaymentId)
    ) {
      return;
    }

    setSelectedFeePaymentId(feePaymentOptions[0].id);
    setIsFeePaymentExpanded(false);
  }, [feePaymentOptions, selectedFeePaymentId]);

  if (!activeRequest || !approvalSummary) {
    if (!standalone) return null;

    return (
      <div style={styles.backdrop}>
        <section style={{ ...styles.sheet, ...styles.emptySheet }}>
          <div style={styles.emptyState}>
            <div style={styles.summaryIcon}>
              <FileSignature size={22} strokeWidth={2.2} />
            </div>
            <strong style={styles.title}>Waiting for Request</strong>
            <p style={styles.description}>
              PillarX is checking for the pending dapp approval.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const handleResponse = async (approved: boolean) => {
    setIsResponding(true);
    setErrorMessage(undefined);
    try {
      if (approved && connectNeedsUnlock) {
        if (passcode.trim().length < minimumPasscodeLength) {
          setErrorMessage(
            `Passcode must be at least ${minimumPasscodeLength} characters.`
          );
          setIsResponding(false);
          return;
        }

        const accountAddress = await unlockPillarXForConnect(passcode);
        setUnlockedPhoneOtpAddress(accountAddress);
      }

      let feePayment: ProviderApprovalFeePayment | undefined;
      if (approved && isTransactionRequest && selectedFeePaymentOption) {
        if (selectedFeePaymentOption.type === 'gasless') {
          feePayment = {
            decimals: selectedFeePaymentOption.decimals,
            paymasterAddress: selectedFeePaymentOption.paymasterAddress,
            token: selectedFeePaymentOption.token,
            type: 'gasless',
          };
        } else {
          feePayment = { type: 'native' };
        }
      }

      await respondToApproval(activeRequest.id, approved, feePayment);
      setShowRawPayload(false);

      if (closeWhenSettled && (!approved || !isTransactionRequest)) {
        const latestPending = await fetchPendingApprovals().catch(() => []);
        const actionablePending = latestPending.filter(isActionableApproval);

        if (actionablePending.length === 0) {
          window.close();
          return;
        }

        setPending(latestPending);
        return;
      }

      const nextPending = await refreshPending();
      const hasActionablePending = nextPending.some(isActionableApproval);
      const shouldCloseNonTransactionRequest =
        !isTransactionRequest && !hasActionablePending;

      if (
        closeWhenSettled &&
        (nextPending.length === 0 || shouldCloseNonTransactionRequest)
      ) {
        window.setTimeout(async () => {
          const latestPending = await refreshPending();
          if (!latestPending.some(isActionableApproval)) {
            window.close();
          }
        }, 1200);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to respond to this request.'
      );
    } finally {
      setIsResponding(false);
    }
  };

  const renderSimulationContent = () => {
    if (!activeRequest.simulation) return null;

    if (activeRequest.simulation.error) {
      return (
        <p style={styles.simulationMuted}>{activeRequest.simulation.error}</p>
      );
    }

    if (!activeRequest.simulation.changes.length) {
      return (
        <p style={styles.simulationMuted}>No wallet token changes detected.</p>
      );
    }

    return (
      <div style={styles.simulationRows}>
        {activeRequest.simulation.changes.map((change, index) => (
          <div
            key={`${change.direction}-${change.contractAddress ?? change.symbol ?? 'asset'}-${change.tokenId ?? index}`}
            style={styles.simulationRow}
          >
            <div style={styles.simulationAsset}>
              {change.logo ? (
                <img alt="" src={change.logo} style={styles.simulationLogo} />
              ) : (
                <span style={styles.simulationLogoFallback}>
                  {(change.symbol ?? change.name ?? '?')
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
              )}
              <div style={styles.simulationAssetText}>
                <strong style={styles.simulationChangeLabel}>
                  {getSimulationLabel(change.direction)}
                </strong>
                <span style={styles.simulationTokenName}>
                  {change.name ?? change.assetType ?? 'Token'}
                </span>
              </div>
            </div>
            <span
              style={{
                ...styles.simulationAmount,
                ...getSimulationAmountToneStyle(change.direction, styles),
              }}
            >
              {getSimulationAmount(change)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const getSummaryIconToneStyle = () => {
    switch (approvalSummary.tone) {
      case 'connect':
        return styles.connectIcon;
      case 'transaction':
        return styles.transactionIcon;
      default:
        return styles.signatureIcon;
    }
  };

  const getApproveButtonLabel = () => {
    if (!isConnectRequest) return 'Approve';
    if (connectNeedsUnlock) return 'Unlock & Connect';
    return 'Connect';
  };

  const renderFeePaymentOption = ({
    option,
    selected = false,
  }: {
    option: FeePaymentOption;
    selected?: boolean;
  }) => (
    <button
      disabled={isResponding}
      key={option.id}
      onClick={() => {
        if (selected) {
          setIsFeePaymentExpanded((value) => !value);
          return;
        }

        setSelectedFeePaymentId(option.id);
        setIsFeePaymentExpanded(false);
      }}
      style={{
        ...styles.feePaymentOption,
        ...(selected ? styles.feePaymentOptionSelected : {}),
      }}
      type="button"
    >
      <FeePaymentOptionIcon option={option} styles={styles} />
      <span style={styles.feePaymentOptionText}>
        <strong style={styles.feePaymentOptionTitle}>{option.title}</strong>
        <span style={styles.feePaymentOptionValue}>
          {getFeePaymentOptionSubtitle(option)}
        </span>
      </span>
      <span style={styles.feePaymentOptionRight}>
        <span style={styles.feePaymentOptionBadge}>
          {getFeePaymentOptionBadge(option)}
        </span>
        {selected ? (
          <ChevronDown
            size={17}
            style={{
              ...styles.feePaymentOptionToggle,
              transform: isFeePaymentExpanded
                ? 'rotate(180deg)'
                : 'rotate(0deg)',
            }}
          />
        ) : null}
      </span>
    </button>
  );

  const renderTransactionStatusMain = () => {
    if (!transactionStatus || transactionStatus.phase === 'pending') {
      return null;
    }

    let explorer: ReturnType<typeof getTransactionExplorer>;
    const isSubmitting = transactionStatus.phase === 'submitting';
    const isSuccess = transactionStatus.phase === 'success';
    let statusDescription = transactionStatus.message;
    let statusIcon = <XCircle size={62} strokeWidth={2.1} />;
    let statusIconToneStyle = styles.statusIconError;
    let statusLabel = 'Failed';
    let statusTitle = 'Transaction Failed';

    if (isSubmitting) {
      statusDescription =
        transactionStatus.message ??
        'PillarX is sending this transaction and waiting for the hash.';
      statusIcon = (
        <LoaderCircle size={58} strokeWidth={2.4} style={styles.spinnerIcon} />
      );
      statusIconToneStyle = styles.statusIconSubmitting;
      statusLabel = 'Sending';
      statusTitle = 'Sending Transaction';
    } else if (isSuccess) {
      explorer = getTransactionExplorer(
        activeRequest.chainId,
        transactionStatus.transactionHash
      );
      statusDescription =
        'The network accepted the transaction and returned a hash.';
      statusIcon = <CheckCircle2 size={62} strokeWidth={2.1} />;
      statusIconToneStyle = styles.statusIconSuccess;
      statusLabel = 'Hash received';
      statusTitle = 'Transaction Sent';
    }

    const renderStatusAction = () => {
      if (isSubmitting) {
        return (
          <button
            disabled
            style={{ ...styles.button, ...styles.pendingActionButton }}
            type="button"
          >
            <LoaderCircle
              size={18}
              strokeWidth={2.4}
              style={styles.spinnerIcon}
            />
            Sending
          </button>
        );
      }

      if (isSuccess && explorer) {
        return (
          <button
            onClick={() =>
              window.open(explorer.url, '_blank', 'noopener,noreferrer')
            }
            style={{ ...styles.button, ...styles.approveButton }}
            type="button"
          >
            <ExternalLink size={18} strokeWidth={2.4} />
            View on {explorer.name}
          </button>
        );
      }

      return (
        <button
          onClick={() => window.close()}
          style={{ ...styles.button, ...styles.rejectButton }}
          type="button"
        >
          <X size={18} strokeWidth={2.4} />
          Close
        </button>
      );
    };

    return (
      <>
        <main
          aria-live="polite"
          style={{ ...styles.content, ...styles.statusContent }}
        >
          <div
            style={{
              ...styles.statusIcon,
              ...statusIconToneStyle,
            }}
          >
            {statusIcon}
          </div>

          <div style={styles.summaryText}>
            <h1 style={styles.title}>{statusTitle}</h1>
            <p style={styles.description}>{statusDescription}</p>
          </div>

          <div style={styles.detailList}>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Network</span>
              <span style={styles.detailValue}>
                {CHAIN_NAMES[activeRequest.chainId] ?? 'Unknown'}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Status</span>
              <span style={styles.detailValue}>{statusLabel}</span>
            </div>
            {transactionStatus.phase === 'success' ? (
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Hash</span>
                <span style={styles.detailValue}>
                  {compactHex(transactionStatus.transactionHash)}
                </span>
              </div>
            ) : null}
          </div>
        </main>

        <footer style={{ ...styles.actions, ...styles.singleActionFooter }}>
          {renderStatusAction()}
        </footer>
      </>
    );
  };

  const transactionStatusContent = showTransactionStatusView
    ? renderTransactionStatusMain()
    : null;

  return (
    <div style={styles.backdrop}>
      <style>
        {`
          @keyframes pillarx-approval-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <section style={styles.sheet} role="dialog" aria-modal="true">
        <header style={styles.header}>
          <div style={styles.dappIdentity}>
            <div style={styles.faviconWrap}>
              {activeRequest.favicon ? (
                <img
                  alt=""
                  src={activeRequest.favicon}
                  style={styles.favicon}
                />
              ) : (
                <Globe2 size={22} strokeWidth={2.1} />
              )}
            </div>
            <div style={styles.dappText}>
              <span style={styles.originLabel}>Request from</span>
              <strong style={styles.originName}>
                {activeRequest.title || activeRequest.origin}
              </strong>
            </div>
          </div>
          {pending.length > 1 ? (
            <span style={styles.pendingBadge}>{pending.length} pending</span>
          ) : null}
        </header>

        {transactionStatusContent ?? (
          <>
            <main style={styles.content}>
              <div
                style={{
                  ...styles.summaryIcon,
                  ...getSummaryIconToneStyle(),
                }}
              >
                {approvalSummary.icon}
              </div>

              <div style={styles.summaryText}>
                <h1 style={styles.title}>{approvalSummary.title}</h1>
                <p style={styles.description}>{approvalSummary.description}</p>
              </div>

              <div style={styles.detailList}>
                {approvalSummary.rows.map((row) => (
                  <div key={row.label} style={styles.detailRow}>
                    <span style={styles.detailLabel}>{row.label}</span>
                    <span style={styles.detailValue}>{row.value}</span>
                  </div>
                ))}
              </div>

              {showFeePaymentSelect ? (
                <section style={styles.feePaymentPanel}>
                  <span style={styles.feePaymentLabel}>Pay fee in</span>
                  <div style={styles.feePaymentList}>
                    {selectedFeePaymentOption
                      ? renderFeePaymentOption({
                          option: selectedFeePaymentOption,
                          selected: true,
                        })
                      : null}
                    {isFeePaymentExpanded
                      ? feePaymentOptions
                          .filter(
                            (option) =>
                              option.id !== selectedFeePaymentOption?.id
                          )
                          .map((option) => renderFeePaymentOption({ option }))
                      : null}
                  </div>
                </section>
              ) : null}

              {connectNeedsUnlock ? (
                <section style={styles.unlockPanel}>
                  <span style={styles.unlockLabel} id="pillarx-passcode-label">
                    Wallet passcode
                  </span>
                  <div style={styles.passcodeWrap}>
                    <KeyRound size={17} strokeWidth={2.2} />
                    <input
                      aria-labelledby="pillarx-passcode-label"
                      disabled={isResponding}
                      id="pillarx-passcode"
                      onChange={(event) => setPasscode(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          handleResponse(true);
                        }
                      }}
                      placeholder="Enter passcode"
                      style={styles.passcodeInput}
                      type="password"
                      value={passcode}
                    />
                  </div>
                </section>
              ) : null}

              {errorMessage ? (
                <p style={styles.errorMessage}>{errorMessage}</p>
              ) : null}

              {activeRequest.simulation ? (
                <section style={styles.simulationPanel}>
                  <div style={styles.simulationHeader}>
                    <span style={styles.detailLabel}>Simulation</span>
                  </div>
                  {renderSimulationContent()}
                </section>
              ) : null}

              {transactionPreview?.data && transactionPreview.data !== '0x' ? (
                <div style={styles.callDataPreview}>
                  <span style={styles.detailLabel}>Calldata</span>
                  <code style={styles.callDataCode}>
                    {compactHex(transactionPreview.data)}
                  </code>
                </div>
              ) : null}

              <div style={styles.warning}>
                <AlertTriangle size={16} strokeWidth={2.1} />
                <span>
                  {isConnectRequest
                    ? 'Only connect to sites you trust.'
                    : 'Only approve requests you expect from this site.'}
                </span>
              </div>

              <button
                onClick={() => setShowRawPayload((value) => !value)}
                style={styles.rawToggle}
                type="button"
              >
                <span>Raw payload</span>
                <ChevronDown
                  size={17}
                  style={{
                    transform: showRawPayload
                      ? 'rotate(180deg)'
                      : 'rotate(0deg)',
                    transition: 'transform 140ms ease',
                  }}
                />
              </button>

              {showRawPayload ? (
                <pre style={styles.params}>{paramsPreview}</pre>
              ) : null}
            </main>

            <footer style={styles.actions}>
              <button
                disabled={isResponding}
                onClick={() => handleResponse(false)}
                style={{ ...styles.button, ...styles.rejectButton }}
                type="button"
              >
                <X size={18} strokeWidth={2.4} />
                {isConnectRequest ? 'Cancel' : 'Reject'}
              </button>
              <button
                disabled={isResponding}
                onClick={() => handleResponse(true)}
                style={{ ...styles.button, ...styles.approveButton }}
                type="button"
              >
                <Check size={18} strokeWidth={2.4} />
                {getApproveButtonLabel()}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function getApprovalOverlayStyles({
  standalone,
}: {
  standalone: boolean;
}): Record<string, CSSProperties> {
  return {
    actions: {
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'grid',
      gap: 10,
      gridTemplateColumns: '1fr 1fr',
      padding: 16,
    },
    approveButton: {
      background: '#8f6cff',
      boxShadow: '0 12px 28px rgba(143, 108, 255, 0.28)',
      color: '#ffffff',
    },
    backdrop: {
      alignItems: 'center',
      background: standalone ? '#050507' : 'rgba(5, 5, 8, 0.76)',
      display: 'flex',
      inset: 0,
      justifyContent: 'center',
      padding: standalone ? 0 : 14,
      position: 'fixed',
      zIndex: 2147483647,
    },
    button: {
      alignItems: 'center',
      border: 0,
      borderRadius: 8,
      cursor: 'pointer',
      display: 'inline-flex',
      fontSize: 14,
      fontWeight: 800,
      gap: 8,
      justifyContent: 'center',
      minHeight: 48,
    },
    callDataCode: {
      color: '#dcd7ff',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      overflowWrap: 'anywhere',
    },
    callDataPreview: {
      background: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 8,
      display: 'grid',
      gap: 6,
      padding: 12,
    },
    content: {
      display: 'grid',
      gap: 14,
      overflow: 'auto',
      padding: standalone ? '22px 24px 12px' : '18px 16px 4px',
    },
    connectIcon: {
      background: 'rgba(143, 108, 255, 0.16)',
      color: '#bba6ff',
    },
    dappIdentity: {
      alignItems: 'center',
      display: 'flex',
      gap: 10,
      minWidth: 0,
    },
    dappText: {
      display: 'grid',
      minWidth: 0,
    },
    description: {
      color: 'rgba(255, 255, 255, 0.6)',
      fontSize: 13,
      lineHeight: 1.4,
      margin: 0,
      textAlign: 'center',
    },
    detailLabel: {
      color: 'rgba(255, 255, 255, 0.48)',
      fontSize: 12,
      fontWeight: 700,
    },
    detailList: {
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'grid',
    },
    detailRow: {
      alignItems: 'center',
      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      display: 'grid',
      gap: 10,
      gridTemplateColumns: '96px minmax(0, 1fr)',
      minHeight: 42,
    },
    detailValue: {
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: 13,
      fontWeight: 700,
      overflowWrap: 'anywhere',
      textAlign: 'right',
    },
    emptySheet: {
      minHeight: 280,
    },
    emptyState: {
      alignContent: 'center',
      display: 'grid',
      gap: 10,
      justifyItems: 'center',
      padding: 24,
      textAlign: 'center',
    },
    favicon: {
      borderRadius: 8,
      height: 32,
      objectFit: 'cover',
      width: 32,
    },
    faviconWrap: {
      alignItems: 'center',
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: 8,
      color: '#e2ddff',
      display: 'flex',
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    feePaymentLabel: {
      color: 'rgba(255, 255, 255, 0.48)',
      fontSize: 12,
      fontWeight: 800,
    },
    feePaymentList: {
      display: 'grid',
      gap: 8,
    },
    feePaymentOption: {
      alignItems: 'center',
      appearance: 'none',
      background: 'rgba(255, 255, 255, 0.055)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 8,
      color: '#ffffff',
      cursor: 'pointer',
      display: 'grid',
      gap: 10,
      gridTemplateColumns: '38px minmax(0, 1fr) auto',
      minHeight: 58,
      padding: '9px 10px',
      textAlign: 'left',
      width: '100%',
    },
    feePaymentOptionBadge: {
      background: 'rgba(143, 108, 255, 0.16)',
      border: '1px solid rgba(143, 108, 255, 0.22)',
      borderRadius: 999,
      color: '#dcd2ff',
      fontSize: 10,
      fontWeight: 900,
      padding: '4px 7px',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    },
    feePaymentOptionFallback: {
      alignItems: 'center',
      background: 'rgba(143, 108, 255, 0.16)',
      border: '1px solid rgba(143, 108, 255, 0.22)',
      borderRadius: 999,
      color: '#dcd2ff',
      display: 'flex',
      fontSize: 14,
      fontWeight: 900,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    feePaymentOptionImage: {
      borderRadius: 999,
      height: 38,
      objectFit: 'cover',
      width: 38,
    },
    feePaymentOptionRight: {
      alignItems: 'center',
      display: 'flex',
      gap: 6,
      justifyContent: 'flex-end',
    },
    feePaymentOptionSelected: {
      background: 'rgba(143, 108, 255, 0.12)',
      border: '1px solid rgba(143, 108, 255, 0.34)',
    },
    feePaymentOptionText: {
      display: 'grid',
      gap: 4,
      minWidth: 0,
    },
    feePaymentOptionTitle: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: 900,
      lineHeight: 1.15,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    feePaymentOptionToggle: {
      color: '#dcd2ff',
      flexShrink: 0,
      transition: 'transform 140ms ease',
    },
    feePaymentOptionValue: {
      color: 'rgba(255, 255, 255, 0.54)',
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.2,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    feePaymentPanel: {
      background: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 8,
      display: 'grid',
      gap: 8,
      padding: 12,
    },
    errorMessage: {
      background: 'rgba(255, 54, 108, 0.1)',
      border: '1px solid rgba(255, 54, 108, 0.22)',
      borderRadius: 8,
      color: '#ff9ab8',
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.4,
      margin: 0,
      padding: 10,
    },
    header: {
      alignItems: 'center',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      gap: 12,
      justifyContent: 'space-between',
      minHeight: 64,
      padding: '12px 16px',
    },
    originLabel: {
      color: 'rgba(255, 255, 255, 0.48)',
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1.2,
      textTransform: 'uppercase',
    },
    originName: {
      color: '#ffffff',
      fontSize: 14,
      lineHeight: 1.35,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    params: {
      background: standalone ? 'rgba(255, 255, 255, 0.04)' : '#050507',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 8,
      color: 'rgba(255, 255, 255, 0.76)',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 11,
      lineHeight: 1.45,
      margin: 0,
      maxHeight: standalone ? 'none' : 150,
      overflow: standalone ? 'visible' : 'auto',
      padding: 12,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    pendingBadge: {
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 999,
      color: '#dcd7ff',
      flexShrink: 0,
      fontSize: 11,
      fontWeight: 800,
      padding: '5px 9px',
    },
    pendingActionButton: {
      background: 'rgba(255, 255, 255, 0.08)',
      color: 'rgba(255, 255, 255, 0.72)',
      cursor: 'default',
    },
    passcodeInput: {
      background: 'transparent',
      border: 0,
      color: '#ffffff',
      flex: 1,
      fontSize: 14,
      fontWeight: 700,
      minWidth: 0,
      outline: 'none',
      padding: 0,
    },
    passcodeWrap: {
      alignItems: 'center',
      background: 'rgba(255, 255, 255, 0.06)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: 8,
      color: '#dcd7ff',
      display: 'flex',
      gap: 10,
      minHeight: 46,
      padding: '0 12px',
    },
    rawToggle: {
      alignItems: 'center',
      background: 'transparent',
      border: 0,
      color: '#dcd7ff',
      cursor: 'pointer',
      display: 'flex',
      fontSize: 13,
      fontWeight: 800,
      justifyContent: 'space-between',
      minHeight: 32,
      padding: 0,
      width: '100%',
    },
    rejectButton: {
      background: 'rgba(255, 255, 255, 0.08)',
      color: '#ffffff',
    },
    sheet: {
      background: '#111015',
      border: standalone ? 0 : '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: standalone ? 0 : 8,
      boxShadow: standalone ? 'none' : '0 28px 90px rgba(0, 0, 0, 0.5)',
      color: '#ffffff',
      display: 'grid',
      gridTemplateRows: 'auto minmax(0, 1fr) auto',
      height: standalone ? '100vh' : undefined,
      maxHeight: standalone ? '100vh' : 'calc(100vh - 28px)',
      maxWidth: standalone ? 520 : 460,
      overflow: 'hidden',
      width: '100%',
    },
    signatureIcon: {
      background: 'rgba(76, 211, 194, 0.14)',
      color: '#7ff1df',
    },
    singleActionFooter: {
      gridTemplateColumns: '1fr',
    },
    simulationAmount: {
      fontSize: 13,
      fontWeight: 900,
      maxWidth: '100%',
      overflowWrap: 'anywhere',
      textAlign: 'right',
      wordBreak: 'break-word',
    },
    simulationAmountApprove: {
      color: '#dcd2ff',
    },
    simulationAmountReceive: {
      color: '#7ff1df',
    },
    simulationAmountSpend: {
      color: '#ffd391',
    },
    simulationAsset: {
      alignItems: 'center',
      display: 'flex',
      gap: 10,
      minWidth: 0,
    },
    simulationAssetText: {
      display: 'grid',
      gap: 2,
      minWidth: 0,
    },
    simulationChangeLabel: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: 800,
      lineHeight: 1.2,
    },
    simulationHeader: {
      alignItems: 'center',
      display: 'flex',
      justifyContent: 'space-between',
    },
    simulationLogo: {
      borderRadius: 999,
      height: 28,
      objectFit: 'cover',
      width: 28,
    },
    simulationLogoFallback: {
      alignItems: 'center',
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 999,
      color: '#dcd7ff',
      display: 'flex',
      fontSize: 12,
      fontWeight: 900,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    simulationMuted: {
      color: 'rgba(255, 255, 255, 0.58)',
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.4,
      margin: 0,
    },
    simulationPanel: {
      background: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: 8,
      display: 'grid',
      gap: 10,
      padding: 12,
    },
    simulationRow: {
      alignItems: 'center',
      display: 'grid',
      gap: 10,
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 48%)',
      minHeight: 36,
    },
    simulationRows: {
      display: 'grid',
      gap: 8,
    },
    simulationTokenName: {
      color: 'rgba(255, 255, 255, 0.52)',
      fontSize: 12,
      fontWeight: 700,
      lineHeight: 1.2,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    summaryIcon: {
      alignItems: 'center',
      borderRadius: 8,
      display: 'flex',
      height: 52,
      justifyContent: 'center',
      justifySelf: 'center',
      width: 52,
    },
    summaryText: {
      display: 'grid',
      gap: 5,
      justifyItems: 'center',
    },
    spinnerIcon: {
      animation: 'pillarx-approval-spin 900ms linear infinite',
    },
    statusContent: {
      alignContent: 'center',
      gap: 18,
      justifyItems: 'stretch',
      overflow: 'hidden',
      padding: standalone ? '40px 24px' : '28px 18px',
    },
    statusIcon: {
      alignItems: 'center',
      borderRadius: 999,
      display: 'flex',
      height: 112,
      justifyContent: 'center',
      justifySelf: 'center',
      width: 112,
    },
    statusIconError: {
      background: 'rgba(255, 54, 108, 0.12)',
      border: '1px solid rgba(255, 54, 108, 0.24)',
      color: '#ff8fac',
    },
    statusIconSubmitting: {
      background: 'rgba(143, 108, 255, 0.14)',
      border: '1px solid rgba(143, 108, 255, 0.26)',
      color: '#bba6ff',
    },
    statusIconSuccess: {
      background: 'rgba(76, 211, 194, 0.14)',
      border: '1px solid rgba(76, 211, 194, 0.26)',
      color: '#7ff1df',
    },
    title: {
      color: '#ffffff',
      fontSize: 22,
      fontWeight: 900,
      lineHeight: 1.12,
      margin: 0,
      textAlign: 'center',
    },
    transactionIcon: {
      background: 'rgba(143, 108, 255, 0.16)',
      color: '#bba6ff',
    },
    unlockLabel: {
      color: 'rgba(255, 255, 255, 0.56)',
      fontSize: 12,
      fontWeight: 800,
    },
    unlockPanel: {
      display: 'grid',
      gap: 8,
    },
    warning: {
      alignItems: 'center',
      background: 'rgba(255, 195, 92, 0.1)',
      border: '1px solid rgba(255, 195, 92, 0.18)',
      borderRadius: 8,
      color: '#ffd391',
      display: 'flex',
      fontSize: 12,
      fontWeight: 700,
      gap: 8,
      lineHeight: 1.35,
      padding: 10,
    },
  };
}
