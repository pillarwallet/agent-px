/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-nested-ternary */
import {
  Add,
  ArrowLeft2,
  Copy as CopyIcon,
  CopySuccess as CopySuccessIcon,
  NotificationBing,
  ShieldTick,
  Trash,
} from 'iconsax-react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import styled from 'styled-components';
import {
  formatUnits,
  getAddress,
  isAddressEqual,
  parseUnits,
  type Hex,
} from 'viem';

import arbitrumLogo from '../../assets/images/logo-arbitrum.png';
import baseLogo from '../../assets/images/logo-base.png';
import bscLogo from '../../assets/images/logo-bsc.png';
import ethereumLogo from '../../assets/images/logo-ethereum.png';
import optimismLogo from '../../assets/images/logo-optimism.png';
import polygonLogo from '../../assets/images/logo-polygon.png';
import RandomAvatar from '../../apps/pillarx-app/components/RandomAvatar/RandomAvatar';
import { useAuthAccount } from '../../hooks/useAuthAccount';
import useTransactionKit from '../../hooks/useTransactionKit';
import useCreateAlert from '../../hooks/useCreateAlert';
import useWalletApproval from '../../hooks/useWalletApproval';
import {
  AutomationOrder,
  TradingPolicy,
  useConfirmPolicyInstallationMutation,
  useCreatePolicyMutation,
  useDeleteOrderMutation,
  useGetPoliciesQuery,
  useListOrdersMutation,
  usePreparePolicyInstallationMutation,
} from '../../services/automationApi';
import { AUTOMATION_ALERTS_CHANGED } from '../../utils/automationAlerts';
import { getBlockScan } from '../../utils/blockchain';
import {
  getEIP7702AuthorizationIfNeeded,
  OUR_EIP7702_IMPLEMENTATION_ADDRESS,
} from '../../utils/eip7702Authorization';

type AutomationsModalProps = { isContentVisible: boolean };
type AutomationView = 'alerts' | 'policies';

