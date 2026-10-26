/* eslint-disable react/jsx-no-constructed-context-values */
/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  ArrowDown2,
  CloseCircle,
  NotificationBing,
  TickCircle,
} from 'iconsax-react';
import React, {
  createContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
} from 'viem';

import Button from '../components/Button';
import SkeletonLoader from '../components/SkeletonLoader';
import useTransactionKit from '../hooks/useTransactionKit';
import useWalletApproval from '../hooks/useWalletApproval';
import {
  AutomationOrder,
  TradingPolicy,
  useCreateOrderMutation,
  useGetPoliciesQuery,
  useLazyResolveTokenPriceQuery,
  useSubmitOrderConsentMutation,
} from '../services/automationApi';
import { getChainName } from '../utils/blockchain';
import { saveAutomationAlert } from '../utils/automationAlerts';

const CHAINS = [
  {
    id: 1,
    usdc: '0xA0b86991c6218b36c1d19d4a2e9eb0cE3606eB48',
    decimals: 6,
  },
  {
    id: 137,
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    decimals: 6,
  },
  {
    id: 10,
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    decimals: 6,
  },
  {
    id: 8453,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
  },
  {
    id: 42161,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    decimals: 6,
  },
  {
    id: 56,
    usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    decimals: 18,
  },
] as const;

export type CreateAlertPrefill = {
  chainId?: number;
  tokenAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogoUrl?: string;
  currentPrice?: number;
};

type CreateAlertContextValue = {
  openCreateAlert: (prefill?: CreateAlertPrefill) => void;
};

export const CreateAlertContext = createContext<CreateAlertContextValue | null>(
  null
);

const formatApiError = (error: unknown) => {
  if (typeof error !== 'object' || !error) return 'Unable to create order.';
  const data = 'data' in error ? error.data : undefined;
  if (typeof data === 'object' && data && 'error' in data) {
    return String(data.error).replaceAll('_', ' ');
  }
  return 'Unable to create order.';
};

const getRemainingPolicyBalance = (policy: TradingPolicy) =>
  policy.remainingUsdcLimit ??
  policy.remainingUsdcBalance ??
  policy.remainingUsdc ??
  policy.remainingBalance ??
  policy.availableUsdcLimit;

const formatRemainingPolicyBalance = (
  policy: TradingPolicy,
  decimals: number
) => {
  const remaining = getRemainingPolicyBalance(policy);
  if (remaining === undefined) return undefined;
  try {
    const value = Number(formatUnits(BigInt(remaining), decimals));
    return Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 6 })
      : undefined;
  } catch {
    return undefined;
  }
};

const getResolvedPrice = (response: {
  price?: string | number;
  value?: string | number;
  currentPrice?: string | number;
  data?: { price?: string | number; value?: string | number };
  observation?: { price?: string | number };
}) =>
  response.observation?.price ??
  response.price ??
  response.currentPrice ??
  response.value ??
  response.data?.price ??
  response.data?.value;

