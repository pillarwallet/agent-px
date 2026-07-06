import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileSignature,
  Globe2,
  KeyRound,
  Send,
  X,
} from 'lucide-react';
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';

import {
  PILLARX_PROVIDER_APPROVAL_GET_PENDING,
  PILLARX_PROVIDER_APPROVAL_RESPOND,
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

type ProviderApprovalOverlayProps = {
  closeWhenSettled?: boolean;
  standalone?: boolean;
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  100: 'Gnosis',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum',
  11155111: 'Sepolia',
};

const CHAIN_NATIVE_SYMBOLS: Record<number, string> = {
  1: 'ETH',
  10: 'ETH',
  56: 'BNB',
  100: 'XDAI',
  137: 'POL',
  8453: 'ETH',
  42161: 'ETH',
  11155111: 'ETH',
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

const respondToApproval = (id: string, approved: boolean) =>
  sendRuntimeMessage({
    type: PILLARX_PROVIDER_APPROVAL_RESPOND,
    id,
    approved,
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

const getSimulationLabel = (direction: SimulationChange['direction']) =>
  direction === 'spend' ? 'You spend' : 'You receive';

const getSimulationAmount = (change: SimulationChange) => {
  const amount = change.amount ?? '';
  const symbol = change.symbol ?? change.name ?? change.assetType ?? 'Asset';
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
    request.method === 'eth_signTransaction'
  ) {
    const tx = getTransactionPreview(request);
    const dataLength = tx.data ? Math.max((tx.data.length - 2) / 2, 0) : 0;

    return {
      description:
        request.method === 'eth_sendTransaction'
          ? 'Confirm this on-chain request'
          : 'Confirm this transaction signature',
      icon: <Send size={22} strokeWidth={2.2} />,
      rows: [
        { label: 'Network', value: CHAIN_NAMES[request.chainId] ?? 'Unknown' },
        { label: 'From', value: shortAddress(tx.from ?? request.account) },
        { label: 'To', value: shortAddress(tx.to) },
        { label: 'Value', value: formatValue(tx.value, request.chainId) },
        {
          label: 'Estimated fee',
          value: request.estimatedFee?.formatted ?? 'Unavailable',
        },
        { label: 'Data', value: dataLength ? `${dataLength} bytes` : 'None' },
      ],
      title:
        request.method === 'eth_sendTransaction'
          ? 'Send Transaction'
          : 'Sign Transaction',
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
  const activeRequest = pending[0];
  const isConnectRequest = activeRequest?.method === 'eth_requestAccounts';
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
  }, [activeRequest?.id]);

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

      await respondToApproval(activeRequest.id, approved);
      const nextPending = await refreshPending();

      if (closeWhenSettled && nextPending.length === 0) {
        window.setTimeout(() => window.close(), 100);
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
                ...(change.direction === 'receive'
                  ? styles.simulationAmountReceive
                  : styles.simulationAmountSpend),
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

  return (
    <div style={styles.backdrop}>
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
                transform: showRawPayload ? 'rotate(180deg)' : 'rotate(0deg)',
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
    simulationAmount: {
      fontSize: 13,
      fontWeight: 900,
      overflowWrap: 'anywhere',
      textAlign: 'right',
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
      gridTemplateColumns: 'minmax(0, 1fr) auto',
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