const SUPPORTED_CHAINS = [
  {
    id: 1,
    name: 'Ethereum',
    logo: ethereumLogo,
    usdcAddress: '0xA0b86991c6218B36c1d19D4a2e9Eb0cE3606eB48',
  },
  {
    id: 137,
    name: 'Polygon',
    logo: polygonLogo,
    usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  {
    id: 10,
    name: 'Optimism',
    logo: optimismLogo,
    usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  {
    id: 8453,
    name: 'Base',
    logo: baseLogo,
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  {
    id: 42161,
    name: 'Arbitrum',
    logo: arbitrumLogo,
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  {
    id: 56,
    name: 'BNB Smart Chain',
    logo: bscLogo,
    usdcAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  },
] as const;

const formatApiError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return 'Unable to complete request.';
  const response = error as {
    data?: { error?: string; issues?: { message?: string }[] };
  };
  return (
    response.data?.issues?.[0]?.message ||
    response.data?.error?.replaceAll('_', ' ').toLowerCase() ||
    'Unable to complete request.'
  );
};

const formatUsdc = (value: string | undefined, chainId: number) => {
  if (value === undefined || value === '') return undefined;

  const decimals = chainId === 56 ? 18 : 6;
  try {
    const amount = Number(formatUnits(BigInt(value), decimals));
    return Number.isFinite(amount)
      ? `${amount.toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })} USDC`
      : value;
  } catch {
    return undefined;
  }
};

const getRemainingPolicyBalance = (policy: TradingPolicy) =>
  policy.remainingUsdcLimit ??
  policy.remainingUsdcBalance ??
  policy.remainingUsdc ??
  policy.remainingBalance ??
  policy.availableUsdcLimit;

const formatOrderExpiry = (expiresAt: string) => {
  const remainingMilliseconds = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
    return undefined;
  }

  const remainingMinutes = Math.ceil(remainingMilliseconds / 60_000);
  if (remainingMinutes < 60) return `Expires in ${remainingMinutes}m`;

  const remainingHours = Math.ceil(remainingMilliseconds / 3_600_000);
  if (remainingHours < 24) return `Expires in ${remainingHours}h`;

  return `Expires in ${Math.ceil(remainingMilliseconds / 86_400_000)}d`;
};

type InstallationStage =
  | 'preparing'
  | 'estimating'
  | 'confirming'
  | 'verifying';

const INSTALLATION_STAGE_LABELS: Record<InstallationStage, string> = {
  preparing: 'Preparing…',
  estimating: 'Estimating…',
  confirming: 'Confirming…',
  verifying: 'Activating…',
};

const getDefaultPolicyExpiry = () => {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  const year = expiry.getFullYear();
  const month = String(expiry.getMonth() + 1).padStart(2, '0');
  const day = String(expiry.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PolicyRow = ({
  policy,
  installationStage,
  installationError,
  onInstall,
}: {
  policy: TradingPolicy;
  installationStage?: InstallationStage;
  installationError?: string;
  onInstall: (policy: TradingPolicy) => void;
}) => {
  const remainingUsdc = formatUsdc(
    getRemainingPolicyBalance(policy),
    policy.chainId
  );
  return (
    <PolicyCard>
      <PolicyRowMain>
        <PolicyDetails>
          <PolicyName>{policy.name}</PolicyName>
          <PolicyMeta>Balance: {remainingUsdc || '—'}</PolicyMeta>
        </PolicyDetails>
        {policy.status === 'DRAFT' ||
        policy.status === 'AWAITING_INSTALLATION' ? (
          <InstallButton
            type="button"
            disabled={Boolean(installationStage)}
            onClick={() => onInstall(policy)}
          >
            {installationStage
              ? INSTALLATION_STAGE_LABELS[installationStage]
              : 'Install'}
          </InstallButton>
        ) : (
          <Status $status={policy.status}>
            {policy.status.replaceAll('_', ' ')}
          </Status>
        )}
      </PolicyRowMain>
      {installationError && (
        <PolicyError role="alert">{installationError}</PolicyError>
      )}
    </PolicyCard>
  );
};

const AlertRow = ({
  order,
  onDeleted,
}: {
  order: AutomationOrder;
  onDeleted: (orderId: string) => void;
}) => {
  const [isTokenAddressCopied, setIsTokenAddressCopied] = useState(false);
  const [hasTokenLogoError, setHasTokenLogoError] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteOrder, { isLoading: isDeleting }] = useDeleteOrderMutation();
  const decimals = order.chainId === 56 ? 18 : 6;
  const amount = formatUnits(BigInt(order.amountIn), decimals);
  const condition = order.maxPrice
    ? `Below $${order.maxPrice}`
    : `Above $${order.minPrice}`;
  const token =
    order.tokenOut.kind === 'native'
      ? 'Native token'
      : `${order.tokenOut.address.slice(0, 6)}…${order.tokenOut.address.slice(-4)}`;
  const tokenName =
    order.tokenOut.kind === 'erc20'
      ? order.tokenOut.name || order.tokenOut.symbol || token
      : token;
  const tokenSymbol =
    order.tokenOut.kind === 'erc20' ? order.tokenOut.symbol : undefined;
  const tokenLogoUrl =
    order.tokenOut.kind === 'erc20' ? order.tokenOut.logoUrl : undefined;
  const isLiveOrder = ![
    'FILLED',
    'CANCELLED',
    'EXPIRED',
    'REJECTED',
    'FAILED',
  ].includes(order.status);
  const expiryLabel = isLiveOrder
    ? formatOrderExpiry(order.expiresAt)
    : undefined;

  useEffect(() => {
    if (!isTokenAddressCopied) return undefined;
    const timeout = window.setTimeout(
      () => setIsTokenAddressCopied(false),
      1500
    );
    return () => window.clearTimeout(timeout);
  }, [isTokenAddressCopied]);

  const canDelete = order.status === 'ACTIVE' || order.status === 'FAILED';
  const confirmDelete = async () => {
    setDeleteError('');
    try {
      await deleteOrder({ orderId: order.id }).unwrap();
      onDeleted(order.id);
    } catch (error) {
      setDeleteError(formatApiError(error));
      setIsConfirmingDelete(false);
    }
  };

  return (
    <PolicyCard>
      <PolicyRowMain>
        <OrderDetails>
          <OrderTokenIdentity>
            {tokenLogoUrl && !hasTokenLogoError ? (
              <OrderTokenLogo
                src={tokenLogoUrl}
                alt=""
                onError={() => setHasTokenLogoError(true)}
              />
            ) : (
              <OrderTokenAvatar>
                <RandomAvatar name={tokenName || token} isRound />
              </OrderTokenAvatar>
            )}
            <OrderTokenDetails>
              <TokenLine>
                <PolicyName>{tokenName}</PolicyName>
              </TokenLine>
              {order.tokenOut.kind === 'erc20' && (
                <TokenAddressLine title={order.tokenOut.address}>
                  {tokenSymbol && (
                    <TokenSymbolText>{tokenSymbol}</TokenSymbolText>
                  )}
                  {tokenSymbol && <TokenMetaSeparator>·</TokenMetaSeparator>}
                  <span>{token}</span>
                  <CopyToClipboard
                    text={order.tokenOut.address}
                    onCopy={() => setIsTokenAddressCopied(true)}
                  >
                    <TokenCopyButton
                      type="button"
                      aria-label="Copy token contract address"
                      title={
                        isTokenAddressCopied
                          ? 'Token address copied'
                          : 'Copy token contract address'
                      }
                    >
                      {isTokenAddressCopied ? (
                        <CopySuccessIcon size={14} />
                      ) : (
                        <CopyIcon size={14} />
                      )}
                    </TokenCopyButton>
                  </CopyToClipboard>
                </TokenAddressLine>
              )}
            </OrderTokenDetails>
          </OrderTokenIdentity>
        </OrderDetails>
        <OrderCardControls>
          <OrderStatus $status={order.status}>
            {order.status.replaceAll('_', ' ')}
          </OrderStatus>
          {canDelete && !isConfirmingDelete && (
            <DeleteOrderButton
              type="button"
              aria-label="Delete order"
              title="Delete order"
              onClick={() => setIsConfirmingDelete(true)}
            >
              <Trash size={15} />
            </DeleteOrderButton>
          )}
        </OrderCardControls>
      </PolicyRowMain>
      <OrderSummary>
        <OrderSummaryMain>
          <span>{amount} USDC</span>
          <OrderSummarySeparator>·</OrderSummarySeparator>
          <span>{condition}</span>
        </OrderSummaryMain>
        {expiryLabel && <OrderExpiry>{expiryLabel}</OrderExpiry>}
      </OrderSummary>
      {canDelete && isConfirmingDelete && (
        <OrderActions>
          <DeleteConfirmation>
            <DeletePrompt>Delete this order?</DeletePrompt>
            <DeleteCancelButton
              type="button"
              disabled={isDeleting}
              onClick={() => setIsConfirmingDelete(false)}
            >
              Cancel
            </DeleteCancelButton>
            <DeleteConfirmButton
              type="button"
              disabled={isDeleting}
              onClick={confirmDelete}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </DeleteConfirmButton>
          </DeleteConfirmation>
        </OrderActions>
      )}
      {deleteError && <PolicyError role="alert">{deleteError}</PolicyError>}
    </PolicyCard>
  );
};

const AutomationsModal = ({ isContentVisible }: AutomationsModalProps) => {
  const { walletAddress } = useAuthAccount();
  const { kit } = useTransactionKit();
  const { requestApproval } = useWalletApproval();
  const { openCreateAlert } = useCreateAlert();
  const [view, setView] = useState<AutomationView>('alerts');
  const [showCreatePolicy, setShowCreatePolicy] = useState(false);
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('100');
  const [selectedChainId, setSelectedChainId] = useState(8453);
  const [validUntil, setValidUntil] = useState(getDefaultPolicyExpiry);
  const [formError, setFormError] = useState('');
  const [isChainSelectOpen, setIsChainSelectOpen] = useState(false);
  const [installingPolicies, setInstallingPolicies] = useState<
    Record<string, InstallationStage>
  >({});
  const [installationErrors, setInstallationErrors] = useState<
    Record<string, string>
  >({});
  const [alerts, setAlerts] = useState<AutomationOrder[]>([]);
  const [alertsError, setAlertsError] = useState('');
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const chainSelectRef = useRef<HTMLDivElement>(null);
  const alertsRequestRef = useRef(0);
  const lastAlertsLoadKeyRef = useRef('');
  const [createPolicy, { isLoading: isCreating }] = useCreatePolicyMutation();
  const [listOrders] = useListOrdersMutation();
  const [preparePolicyInstallation] = usePreparePolicyInstallationMutation();
  const [confirmPolicyInstallation] = useConfirmPolicyInstallationMutation();
  const { currentData: policiesData, isFetching: isLoadingPolicies } =
    useGetPoliciesQuery(
      { walletAddress: walletAddress || '', chainId: selectedChainId },
      { skip: !walletAddress || !isContentVisible }
    );
  const policies = policiesData?.policies || [];
  const hasPolicies = policies.length > 0;

  useEffect(() => {
    if (!isLoadingPolicies && policiesData && !hasPolicies) {
      setView('policies');
      setAlerts([]);
    }
  }, [hasPolicies, isLoadingPolicies, policiesData]);

  const minimumExpiry = useMemo(
    () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    []
  );
  const selectedChain =
    SUPPORTED_CHAINS.find((chain) => chain.id === selectedChainId) ||
    SUPPORTED_CHAINS[0];
  const isFutureDate = validUntil >= minimumExpiry;
  const canCreatePolicy =
    !!walletAddress &&
    name.trim().length > 0 &&
    Number(budget) > 0 &&
    isFutureDate &&
    !isCreating;

  const loadAlerts = useCallback(async () => {
    if (!walletAddress) {
      setAlerts([]);
      return;
    }

    const requestId = alertsRequestRef.current + 1;
    alertsRequestRef.current = requestId;
    setAlertsError('');
    setIsLoadingAlerts(true);

    try {
      const checksummedWalletAddress = getAddress(walletAddress);
      const response = await listOrders({
        walletAddress: checksummedWalletAddress,
        chainId: selectedChainId,
      }).unwrap();
      const nextAlerts = response.orders
        .filter((order) => order.chainId === selectedChainId)
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime()
        );

      if (alertsRequestRef.current === requestId) setAlerts(nextAlerts);
    } catch (error) {
      if (alertsRequestRef.current === requestId) {
        setAlertsError(formatApiError(error));
      }
    } finally {
      if (alertsRequestRef.current === requestId) setIsLoadingAlerts(false);
    }
  }, [listOrders, selectedChainId, walletAddress]);

  useEffect(() => {
    if (
      !isContentVisible ||
      view !== 'alerts' ||
      !walletAddress ||
      !hasPolicies
    ) {
      lastAlertsLoadKeyRef.current = '';
      return undefined;
    }

    const loadKey = `${walletAddress.toLowerCase()}:${selectedChainId}`;
    if (lastAlertsLoadKeyRef.current !== loadKey) {
      lastAlertsLoadKeyRef.current = loadKey;
      loadAlerts();
    }

    const refreshAlerts = () => loadAlerts();
    window.addEventListener(AUTOMATION_ALERTS_CHANGED, refreshAlerts);
    return () => {
      window.removeEventListener(AUTOMATION_ALERTS_CHANGED, refreshAlerts);
    };
  }, [
    hasPolicies,
    isContentVisible,
    loadAlerts,
    selectedChainId,
    view,
    walletAddress,
  ]);

  useEffect(() => {
    if (!isChainSelectOpen) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!chainSelectRef.current?.contains(event.target as Node)) {
        setIsChainSelectOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isChainSelectOpen]);

  const submitPolicy = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!walletAddress) {
      setFormError('Unlock your wallet before creating a policy.');
      return;
    }

    try {
      await createPolicy({
        walletAddress,
        chainId: selectedChainId,
        name: name.trim(),
        cumulativeUsdcLimit: parseUnits(budget, 6).toString(),
        providerIds: ['0x-allowance-holder'],
        validUntil: new Date(`${validUntil}T23:59:59.000Z`).toISOString(),
      }).unwrap();
      setName('');
      setBudget('100');
      setValidUntil(getDefaultPolicyExpiry());
      setShowCreatePolicy(false);
    } catch (error) {
      setFormError(formatApiError(error));
    }
  };

  const prepareInstallation = async (policy: TradingPolicy) => {
    const setStage = (stage: InstallationStage) =>
      setInstallingPolicies((current) => ({
        ...current,
        [policy.id]: stage,
      }));

    setInstallationErrors((current) => ({
      ...current,
      [policy.id]: '',
    }));
    setStage('preparing');

    try {
      if (
        !walletAddress ||
        !isAddressEqual(walletAddress, policy.walletAddress)
      ) {
        throw new Error('Connect the wallet that owns this policy.');
      }

      const prepared = await preparePolicyInstallation({
        policyId: policy.id,
      }).unwrap();

      setStage('estimating');
      const authorization = await getEIP7702AuthorizationIfNeeded(
        kit,
        policy.chainId,
        { authorizationExecutor: 'self' }
      );

      if (!authorization) {
        const delegation = await kit.getDelegateSmartAccountToEoaStatus(
          policy.chainId
        );
        if (
          !delegation.isDelegated ||
          delegation.delegateAddress?.toLowerCase() !==
            OUR_EIP7702_IMPLEMENTATION_ADDRESS.toLowerCase()
        ) {
          throw new Error('Kernel delegation could not be authorized.');
        }
      }

      const transaction = {
        chainId: policy.chainId,
        to: getAddress(policy.walletAddress),
        value: '0',
        data: prepared.authorization.installation.callData,
        authorization: authorization || undefined,
        executionMode: 'raw' as const,
      };
      const estimate = await kit.estimateEoaTransaction(transaction);
      if (!estimate.isEstimatedSuccessfully || estimate.errorMessage) {
        throw new Error(
          estimate.errorMessage || 'Installation gas estimation failed.'
        );
      }

      const chain = SUPPORTED_CHAINS.find((item) => item.id === policy.chainId);
      const nativeSymbol =
        policy.chainId === 137 ? 'POL' : policy.chainId === 56 ? 'BNB' : 'ETH';
      const estimatedFee = estimate.cost
        ? `${Number(formatUnits(estimate.cost, 18)).toLocaleString(undefined, {
            maximumSignificantDigits: 6,
          })} ${nativeSymbol}`
        : undefined;
      const approved = await requestApproval({
        type: 'transaction',
        title: 'Install trading policy',
        description: `Install “${policy.name}” on your wallet.`,
        source: 'Smart Trades',
        network: chain?.name || `${policy.chainId}`,
        account: policy.walletAddress,
        to: transaction.to,
        value: `0 ${nativeSymbol}`,
        estimatedFee,
        data: transaction.data,
        confirmLabel: 'Approve installation',
        warning: 'This approval submits an on-chain transaction.',
      });
      if (!approved) return;

      setStage('confirming');
      const result = await kit.sendEoaTransaction({
        ...transaction,
        gas: estimate.gas,
        maxFeePerGas: estimate.maxFeePerGas,
        maxPriorityFeePerGas: estimate.maxPriorityFeePerGas,
      });
      if (!result.isSentSuccessfully || !result.transactionHash) {
        throw new Error(
          result.errorMessage || 'Installation was not submitted.'
        );
      }

      const receipt = await kit.waitForEoaTransactionReceipt({
        chainId: policy.chainId,
        transactionHash: result.transactionHash,
      });
      if (!receipt.isConfirmed || receipt.status !== 'success') {
        throw new Error(
          receipt.errorMessage || 'The installation transaction reverted.'
        );
      }

      setInstallingPolicies((current) => ({
        ...current,
        [policy.id]: 'verifying',
      }));
      let isActive = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const verification = await confirmPolicyInstallation({
          policyId: policy.id,
          transactionHash: result.transactionHash as Hex,
        }).unwrap();
        if (
          verification.policy.status === 'ACTIVE' ||
          verification.installation.status === 'VERIFIED'
        ) {
          isActive = true;
          break;
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2000);
        });
      }
      if (!isActive) {
        throw new Error('Installation verification is taking too long.');
      }
    } catch (error) {
      setInstallationErrors((current) => ({
        ...current,
        [policy.id]: formatApiError(error),
      }));
    } finally {
      setInstallingPolicies((current) => {
        const next = { ...current };
        delete next[policy.id];
        return next;
      });
    }
  };

  if (showCreatePolicy) {
    return (
      <Content aria-hidden={!isContentVisible}>
        <BackButton type="button" onClick={() => setShowCreatePolicy(false)}>
          <ArrowLeft2 size={18} /> Policies
        </BackButton>
        <Header>
          <Title>Create policy</Title>
          <Subtitle>
            Set the total USDC budget available to smart trades.
          </Subtitle>
        </Header>
        <Form onSubmit={submitPolicy} noValidate>
          <Field>
            <Label htmlFor="policy-name">Policy name</Label>
            <Input
              id="policy-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`${selectedChain.name} token buys`}
              maxLength={80}
            />
          </Field>
          <Field>
            <Label htmlFor="policy-budget">Cumulative budget</Label>
            <InputGroup>
              <Input
                id="policy-budget"
                type="number"
                inputMode="decimal"
                min="0.000001"
                step="0.000001"
                value={budget}
                onChange={(event) => {
                  const nextBudget = event.target.value;
                  if (/^\d*(\.\d{0,6})?$/u.test(nextBudget)) {
                    setBudget(nextBudget);
                  }
                }}
                placeholder="100"
              />
              <Unit>USDC</Unit>
            </InputGroup>
            <ContractRow>
              <ContractLabel>
                <ContractChainLogo src={selectedChain.logo} alt="" />
                USDC Token
              </ContractLabel>
              <ContractExplorerLink
                href={`${getBlockScan(selectedChain.id, true)}${selectedChain.usdcAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View USDC contract on ${selectedChain.name} block explorer`}
              >
                <ContractAddress>
                  {selectedChain.usdcAddress.slice(0, 6)}…
                  {selectedChain.usdcAddress.slice(-4)}
                </ContractAddress>
                <ExternalLink size={14} />
              </ContractExplorerLink>
            </ContractRow>
          </Field>
          <Field>
            <Label htmlFor="policy-expiry">Valid until</Label>
            <Input
              id="policy-expiry"
              type="date"
              min={minimumExpiry}
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </Field>
          <ProviderNote>Trading provider: 0x</ProviderNote>
          {formError && <ErrorText role="alert">{formError}</ErrorText>}
          <PrimaryButton type="submit" disabled={!canCreatePolicy}>
            {isCreating ? 'Creating…' : 'Create policy'}
          </PrimaryButton>
        </Form>
      </Content>
    );
  }

  const isAlertsView = view === 'alerts' && hasPolicies;

  return (
    <Content aria-hidden={!isContentVisible}>
      <Header>
        <Title>Smart Trades</Title>
        <Subtitle>Monitor markets and automate token purchases.</Subtitle>
      </Header>
      <AutomationToolbar>
        <AutomationChainSelect ref={chainSelectRef}>
          <ChainSelectButton
            type="button"
            aria-label="Select smart trades network"
            aria-expanded={isChainSelectOpen}
            onClick={() => setIsChainSelectOpen((open) => !open)}
          >
            <ChainLogo src={selectedChain.logo} alt="" />
            <ChainName>{selectedChain.name}</ChainName>
            <ChevronDown
              aria-hidden
              size={17}
              style={{
                transform: isChainSelectOpen
                  ? 'rotate(180deg)'
                  : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}
            />
          </ChainSelectButton>
          {isChainSelectOpen && (
            <ChainOptions>
              {SUPPORTED_CHAINS.map((chain) => (
                <ChainOption
                  key={chain.id}
                  type="button"
                  $selected={chain.id === selectedChainId}
                  onClick={() => {
                    setSelectedChainId(chain.id);
                    setIsChainSelectOpen(false);
                  }}
                >
                  <ChainLogo src={chain.logo} alt="" />
                  {chain.name}
                </ChainOption>
              ))}
            </ChainOptions>
          )}
        </AutomationChainSelect>
        {!isLoadingPolicies && hasPolicies ? (
          <Tabs aria-label="Smart Trade sections">
            <Tab
              type="button"
              $active={isAlertsView}
              onClick={() => setView('alerts')}
            >
              Orders
            </Tab>
            <Tab
              type="button"
              $active={!isAlertsView}
              onClick={() => setView('policies')}
            >
              Policies
            </Tab>
          </Tabs>
        ) : null}
      </AutomationToolbar>
      {isAlertsView && isLoadingAlerts ? (
        <LoadingText>Loading orders…</LoadingText>
      ) : isAlertsView && alertsError ? (
        <EmptyState>
          <EmptyIcon>
            <NotificationBing size={25} />
          </EmptyIcon>
          <EmptyTitle>Unable to load orders</EmptyTitle>
          <EmptyText>{alertsError}</EmptyText>
          <RetryButton type="button" onClick={loadAlerts}>
            Try again
          </RetryButton>
        </EmptyState>
      ) : isAlertsView && alerts.length > 0 ? (
        <PolicyList>
          {alerts.map((order) => (
            <AlertRow
              key={order.id}
              order={order}
              onDeleted={(orderId) =>
                setAlerts((current) =>
                  current.filter((alert) => alert.id !== orderId)
                )
              }
            />
          ))}
        </PolicyList>
      ) : isAlertsView || (!isLoadingPolicies && policies.length === 0) ? (
        <EmptyState>
          <EmptyIcon>
            {isAlertsView ? (
              <NotificationBing size={25} />
            ) : (
              <ShieldTick size={25} />
            )}
          </EmptyIcon>
          <EmptyTitle>
            {isAlertsView ? 'No orders yet' : 'No policies yet'}
          </EmptyTitle>
          <EmptyText>
            {isAlertsView
              ? 'Create an order to buy a token when your price condition is met.'
              : 'Create a policy to set the budget and providers your orders can use.'}
          </EmptyText>
        </EmptyState>
      ) : isLoadingPolicies ? (
        <LoadingText>Loading policies…</LoadingText>
      ) : (
        <PolicyList>
          {policies.map((policy) => (
            <PolicyRow
              key={policy.id}
              policy={policy}
              installationStage={installingPolicies[policy.id]}
              installationError={installationErrors[policy.id]}
              onInstall={prepareInstallation}
            />
          ))}
        </PolicyList>
      )}
      {isAlertsView ? (
        <SectionAction
          type="button"
          onClick={() => openCreateAlert({ chainId: selectedChainId })}
        >
          <Add size={17} /> Create order
        </SectionAction>
      ) : (
        <SectionAction
          type="button"
          onClick={() => {
            setName('');
            setBudget('100');
            setValidUntil(getDefaultPolicyExpiry());
            setShowCreatePolicy(true);
          }}
        >
          <Add size={17} /> Create policy
        </SectionAction>
      )}
    </Content>
  );
};