const formatUsdPrice = (price: number) => {
  if (price === 0) return '0';
  if (price < 0.000001) {
    return price.toLocaleString(undefined, {
      maximumSignificantDigits: 6,
      notation: 'scientific',
    });
  }
  let maximumFractionDigits = 8;
  if (price >= 1_000) maximumFractionDigits = 2;
  else if (price >= 1) maximumFractionDigits = 4;
  return price.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

const CreateAlertProvider = ({ children }: React.PropsWithChildren) => {
  const { kit, walletAddress } = useTransactionKit();
  const { requestApproval } = useWalletApproval();
  const [prefill, setPrefill] = useState<CreateAlertPrefill>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [chainId, setChainId] = useState(8453);
  const [policyId, setPolicyId] = useState('');
  const [isPolicySelectOpen, setIsPolicySelectOpen] = useState(false);
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenLogoUrl, setTokenLogoUrl] = useState('');
  const [tokenMetadataError, setTokenMetadataError] = useState('');
  const [isLoadingTokenMetadata, setIsLoadingTokenMetadata] = useState(false);
  const [currentTokenPrice, setCurrentTokenPrice] = useState<number>();
  const [tokenPriceError, setTokenPriceError] = useState('');
  const [isLoadingTokenPrice, setIsLoadingTokenPrice] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<AutomationOrder>();
  const [amount, setAmount] = useState('');
  const [condition, setCondition] = useState<'below' | 'above'>('below');
  const [targetPrice, setTargetPrice] = useState('');
  const [slippagePercent, setSlippagePercent] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createOrder] = useCreateOrderMutation();
  const [resolveTokenPrice] = useLazyResolveTokenPriceQuery();
  const [submitConsent] = useSubmitOrderConsentMutation();
  const policySelectRef = useRef<HTMLDivElement>(null);
  const { data: policiesData, isLoading: isLoadingPolicies } =
    useGetPoliciesQuery(
      { walletAddress: walletAddress || '', chainId },
      { skip: !walletAddress || !prefill }
    );

  const minimumExpiry = useMemo(
    () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    []
  );
  const chain = CHAINS.find((candidate) => candidate.id === chainId)!;
  const activePolicies = (policiesData?.policies || []).filter(
    (policy) => policy.status === 'ACTIVE'
  );
  const selectedPolicy = activePolicies.find(
    (policy) => policy.id === policyId
  );
  const selectedPolicyBalance = selectedPolicy
    ? getRemainingPolicyBalance(selectedPolicy)
    : undefined;
  const selectedPolicyBalanceLabel = selectedPolicy
    ? formatRemainingPolicyBalance(selectedPolicy, chain.decimals)
    : undefined;
  let amountInBaseUnits: bigint | undefined;
  try {
    amountInBaseUnits = amount ? parseUnits(amount, chain.decimals) : undefined;
  } catch {
    amountInBaseUnits = undefined;
  }
  let amountExceedsPolicyBalance = false;
  if (amountInBaseUnits !== undefined && selectedPolicyBalance !== undefined) {
    try {
      amountExceedsPolicyBalance =
        amountInBaseUnits > BigInt(selectedPolicyBalance);
    } catch {
      amountExceedsPolicyBalance = false;
    }
  }
  const hasLoadedPolicies = !isLoadingPolicies && Boolean(policiesData);
  const hasNoPolicies =
    hasLoadedPolicies && (policiesData?.policies.length || 0) === 0;
  const hasNoActivePolicies = hasLoadedPolicies && activePolicies.length === 0;
  const tokenLabel = tokenSymbol || tokenName || 'Selected token';
  const hasTokenMetadata = Boolean(tokenName && tokenSymbol);
  const canContinueFromToken = isAddress(tokenAddress) && hasTokenMetadata;
  const canContinueFromPolicy =
    Number(amount) >= 1 && Boolean(policyId) && !amountExceedsPolicyBalance;
  const canSubmit =
    Boolean(walletAddress) &&
    Boolean(policyId) &&
    isAddress(tokenAddress) &&
    Number(amount) >= 1 &&
    !amountExceedsPolicyBalance &&
    Number(targetPrice) > 0 &&
    Number(slippagePercent) > 0 &&
    Number(slippagePercent) <= 50 &&
    expiresAt >= minimumExpiry &&
    !isSubmitting;
  const numericTargetPrice = Number(targetPrice);
  const isTriggerAlreadyMet =
    currentTokenPrice !== undefined &&
    numericTargetPrice > 0 &&
    (condition === 'below'
      ? currentTokenPrice < numericTargetPrice
      : currentTokenPrice > numericTargetPrice);
  let policyPlaceholder = 'No active policies on this network';
  if (isLoadingPolicies) policyPlaceholder = 'Loading policies...';
  else if (activePolicies.length) policyPlaceholder = 'Select an active policy';
  let marketPriceContent: React.ReactNode = (
    <SkeletonLoader
      aria-label="Loading current market price"
      $height="18px"
      $width="90px"
      $radius="5px"
    />
  );
  if (!isLoadingTokenPrice && currentTokenPrice !== undefined) {
    marketPriceContent = (
      <MarketPriceValue $error={false}>
        ${formatUsdPrice(currentTokenPrice)}
      </MarketPriceValue>
    );
  } else if (!isLoadingTokenPrice && tokenPriceError) {
    marketPriceContent = (
      <MarketPriceValue $error>{tokenPriceError}</MarketPriceValue>
    );
  }

  useEffect(() => {
    if (!prefill || !isAddress(tokenAddress)) {
      setIsLoadingTokenMetadata(false);
      setTokenMetadataError('');
      if (!isAddress(tokenAddress)) {
        setTokenName('');
        setTokenSymbol('');
      }
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setIsLoadingTokenMetadata(true);
      setTokenMetadataError('');
      try {
        const client = await kit
          .getEtherspotProvider()
          .getPublicClient(chainId);
        const address = getAddress(tokenAddress);
        const [name, symbol] = await Promise.all([
          client.readContract({
            abi: erc20Abi,
            address,
            functionName: 'name',
          }),
          client.readContract({
            abi: erc20Abi,
            address,
            functionName: 'symbol',
          }),
        ]);
        if (!cancelled) {
          setTokenName(String(name));
          setTokenSymbol(String(symbol));
        }
      } catch {
        if (!cancelled) {
          setTokenName('');
          setTokenSymbol('');
          setTokenMetadataError(
            'Unable to find an ERC-20 token at this address on the selected network.'
          );
        }
      } finally {
        if (!cancelled) setIsLoadingTokenMetadata(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [chainId, kit, prefill, tokenAddress]);

  useEffect(() => {
    if (step !== 3 || !isAddress(tokenAddress)) {
      setCurrentTokenPrice(undefined);
      setTokenPriceError('');
      setIsLoadingTokenPrice(false);
      return undefined;
    }

    let cancelled = false;
    let refreshTimeout: number | undefined;

    const refreshPrice = async () => {
      setIsLoadingTokenPrice(true);
      setCurrentTokenPrice(undefined);
      setTokenPriceError('');
      try {
        const response = await resolveTokenPrice({
          chainId,
          asset: { kind: 'erc20', address: getAddress(tokenAddress) },
          quoteCurrency: 'usd',
        }).unwrap();
        if (cancelled) return;
        const resolvedPrice = Number(getResolvedPrice(response));
        if (!Number.isFinite(resolvedPrice) || resolvedPrice < 0) {
          setTokenPriceError('Current price is unavailable.');
        } else {
          setCurrentTokenPrice(resolvedPrice);
        }
      } catch {
        if (!cancelled) setTokenPriceError('Unable to load current price.');
      } finally {
        if (!cancelled) {
          setIsLoadingTokenPrice(false);
          refreshTimeout = window.setTimeout(refreshPrice, 10_000);
        }
      }
    };

    refreshPrice();

    return () => {
      cancelled = true;
      if (refreshTimeout !== undefined) {
        window.clearTimeout(refreshTimeout);
      }
    };
  }, [chainId, resolveTokenPrice, step, tokenAddress]);

  useEffect(() => {
    if (!isPolicySelectOpen) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!policySelectRef.current?.contains(event.target as Node)) {
        setIsPolicySelectOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [isPolicySelectOpen]);

  const close = () => {
    if (isSubmitting) return;
    setPrefill(undefined);
    setError('');
  };

  const openCreateAlert = (nextPrefill: CreateAlertPrefill = {}) => {
    const nextChain = CHAINS.some(
      (candidate) => candidate.id === nextPrefill.chainId
    )
      ? nextPrefill.chainId!
      : 8453;
    setChainId(nextChain);
    setStep(1);
    setPolicyId('');
    setIsPolicySelectOpen(false);
    setTokenAddress(nextPrefill.tokenAddress || '');
    setTokenName(nextPrefill.tokenName || '');
    setTokenSymbol(nextPrefill.tokenSymbol || '');
    setTokenLogoUrl(nextPrefill.tokenLogoUrl || '');
    setTokenMetadataError('');
    setIsLoadingTokenMetadata(false);
    setCreatedOrder(undefined);
    setAmount('');
    setCondition('below');
    setTargetPrice(
      nextPrefill.currentPrice ? String(nextPrefill.currentPrice) : ''
    );
    setSlippagePercent('1');
    setExpiresAt('');
    setError('');
    setPrefill(nextPrefill);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !walletAddress) return;
    setError('');
    setIsSubmitting(true);

    try {
      const created = await createOrder({
        walletAddress: walletAddress as Address,
        chainId,
        policyId,
        tokenIn: { kind: 'erc20', address: chain.usdc as Address },
        tokenOut: {
          kind: 'erc20',
          address: tokenAddress as Address,
          name: tokenName,
          symbol: tokenSymbol,
          ...(tokenLogoUrl ? { logoUrl: tokenLogoUrl } : {}),
        },
        amountIn: parseUnits(amount, chain.decimals).toString(),
        quoteCurrency: 'usd',
        ...(condition === 'below'
          ? { maxPrice: targetPrice }
          : { minPrice: targetPrice }),
        maxSlippageBps: Math.round(Number(slippagePercent) * 100),
        expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString(),
      }).unwrap();

      const approved = await requestApproval({
        type: 'typedData',
        title: 'Activate buy order',
        description: `Buy ${tokenLabel || 'token'} with ${amount} USDC when its price is ${condition} $${targetPrice}.`,
        source: 'Smart Trades',
        network: getChainName(chainId),
        account: walletAddress,
        message: JSON.stringify(created.consent.message, null, 2),
        confirmLabel: 'Sign and activate',
      });
      if (!approved) {
        setError('Signature was cancelled. The order was not activated.');
        return;
      }

      const sdk = await kit.getEtherspotProvider().getSdk(chainId);
      const signature = await sdk.signTypedData({
        domain: created.consent.domain,
        types: created.consent.types,
        primaryType: created.consent.primaryType,
        message: {
          ...created.consent.message,
          amountIn: BigInt(String(created.consent.message.amountIn)),
        },
      });

      const activated = await submitConsent({
        orderId: created.order.id,
        signature,
      }).unwrap();
      saveAutomationAlert(activated.order);
      setCreatedOrder(activated.order);
    } catch (submitError) {
      setError(formatApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreateAlertContext.Provider value={{ openCreateAlert }}>
      {children}
      {prefill && (
        <Overlay role="dialog" aria-modal="true" aria-label="Create order">
          <Panel>
            <CloseButton
              type="button"
              aria-label="Close create order"
              onClick={close}
            >
              <CloseCircle size={24} />
            </CloseButton>
            <FlowContent>
              {createdOrder ? (
                <SuccessContent>
                  <SuccessIcon>
                    <TickCircle size={42} variant="Bold" />
                  </SuccessIcon>
                  <SuccessTitle>Order created</SuccessTitle>
                  <SuccessText>
                    Your order is active and waiting for the price trigger. It
                    will execute when {tokenSymbol || 'the token'} is{' '}
                    {condition} ${targetPrice}, subject to your policy and{' '}
                    {slippagePercent}% maximum slippage.
                  </SuccessText>
                  <SuccessDetails>
                    <SuccessDetailRow>
                      <span>Spend</span>
                      <strong>{amount} USDC</strong>
                    </SuccessDetailRow>
                    <SuccessDetailRow>
                      <span>Network</span>
                      <strong>{getChainName(chainId)}</strong>
                    </SuccessDetailRow>
                    <SuccessDetailRow>
                      <span>Status</span>
                      <strong>{createdOrder.status}</strong>
                    </SuccessDetailRow>
                  </SuccessDetails>
                  <Button $fullWidth $last type="button" onClick={close}>
                    Done
                  </Button>
                </SuccessContent>
              ) : (
                <>
                  <Header>
                    <IconBox>
                      <NotificationBing size={25} />
                    </IconBox>
                    <div>
                      <Title>Create order</Title>
                      <Subtitle>
                        Automatically buy a token when its price condition is
                        met.
                      </Subtitle>
                    </div>
                  </Header>
                  <StepProgress aria-label={`Step ${step} of 3`}>
                    {[1, 2, 3].map((stepNumber) => (
                      <StepDot
                        key={stepNumber}
                        $active={stepNumber <= step}
                        aria-hidden
                      />
                    ))}
                    <StepLabel>Step {step} of 3</StepLabel>
                  </StepProgress>
                  <Form onSubmit={submit}>
                    {step === 1 && (
                      <StepContent>
                        <StepHeading>Choose a token</StepHeading>
                        <StepDescription>
                          Select the network and enter the token contract
                          address.
                        </StepDescription>
                        <Field>
                          <Label htmlFor="alert-chain">Network</Label>
                          <Input
                            as="select"
                            id="alert-chain"
                            value={chainId}
                            onChange={(event) => {
                              setChainId(Number(event.target.value));
                              setPolicyId('');
                              setTokenName('');
                              setTokenSymbol('');
                              setTokenLogoUrl('');
                              setTokenMetadataError('');
                            }}
                          >
                            {CHAINS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {getChainName(option.id)}
                              </option>
                            ))}
                          </Input>
                        </Field>
                        <Field>
                          <Label htmlFor="alert-token">
                            Token contract address
                          </Label>
                          <Input
                            id="alert-token"
                            value={tokenAddress}
                            placeholder="0x..."
                            autoComplete="off"
                            onChange={(event) => {
                              setTokenAddress(event.target.value);
                              setTokenLogoUrl('');
                            }}
                          />
                          {isLoadingTokenMetadata && (
                            <HelperText>Looking up token…</HelperText>
                          )}
                          {tokenMetadataError && (
                            <ErrorText role="alert">
                              {tokenMetadataError}
                            </ErrorText>
                          )}
                          {hasTokenMetadata && !isLoadingTokenMetadata && (
                            <TokenResult>
                              <TokenSymbol>{tokenSymbol}</TokenSymbol>
                              <div>
                                <TokenName>{tokenName}</TokenName>
                                <TokenNetwork>
                                  {getChainName(chainId)}
                                </TokenNetwork>
                              </div>
                            </TokenResult>
                          )}
                        </Field>
                      </StepContent>
                    )}

                    {step === 2 && (
                      <StepContent>
                        <StepHeading>Select policy and amount</StepHeading>
                        <StepDescription>
                          Choose the policy first, then enter an amount within
                          its available balance.
                        </StepDescription>
                        <Field>
                          <Label id="alert-policy-label">Active policy</Label>
                          <PolicySelect ref={policySelectRef}>
                            <PolicySelectButton
                              type="button"
                              aria-labelledby="alert-policy-label"
                              aria-expanded={isPolicySelectOpen}
                              disabled={
                                isLoadingPolicies || activePolicies.length === 0
                              }
                              onClick={() =>
                                setIsPolicySelectOpen((current) => !current)
                              }
                            >
                              <span>
                                {selectedPolicy?.name || policyPlaceholder}
                              </span>
                              <ArrowDown2 size={16} />
                            </PolicySelectButton>
                            {isPolicySelectOpen && (
                              <PolicyOptions role="listbox">
                                {activePolicies.map((policy) => (
                                  <PolicyOption
                                    key={policy.id}
                                    type="button"
                                    role="option"
                                    aria-selected={policy.id === policyId}
                                    $selected={policy.id === policyId}
                                    onClick={() => {
                                      setPolicyId(policy.id);
                                      setAmount('');
                                      setIsPolicySelectOpen(false);
                                    }}
                                  >
                                    <PolicyOptionName>
                                      {policy.name}
                                    </PolicyOptionName>
                                    <PolicyOptionBalance>
                                      Balance:{' '}
                                      {formatRemainingPolicyBalance(
                                        policy,
                                        chain.decimals
                                      ) || '—'}{' '}
                                      USDC
                                    </PolicyOptionBalance>
                                  </PolicyOption>
                                ))}
                              </PolicyOptions>
                            )}
                          </PolicySelect>
                          {selectedPolicy && (
                            <PolicyBalanceText>
                              Available balance:{' '}
                              <strong>
                                {selectedPolicyBalanceLabel || '—'} USDC
                              </strong>
                            </PolicyBalanceText>
                          )}
                          {hasNoActivePolicies && (
                            <PolicyWarning role="status">
                              <strong>
                                {hasNoPolicies
                                  ? `No policies exist on ${getChainName(chainId)}.`
                                  : `No active policies on ${getChainName(chainId)}.`}
                              </strong>
                              <span>
                                Open Smart Trades → Policies to create and
                                activate a policy before creating this order.
                              </span>
                            </PolicyWarning>
                          )}
                        </Field>
                        <Field>
                          <Label htmlFor="alert-amount">Spend amount</Label>
                          <InputGroup>
                            <Input
                              id="alert-amount"
                              type="text"
                              inputMode="decimal"
                              value={amount}
                              placeholder="0.00"
                              disabled={!selectedPolicy}
                              onChange={(event) => {
                                const nextAmount = event.target.value;
                                if (/^\d*(?:\.\d{0,6})?$/.test(nextAmount)) {
                                  setAmount(nextAmount);
                                }
                              }}
                            />
                            <Unit>USDC</Unit>
                          </InputGroup>
                          {!selectedPolicy && (
                            <HelperText>
                              Select an active policy to enter an amount.
                            </HelperText>
                          )}
                          {amount && Number(amount) < 1 && (
                            <ValidationText role="alert">
                              Spend amount must be at least 1 USDC.
                            </ValidationText>
                          )}
                          {amountExceedsPolicyBalance && (
                            <ValidationText role="alert">
                              Amount exceeds the available policy balance of{' '}
                              {selectedPolicyBalanceLabel || '0'} USDC.
                            </ValidationText>
                          )}
                        </Field>
                      </StepContent>
                    )}

                    {step === 3 && (
                      <StepContent>
                        <StepHeading>Configure the trigger</StepHeading>
                        <StepDescription>
                          Set when the order can execute and its safety limits.
                        </StepDescription>
                        <Field>
                          <MarketPriceCard aria-live="polite">
                            <div>
                              <MarketPriceLabel>
                                Current market price
                              </MarketPriceLabel>
                              <MarketPair>
                                {tokenSymbol || 'Token'} / USD
                              </MarketPair>
                            </div>
                            {marketPriceContent}
                          </MarketPriceCard>
                          <TriggerControls>
                            <div>
                              <ControlLabel>Execute when price is</ControlLabel>
                              <Segmented>
                                <Segment
                                  type="button"
                                  $active={condition === 'below'}
                                  onClick={() => setCondition('below')}
                                >
                                  Below
                                </Segment>
                                <Segment
                                  type="button"
                                  $active={condition === 'above'}
                                  onClick={() => setCondition('above')}
                                >
                                  Above
                                </Segment>
                              </Segmented>
                            </div>
                            <div>
                              <ControlLabel htmlFor="alert-target-price">
                                Trigger price
                              </ControlLabel>
                              <InputGroup>
                                <Prefix>$</Prefix>
                                <Input
                                  id="alert-target-price"
                                  type="number"
                                  min="0.00000001"
                                  step="any"
                                  value={targetPrice}
                                  placeholder="0.00"
                                  onChange={(event) =>
                                    setTargetPrice(event.target.value)
                                  }
                                />
                              </InputGroup>
                            </div>
                          </TriggerControls>
                          {isTriggerAlreadyMet && (
                            <TriggerNotice role="status">
                              This condition is already met. The order may be
                              submitted immediately after activation.
                            </TriggerNotice>
                          )}
                        </Field>
                        <Row>
                          <Field>
                            <Label htmlFor="alert-slippage">Max slippage</Label>
                            <InputGroup>
                              <Input
                                id="alert-slippage"
                                type="number"
                                min="0.01"
                                max="50"
                                step="0.01"
                                value={slippagePercent}
                                onChange={(event) =>
                                  setSlippagePercent(event.target.value)
                                }
                              />
                              <Unit>%</Unit>
                            </InputGroup>
                          </Field>
                          <Field>
                            <Label htmlFor="alert-expiry">Valid until</Label>
                            <Input
                              id="alert-expiry"
                              type="date"
                              min={minimumExpiry}
                              value={expiresAt}
                              onChange={(event) =>
                                setExpiresAt(event.target.value)
                              }
                            />
                          </Field>
                        </Row>
                      </StepContent>
                    )}

                    {error && <ErrorText role="alert">{error}</ErrorText>}
                    <Actions>
                      <Button
                        $secondary
                        $fullWidth
                        $last
                        type="button"
                        onClick={
                          step === 1
                            ? close
                            : () => setStep((step - 1) as 1 | 2)
                        }
                      >
                        {step === 1 ? 'Cancel' : 'Back'}
                      </Button>
                      {step < 3 ? (
                        <Button
                          $fullWidth
                          $last
                          type="button"
                          disabled={
                            step === 1
                              ? !canContinueFromToken || isLoadingTokenMetadata
                              : !canContinueFromPolicy
                          }
                          onClick={() => setStep((step + 1) as 2 | 3)}
                        >
                          Continue
                        </Button>
                      ) : (
                        <Button
                          $fullWidth
                          $last
                          type="submit"
                          disabled={!canSubmit}
                        >
                          {isSubmitting ? 'Creating...' : 'Create order'}
                        </Button>
                      )}
                    </Actions>
                  </Form>
                </>
              )}
            </FlowContent>
          </Panel>
        </Overlay>
      )}
    </CreateAlertContext.Provider>
  );
};

const Overlay = styled.div`
  position: fixed;
  z-index: 9000;
  inset: 0;
  background: rgba(4, 4, 7, 0.82);
  backdrop-filter: blur(10px);
`;
const Panel = styled.div`
  width: 100%;
  height: 100dvh;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 24px 20px 28px;
  background: #141218;
  color: #fff;
`;
const FlowContent = styled.div`
  width: 100%;
  max-width: 600px;
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0 auto;
  padding: 40px 0;
`;
const SuccessContent = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;
const SuccessIcon = styled.div`
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #153a2c;
  color: #70e1ad;
`;
const SuccessTitle = styled.h2`
  margin: 20px 0 0;
  color: #fff;
  font-size: 24px;
  letter-spacing: 0;
`;
const SuccessText = styled.p`
  max-width: 460px;
  margin: 10px 0 0;
  color: #aaa5b1;
  font-size: 13px;
  line-height: 1.55;
`;
const SuccessDetails = styled.div`
  width: 100%;
  margin: 24px 0 18px;
  border-top: 1px solid #302c36;
`;
const SuccessDetailRow = styled.div`
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #302c36;
  color: #918c98;
  font-size: 12px;

  strong {
    color: #fff;
    font-weight: 650;
  }
`;
const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #aaa5b1;
  cursor: pointer;
`;
const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 40px;
`;
const IconBox = styled.div`
  width: 46px;
  height: 46px;
  display: grid;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: #241d3a;
  color: #a78bfa;
`;
const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  letter-spacing: 0;
`;
const Subtitle = styled.p`
  margin: 5px 0 0;
  color: #aaa5b1;
  font-size: 12px;
  line-height: 1.4;
`;
const StepProgress = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-top: 22px;
`;
const StepDot = styled.span<{ $active: boolean }>`
  height: 3px;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? '#8a77ff' : '#302c36')};
`;
const StepLabel = styled.span`
  grid-column: 1 / -1;
  margin-top: 2px;
  color: #817b89;
  font-size: 11px;
`;
const Form = styled.form`
  display: grid;
  gap: 13px;
  margin-top: 16px;
`;
const StepContent = styled.div`
  display: grid;
  gap: 14px;
`;
const StepHeading = styled.h3`
  margin: 0;
  color: #fff;
  font-size: 16px;
  letter-spacing: 0;
`;
const StepDescription = styled.p`
  margin: -8px 0 2px;
  color: #918c98;
  font-size: 12px;
  line-height: 1.45;
`;
const Field = styled.div`
  min-width: 0;
  display: grid;
  gap: 6px;
`;
const Label = styled.label`
  color: #aaa5b1;
  font-size: 12px;
  font-weight: 600;
`;
const PolicyWarning = styled.div`
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border: 1px solid #604b25;
  border-radius: 7px;
  background: #2b2417;
  color: #f2ce68;
  font-size: 12px;
  line-height: 1.4;

  strong {
    color: #ffe29a;
    font-weight: 700;
  }
`;
const HelperText = styled.p`
  margin: 0;
  color: #817b89;
  font-size: 11px;
  line-height: 1.4;
`;
const MarketPriceCard = styled.div`
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid #3b3546;
  border-radius: 9px;
  background: linear-gradient(135deg, #211c2c 0%, #19171e 70%);
`;
const MarketPriceLabel = styled.p`
  margin: 0;
  color: #aaa5b1;
  font-size: 11px;
  font-weight: 600;
`;
const MarketPair = styled.p`
  margin: 3px 0 0;
  color: #716c78;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;
const MarketPriceValue = styled.strong<{ $error: boolean }>`
  color: ${({ $error }) => ($error ? '#ff9cb9' : '#fff')};
  font-size: ${({ $error }) => ($error ? '11px' : '16px')};
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: right;
`;
const TriggerControls = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;

  > div {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
`;
const ControlLabel = styled.label`
  color: #817b89;
  font-size: 10px;
  font-weight: 600;
`;
const TriggerNotice = styled.p`
  margin: 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: #2b2417;
  color: #f2ce68;
  font-size: 10px;
  line-height: 1.4;
`;
const ValidationText = styled.p`
  margin: 0;
  color: #ff8ca8;
  font-size: 11px;
`;
const PolicySelect = styled.div`
  position: relative;
`;
const PolicySelectButton = styled.button`
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border: 1px solid #34303b;
  border-radius: 7px;
  background: #1b191f;
  color: #fff;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:focus-visible,
  &[aria-expanded='true'] {
    border-color: #8a77ff;
    outline: none;
  }

  &:disabled {
    color: #716c78;
    cursor: not-allowed;
    opacity: 0.7;
  }
`;
const PolicyOptions = styled.div`
  position: absolute;
  z-index: 10;
  top: calc(100% + 6px);
  left: 0;
  width: 100%;
  box-sizing: border-box;
  display: grid;
  gap: 3px;
  padding: 6px;
  border: 1px solid #3b3546;
  border-radius: 8px;
  background: #19171e;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
`;
const PolicyOption = styled.button<{ $selected: boolean }>`
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 6px;
  background: ${({ $selected }) => ($selected ? '#2c2541' : 'transparent')};
  color: ${({ $selected }) => ($selected ? '#b8adff' : '#fff')};
  font: inherit;
  font-size: 13px;
  display: grid;
  gap: 3px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: #28232f;
  }
`;
const PolicyOptionName = styled.span`
  color: inherit;
  font-size: 13px;
  font-weight: 650;
`;
const PolicyOptionBalance = styled.span`
  color: #817b89;
  font-size: 10px;
  font-weight: 500;
`;
const PolicyBalanceText = styled.p`
  margin: 0;
  color: #aaa5b1;
  font-size: 11px;

  strong {
    color: #fff;
    font-weight: 650;
  }
`;
const TokenResult = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border: 1px solid #34303b;
  border-radius: 7px;
  background: #1b191f;
`;
const TokenSymbol = styled.span`
  min-width: 44px;
  padding: 7px 8px;
  border-radius: 6px;
  background: #292334;
  color: #b8adff;
  font-size: 11px;
  font-weight: 750;
  text-align: center;
`;
const TokenName = styled.p`
  margin: 0;
  color: #fff;
  font-size: 13px;
  font-weight: 650;
`;
const TokenNetwork = styled.p`
  margin: 3px 0 0;
  color: #817b89;
  font-size: 11px;
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
  &:disabled {
    opacity: 0.55;
  }
  &[type='date']::-webkit-calendar-picker-indicator {
    cursor: pointer;
    filter: invert(52%) sepia(93%) saturate(1494%) hue-rotate(217deg)
      brightness(101%) contrast(102%);
  }
`;
const InputGroup = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  ${Input} {
    padding-right: 58px;
  }
`;
const Unit = styled.span`
  position: absolute;
  right: 12px;
  color: #aaa5b1;
  font-size: 11px;
  font-weight: 650;
`;
const Prefix = styled(Unit)`
  right: auto;
  left: 12px;
  & + ${Input} {
    padding-right: 12px;
    padding-left: 26px;
  }
`;
const Segmented = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid #34303b;
  border-radius: 7px;
  background: #111014;
`;
const Segment = styled.button<{ $active: boolean }>`
  min-height: 35px;
  border: 0;
  border-radius: 5px;
  background: ${({ $active }) => ($active ? '#292334' : 'transparent')};
  color: ${({ $active }) => ($active ? '#fff' : '#918c98')};
  font-weight: 600;
  cursor: pointer;
`;
const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 10px;
`;
const ErrorText = styled.p`
  margin: 0;
  color: #ff9cb9;
  font-size: 11px;
  line-height: 1.4;
`;
const Actions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
`;

export default CreateAlertProvider;