const Content = styled.section`
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  color: #ffffff;
  font-family: inherit;
`;
const Header = styled.header`
  text-align: left;
`;
const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0;
`;
const Subtitle = styled.p`
  margin: 6px 0 0;
  color: #a9a5b3;
  font-size: 13px;
  line-height: 1.4;
  letter-spacing: 0;
`;
const Tabs = styled.div`
  min-width: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid #2e2938;
  border-radius: 8px;
  background: #111014;
`;
const AutomationToolbar = styled.div`
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-top: 18px;
`;
const AutomationChainSelect = styled.div`
  position: relative;
  min-width: 145px;
  flex: 0 1 42%;

  &:only-child {
    flex: 1;
  }
`;
const Tab = styled.button<{ $active: boolean }>`
  min-height: 38px;
  border: 0;
  border-radius: 6px;
  background: ${({ $active }) => ($active ? '#24202d' : 'transparent')};
  color: ${({ $active }) => ($active ? '#ffffff' : '#8f8b96')};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`;
const SectionAction = styled.button`
  width: 100%;
  min-height: 42px;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 7px;
  background: #8a77ff;
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
`;
const EmptyState = styled.div`
  min-height: 190px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 12px 16px;
  text-align: center;
`;
const EmptyIcon = styled.div`
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #241d3a;
  color: #a78bfa;
`;
const EmptyTitle = styled.h3`
  margin: 14px 0 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0;
`;
const EmptyText = styled.p`
  max-width: 270px;
  margin: 7px 0 0;
  color: #96919f;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0;
`;
const RetryButton = styled.button`
  min-height: 34px;
  margin-top: 14px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  background: #8a77ff;
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
`;
const LoadingText = styled.p`
  margin: 32px 0;
  color: #96919f;
  text-align: center;
  font-size: 13px;
`;
const PolicyList = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 14px;
`;
const PolicyCard = styled.div`
  padding: 13px;
  border: 1px solid #302b38;
  border-radius: 7px;
  background: #1d1a22;
`;
const PolicyRowMain = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;
const PolicyDetails = styled.div`
  min-width: 0;
`;
const OrderDetails = styled.div`
  min-width: 0;
  flex: 1;
`;
const OrderTokenIdentity = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
`;
const OrderTokenLogo = styled.img`
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
`;
const OrderTokenAvatar = styled.div`
  width: 34px;
  height: 34px;
  flex: none;
  overflow: hidden;
  border-radius: 50%;

  svg {
    width: 100%;
    height: 100%;
  }
`;
const OrderTokenDetails = styled.div`
  min-width: 0;
`;
const TokenLine = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
`;
const TokenSymbolText = styled.span`
  flex: none;
  color: #96919f;
  font-size: 10px;
  font-weight: 650;
`;
const TokenMetaSeparator = styled.span`
  color: #5f5966;
`;
const TokenAddressLine = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 2px;
  color: #817b89;
  font-family: monospace;
  font-size: 10px;
`;
const OrderSummary = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0 0 43px;
  overflow: hidden;
  color: #aaa5b1;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const OrderSummaryMain = styled.span`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
`;
const OrderSummarySeparator = styled.span`
  color: #5f5966;
`;
const OrderExpiry = styled.span`
  flex: none;
  color: #817b89;
  font-size: 9px;
`;
const TokenCopyButton = styled.button`
  width: 24px;
  height: 24px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #aaa5b1;
  cursor: pointer;

  &:hover {
    background: #2b2634;
    color: #fff;
  }
`;
const PolicyName = styled.p`
  margin: 0;
  overflow: hidden;
  color: #fff;
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const PolicyMeta = styled.p`
  margin: 5px 0 0;
  color: #96919f;
  font-size: 11px;
`;
const Status = styled.span<{ $status: TradingPolicy['status'] }>`
  flex: none;
  padding: 5px 7px;
  border-radius: 5px;
  background: ${({ $status }) =>
    $status === 'ACTIVE' ? '#153a2c' : '#2b2634'};
  color: ${({ $status }) => ($status === 'ACTIVE' ? '#70e1ad' : '#b5acbf')};
  font-size: 9px;
  font-weight: 700;
  text-transform: capitalize;
`;
const OrderStatus = styled.span<{ $status: AutomationOrder['status'] }>`
  flex: none;
  max-width: 92px;
  padding: 5px 7px;
  overflow: hidden;
  border-radius: 5px;
  background: ${({ $status }) => {
    if ($status === 'FILLED') return '#153a2c';
    if ($status === 'FAILED') return '#46202a';
    if ($status === 'ACTIVE' || $status === 'SUBMITTED') return '#493d1d';
    if ($status === 'CANCELLED') return '#2b2930';
    return '#2b2634';
  }};
  color: ${({ $status }) => {
    if ($status === 'FILLED') return '#70e1ad';
    if ($status === 'FAILED') return '#ff8fab';
    if ($status === 'ACTIVE' || $status === 'SUBMITTED') return '#f2ce68';
    if ($status === 'CANCELLED') return '#aaa5b1';
    return '#b5acbf';
  }};
  font-size: 9px;
  font-weight: 700;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
`;
const OrderActions = styled.div`
  min-height: 30px;
  margin-top: 10px;
  padding-top: 9px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #302b38;
`;
const OrderCardControls = styled.div`
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
`;
const DeleteOrderButton = styled.button`
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #c2bdc8;
  cursor: pointer;

  &:hover {
    background: #30242d;
    color: #ff8fab;
  }
`;
const DeleteConfirmation = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
`;
const DeletePrompt = styled.span`
  margin-right: auto;
  color: #c2bdc8;
  font-size: 11px;
`;
const DeleteCancelButton = styled.button`
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid #3a3540;
  border-radius: 5px;
  background: transparent;
  color: #c2bdc8;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
`;
const DeleteConfirmButton = styled.button`
  min-height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 5px;
  background: #6e2d45;
  color: #fff;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;

  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }
`;
const InstallButton = styled.button`
  flex: none;
  min-width: 62px;
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: #8a77ff;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }
`;
const PolicyError = styled.p`
  margin: 9px 0 0;
  color: #ff9cb9;
  font-size: 11px;
  line-height: 1.4;
`;
const BackButton = styled.button`
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: #b4afba;
  font-size: 13px;
  cursor: pointer;
`;
const Form = styled.form`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 13px;
  margin-top: 20px;
`;
const Field = styled.div`
  display: grid;
  gap: 6px;
`;
const Label = styled.label`
  color: #aaa5b1;
  font-size: 12px;
  font-weight: 600;
`;
const Input = styled.input`
  width: 100%;
  min-width: 0;
  height: 42px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 1px solid #34303b;
  border-radius: 7px;
  outline: none;
  background: #1b191f;
  color: #fff;
  font: inherit;
  font-size: 13px;
  &:focus {
    border-color: #8a77ff;
  }

  &[type='date']::-webkit-calendar-picker-indicator {
    cursor: pointer;
    filter: invert(52%) sepia(93%) saturate(1494%) hue-rotate(217deg)
      brightness(101%) contrast(102%);
  }

  &[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  &[type='number']::-webkit-inner-spin-button,
  &[type='number']::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
    -webkit-appearance: none;
  }
`;
const ChainSelectButton = styled.button`
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  border: 1px solid #34303b;
  border-radius: 7px;
  outline: none;
  background: #1b191f;
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  &:focus {
    border-color: #8a77ff;
  }
`;
const ChainLogo = styled.img`
  width: 21px;
  height: 21px;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
`;
const ChainName = styled.span`
  flex: 1;
`;
const ChainOptions = styled.div`
  position: absolute;
  z-index: 5;
  top: 48px;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  display: grid;
  gap: 3px;
  padding: 6px;
  border: 1px solid #34303f;
  border-radius: 8px;
  background: #111017;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.36);
`;
const ChainOption = styled.button<{ $selected: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: ${({ $selected }) => ($selected ? '#241f34' : 'transparent')};
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  &:hover {
    background: #241f34;
  }
`;
const InputGroup = styled.div`
  position: relative;
  ${Input} {
    padding-right: 58px;
  }
`;
const Unit = styled.span`
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  color: #8f8998;
  font-size: 11px;
  font-weight: 700;
`;
const ContractRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px;
`;
const ContractLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #817b89;
  font-size: 11px;
`;
const ContractChainLogo = styled.img`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
`;
const ContractExplorerLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  color: #a99df8;
  cursor: pointer;
  text-decoration: none;

  &:hover {
    color: #c4bbff;
    text-decoration: underline;
  }
`;
const ContractAddress = styled.span`
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0;
`;
const ProviderNote = styled.p`
  margin: 0;
  color: #8f8998;
  font-size: 11px;
`;
const ErrorText = styled.p`
  margin: 0;
  padding: 9px 10px;
  border: 1px solid #6e2d45;
  border-radius: 6px;
  background: #2f1821;
  color: #ff9cb9;
  font-size: 11px;
  line-height: 1.4;
`;
const PrimaryButton = styled.button`
  margin-top: auto;
  min-height: 44px;
  border: 0;
  border-radius: 7px;
  background: #8a77ff;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  &:disabled {
    cursor: wait;
    opacity: 0.55;
  }
`;

export default AutomationsModal;
