import { useState, useEffect, useRef } from 'react';
import { TailSpin } from 'react-loader-spinner';

// hooks
import useIntentSdk from '../../hooks/useIntentSdk';
import { useEIP7702Upgrade } from '../../../../hooks/useEIP7702Upgrade';
import useTopUp from '../../hooks/useTopUp';
import useGasEstimationTopUp from '../../hooks/useGasEstimationTopUp';

// types
import { SelectedToken } from '../../types/tokens';
import { SellOffer } from '../../hooks/useRelaySell';
import { PortfolioToken } from '../../../../services/tokensData';

// utils
import {
  formatExponentialSmallNumber,
  limitDigitsNumber,
} from '../../../../utils/number';

// constants
import { STABLE_CURRENCIES } from '../../constants/tokens';

// components
import TransactionStatus from '../Transaction/TransactionStatus';

// services
import { getUserOperationStatus } from '../../../../services/userOpStatus';

// assets
import BackArrow from '../../assets/back-arrow.svg';
import ArrowDownOnboarding from '../../assets/arrow-down-onboarding.svg';
import Install7702Icon from '../../assets/install-7702-icon.svg';
import OnboardingInstallModulesIcon from '../../assets/onboarding-install-modules-icon.svg';
import OnboardingSwapIcon from '../../assets/onboarding-swap-icon.svg';
import OnboardingGasTankIcon from '../../assets/onboarding-gas-tank-icon.svg';

interface Transactions {
  action: string;
  calldata: string;
  target: string;
}

// types
type TransactionStatusState =
  | 'Starting Transaction'
  | 'Transaction Pending'
  | 'Transaction Complete'
  | 'Transaction Failed';

type UserOpStatus =
  | 'New'
  | 'Pending'
  | 'Submitted'
  | 'OnChain'
  | 'Finalized'
  | 'Confirmed'
  | 'Cancelled'
  | 'Failed'
  | 'Reverted';

interface PreviewTopUpProps {
  onBack: () => void;
  selectedToken: SelectedToken | null;
  amount: string;
  allocateAmount: number;
  sellOffer: SellOffer | null;
  userPortfolio?: PortfolioToken[];
  setOnboardingScreen: React.Dispatch<
    React.SetStateAction<'welcome' | 'topup' | null>
  >;
  markOnboardingComplete: () => void;
}

export default function PreviewTopUp(props: PreviewTopUpProps) {
  const {
    onBack,
    selectedToken,
    amount,
    allocateAmount,
    sellOffer,
    userPortfolio,
    setOnboardingScreen,
    markOnboardingComplete,
  } = props;
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForSignature, setIsWaitingForSignature] = useState(false);
  const [isTransactionRejected, setIsTransactionRejected] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Transaction status state
  const [showTransactionStatus, setShowTransactionStatus] = useState(false);
  const [userOpHash, setUserOpHash] = useState<string>('');
  const [transactionGasFee, setTransactionGasFee] = useState<string>('≈ 0.00');
  const [currentTransactionStatus, setCurrentTransactionStatus] =
    useState<TransactionStatusState>('Starting Transaction');
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [submittedAt, setSubmittedAt] = useState<Date | undefined>(undefined);
  const [pendingCompletedAt, setPendingCompletedAt] = useState<
    Date | undefined
  >(undefined);
  const [blockchainTxHash, setBlockchainTxHash] = useState<string | undefined>(
    undefined
  );

  // Polling state
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [hasSeenSuccess, setHasSeenSuccess] = useState(false);
  const hasSeenSuccessRef = useRef(false);
  const blockchainTxHashRef = useRef<string | null>(null);
  const failureGraceExpiryRef = useRef<number | null>(null);
  const statusStartTime = useRef(Date.now());
  const normalTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const [failureTimeoutId, setFailureTimeoutId] =
    useState<NodeJS.Timeout | null>(null);

  // Convert selectedToken to PayingToken format for useIntentSdk
  const payingTokens = selectedToken
    ? [
        {
          name: selectedToken.name,
          symbol: selectedToken.symbol,
          logo: selectedToken.logo,
          actualBal: '0', // Balance is managed in parent component
          totalUsd: parseFloat(amount) || 0,
          totalRaw: '0',
          chainId: selectedToken.chainId,
          address: selectedToken.address,
        },
      ]
    : [];

  const { areModulesInstalled, getEnablePulseTradingTransactions } =
    useIntentSdk({
      payingTokens,
    });
  const { isEligible: isEIP7702Eligible, handleUpgradeClick } =
    useEIP7702Upgrade();
  const { executeTopUp, error: topUpError, clearError } = useTopUp();

  // Gas estimation - only run when selectedToken is available
  const {
    isEstimatingGas,
    gasEstimationError,
    gasCostNative,
    nativeTokenSymbol,
  } = useGasEstimationTopUp({
    selectedToken: selectedToken || {
      name: '',
      symbol: '',
      usdValue: '0',
      logo: '',
      dailyPriceChange: 0,
      chainId: 1,
      address: '',
      decimals: 18,
    },
    amount,
    allocateAmount,
    sellOffer,
    userPortfolio,
    isPaused: isWaitingForSignature || isLoading || !selectedToken,
  });

  // Check if selected token is USDC
  const isSelectedTokenUSDC = (): boolean => {
    if (!selectedToken) return false;
    return STABLE_CURRENCIES.some(
      (stable) =>
        stable.chainId === selectedToken.chainId &&
        stable.address.toLowerCase() === selectedToken.address.toLowerCase()
    );
  };

  const handleConfirm = async () => {
    if (!selectedToken) return;

    // Clear any existing errors
    if (topUpError) {
      clearError();
    }
    if (setupError) {
      setSetupError(null);
    }

    setIsTransactionRejected(false);
    setIsWaitingForSignature(true);
    setIsLoading(true);

    try {
      // Step 1: Handle EIP-7702 upgrade if eligible
      if (isEIP7702Eligible) {
        try {
          await handleUpgradeClick();
        } catch (upgradeErr) {
          console.error('EIP-7702 upgrade failed:', upgradeErr);
          setSetupError('Failed to upgrade wallet. Please try again.');
          setIsWaitingForSignature(false);
          setIsLoading(false);
          return;
        }
      }

      let additionalTransactions: Transactions[] = [];
      // Step 2: Install modules if not installed and not EIP-7702 eligible
      if (!areModulesInstalled && !isEIP7702Eligible) {
        try {
          additionalTransactions = await getEnablePulseTradingTransactions();
        } catch (moduleErr) {
          console.error('Module installation failed:', moduleErr);
          setSetupError('Failed to install trading modules. Please try again.');
          setIsWaitingForSignature(false);
          setIsLoading(false);
          return;
        }
      }

      // Step 3: Execute the top-up transaction
      const userOperationHash = await executeTopUp({
        selectedToken,
        amount,
        allocateAmount,
        sellOffer,
        userPortfolio,
        additionalTransactions,
      });

      if (userOperationHash) {
        setIsWaitingForSignature(false);
        setIsLoading(false);

        // Ensure we have a valid gas fee string for the transaction status
        const gasFeeString =
          gasCostNative && nativeTokenSymbol
            ? `≈ ${formatExponentialSmallNumber(limitDigitsNumber(parseFloat(gasCostNative)))} ${nativeTokenSymbol}`
            : '≈ 0.00';

        // Set transaction data and show transaction status
        setUserOpHash(userOperationHash);
        setTransactionGasFee(gasFeeString);
        setCurrentTransactionStatus('Starting Transaction');
        setErrorDetails('');
        setSubmittedAt(undefined);
        setPendingCompletedAt(undefined);
        setBlockchainTxHash(undefined);
        setHasSeenSuccess(false);
        hasSeenSuccessRef.current = false;
        blockchainTxHashRef.current = null;
        failureGraceExpiryRef.current = null;
        statusStartTime.current = Date.now();
        setShowTransactionStatus(true);
        setIsPollingActive(true);

        // Don't clear onboarding screen - keep showing transaction status within onboarding
        return;
      }

      throw new Error('Failed to execute top-up transaction');
    } catch (err) {
      console.error('Failed to execute top-up:', err);
      // Check if the error is a user rejection
      if (
        err instanceof Error &&
        err.message.includes('User rejected the request')
      ) {
        setIsTransactionRejected(true);
        setIsWaitingForSignature(false);
      } else {
        // Other errors will be handled by the useTopUp hook's error state
        setIsWaitingForSignature(false);
      }
      setIsLoading(false);
    }
  };

  // Function to map UserOp status to TransactionStatus state
  const mapUserOpStatusToTransactionStatus = (
    status: UserOpStatus
  ): TransactionStatusState => {
    if (status === 'New') {
      return 'Starting Transaction';
    }
    if (status === 'Submitted' || status === 'Pending') {
      return 'Transaction Pending';
    }
    if (status === 'OnChain' || status === 'Finalized' || status === 'Confirmed') {
      return 'Transaction Complete';
    }
    if (status === 'Cancelled' || status === 'Reverted' || status === 'Failed') {
      return 'Transaction Failed';
    }
    return 'Starting Transaction'; // fallback
  };

  // Function to update status with minimum display duration
  const updateStatusWithDelay = (newStatus: TransactionStatusState) => {
    const now = Date.now();
    const timeSinceLastStatus = now - statusStartTime.current;
    const minDisplayTime = 2000; // 2 seconds
    const failureConfirmationTime = 10000; // 10 seconds for failed status

    // If we're already on a final status, stop polling
    const isFinalStatus =
      currentTransactionStatus === 'Transaction Complete' ||
      currentTransactionStatus === 'Transaction Failed';
    if (isFinalStatus) {
      setIsPollingActive(false);
      return;
    }

    // Don't update if we're already on this status
    if (currentTransactionStatus === newStatus) {
      return;
    }

    // If we get a success status, cancel any pending failure timeout
    if (newStatus === 'Transaction Complete') {
      if (failureTimeoutId) {
        clearTimeout(failureTimeoutId);
        setFailureTimeoutId(null);
      }
      setHasSeenSuccess(true);
      hasSeenSuccessRef.current = true;
      setCurrentTransactionStatus('Transaction Complete');
      statusStartTime.current = now;
      setIsPollingActive(false);
      return;
    }

    // Special handling for failed status - wait 10 seconds before confirming
    if (newStatus === 'Transaction Failed') {
      if (hasSeenSuccess || hasSeenSuccessRef.current) {
        return;
      }

      // If we haven't set to pending yet, do it now
      if (currentTransactionStatus !== 'Transaction Pending') {
        setCurrentTransactionStatus('Transaction Pending');
        statusStartTime.current = now;
      }

      const timeoutId = setTimeout(() => {
        if (hasSeenSuccessRef.current) {
          setFailureTimeoutId(null);
          return;
        }
        setCurrentTransactionStatus('Transaction Failed');
        statusStartTime.current = Date.now();
        setIsPollingActive(false);
        setFailureTimeoutId(null);
      }, failureConfirmationTime);
      setFailureTimeoutId(timeoutId);
      return;
    }

    // For normal status transitions (Starting -> Pending)
    if (timeSinceLastStatus < minDisplayTime) {
      const remainingTime = minDisplayTime - timeSinceLastStatus;
      // Clear any existing normal timeout before setting a new one
      if (normalTimeoutIdRef.current) {
        clearTimeout(normalTimeoutIdRef.current);
      }
      normalTimeoutIdRef.current = setTimeout(() => {
        setCurrentTransactionStatus(newStatus);
        statusStartTime.current = Date.now();
        normalTimeoutIdRef.current = null;
      }, remainingTime);
    } else {
      setCurrentTransactionStatus(newStatus);
      statusStartTime.current = now;
    }
  };

  // Track when steps complete
  useEffect(() => {
    const now = new Date();

    if (
      currentTransactionStatus === 'Transaction Pending' ||
      currentTransactionStatus === 'Transaction Complete' ||
      currentTransactionStatus === 'Transaction Failed'
    ) {
      setSubmittedAt((prev) => prev || now);
    }

    if (
      currentTransactionStatus === 'Transaction Complete' ||
      currentTransactionStatus === 'Transaction Failed'
    ) {
      setPendingCompletedAt((prev) => prev || now);
    }
  }, [currentTransactionStatus]);

  // Cleanup timeouts on unmount or when failureTimeoutId changes
  useEffect(() => {
    return () => {
      if (failureTimeoutId) {
        clearTimeout(failureTimeoutId);
      }
      if (normalTimeoutIdRef.current) {
        clearTimeout(normalTimeoutIdRef.current);
        normalTimeoutIdRef.current = null;
      }
    };
  }, [failureTimeoutId]);

  // Polling effect for UserOp status
  useEffect(() => {
    const chainId = selectedToken?.chainId || 1;

    if (!userOpHash || !chainId || !isPollingActive) {
      return undefined;
    }

    const pollStatus = async () => {
      if (!isPollingActive) {
        return;
      }

      try {
        const response = await getUserOperationStatus(chainId, userOpHash);

        if (!response) {
          return;
        }

        if (!response.status) {
          return;
        }

        const newUserOpStatus = response.status as UserOpStatus;
        const newTransactionStatus =
          mapUserOpStatusToTransactionStatus(newUserOpStatus);

        if (newTransactionStatus === 'Transaction Complete') {
          setHasSeenSuccess(true);
          hasSeenSuccessRef.current = true;
        }

        if (
          (hasSeenSuccess || hasSeenSuccessRef.current) &&
          newTransactionStatus === 'Transaction Failed'
        ) {
          return;
        }

        if (response.transaction) {
          const firstObservation = !blockchainTxHashRef.current;
          setBlockchainTxHash(response.transaction);
          blockchainTxHashRef.current = response.transaction;
          if (firstObservation && failureGraceExpiryRef.current == null) {
            failureGraceExpiryRef.current = Date.now() + 10000;
          }
        }

        if (newTransactionStatus === 'Transaction Failed') {
          const nowTs = Date.now();
          const hasOnChainHash = Boolean(blockchainTxHashRef.current);
          if (hasOnChainHash) {
            if (failureGraceExpiryRef.current == null) {
              failureGraceExpiryRef.current = nowTs + 10000;
              return;
            }
            if (nowTs < failureGraceExpiryRef.current) {
              return;
            }
          }
        }

        updateStatusWithDelay(newTransactionStatus);

        if (newTransactionStatus === 'Transaction Failed') {
          const errorMessage =
            response.reason ||
            response.error ||
            'Transaction failed. Please try again.';
          setErrorDetails(errorMessage);
        }
      } catch (error) {
        console.error('Failed to get transaction status:', error);
      }
    };

    const intervalId = setInterval(pollStatus, 3000);
    pollStatus();

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userOpHash,
    selectedToken?.chainId,
    isPollingActive,
    // Note: currentTransactionStatus and hasSeenSuccess are intentionally excluded
    // to prevent effect re-runs during polling. We use refs for these values.
  ]);

  const closeTransactionStatus = () => {
    setShowTransactionStatus(false);

    const isFinalStatus =
      currentTransactionStatus === 'Transaction Complete' ||
      currentTransactionStatus === 'Transaction Failed';

    if (isFinalStatus) {
      setIsPollingActive(false);
      if (failureTimeoutId) {
        clearTimeout(failureTimeoutId);
        setFailureTimeoutId(null);
      }
    }

    // Only mark onboarding as completed if transaction was successful
    if (currentTransactionStatus === 'Transaction Complete') {
      markOnboardingComplete();
    }

    setOnboardingScreen(null);
  };

  // Calculate the steps to show
  const getSteps = () => {
    const steps = [];

    // Step 1: Enable 7702 (only if eligible for 7702 upgrade)
    if (isEIP7702Eligible) {
      steps.push({
        icon: (
          <img src={Install7702Icon} alt="Enable 7702" className="w-9 h-9" />
        ),
        title: 'Enable 7702',
        description: 'Upgrade wallet for smart actions',
        bgColor: 'bg-[rgba(92,255,147,0.1)]',
      });
    }

    // Step 2: Install modules (if modules not installed and not 7702 eligible)
    if (!areModulesInstalled && !isEIP7702Eligible) {
      steps.push({
        icon: (
          <img
            src={OnboardingInstallModulesIcon}
            alt="Install modules"
            className="w-9 h-9"
          />
        ),
        title: 'Install modules',
        description: 'Add trading & gas features',
        bgColor: 'bg-[rgba(255,234,114,0.1)]',
      });
    }

    // Step 3: Swap to USDC (only for non-USDC tokens)
    if (!isSelectedTokenUSDC() && sellOffer && selectedToken) {
      // Calculate token amount from USD amount using token price
      // For display purposes, we can derive it from the sell offer
      const usdcReceived = sellOffer.tokenAmountToReceive;
      steps.push({
        icon: (
          <img
            src={OnboardingSwapIcon}
            alt="Swap to USDC"
            className="w-9 h-9"
          />
        ),
        title: 'Swap to USDC',
        description: `$${parseFloat(amount).toFixed(2)} ${selectedToken.symbol} for ${usdcReceived.toFixed(2)} USDC`,
        bgColor: 'bg-[rgba(75,144,255,0.1)]',
      });
    }

    // Step 4: Deposit to Gas Tank
    const depositAmount = isSelectedTokenUSDC()
      ? parseFloat(amount)
      : allocateAmount;
    steps.push({
      icon: (
        <img src={OnboardingGasTankIcon} alt="Gas Tank" className="w-9 h-9" />
      ),
      title: 'Deposit to Gas Tank',
      description: `$${depositAmount.toFixed(2)} USDC into Gas Tank`,
      bgColor: 'bg-[rgba(255,54,108,0.1)]',
    });

    return steps;
  };

  const steps = getSteps();

  // If showing transaction status, render TransactionStatus component
  if (showTransactionStatus && selectedToken) {
    return (
      <div className="w-full max-w-[358px] mx-auto flex items-center justify-center">
        <TransactionStatus
          closeTransactionStatus={closeTransactionStatus}
          userOpHash={userOpHash}
          chainId={selectedToken.chainId}
          gasFee={transactionGasFee}
          isBuy={false}
          sellToken={{
            name: selectedToken.name,
            symbol: selectedToken.symbol,
            logo: selectedToken.logo,
            address: selectedToken.address,
          }}
          buyToken={null}
          tokenAmount={amount}
          sellOffer={sellOffer}
          payingTokens={payingTokens}
          usdAmount={amount}
          useRelayBuy={false}
          currentStatus={currentTransactionStatus}
          errorDetails={errorDetails}
          submittedAt={submittedAt}
          pendingCompletedAt={pendingCompletedAt}
          blockchainTxHash={blockchainTxHash}
          resourceLockTxHash={undefined}
          completedTxHash={undefined}
          completedChainId={undefined}
          resourceLockChainId={undefined}
          resourceLockCompletedAt={undefined}
          isResourceLockFailed={false}
          fromChainId={selectedToken.chainId}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[358px] mx-auto">
      <div className="w-full flex flex-col bg-[#1E1D24] rounded-2xl p-0 relative">
        {/* Header */}
        <div className="flex items-center justify-between p-3">
          <button
            onClick={onBack}
            type="button"
            className="text-white flex items-center justify-center"
            aria-label="Go back"
          >
            <img src={BackArrow} alt="Back" className="w-3 h-3" />
          </button>

          <h2 className="text-white font-medium text-xl leading-5 tracking-tight">
            Preview
          </h2>

          <button
            onClick={onBack}
            type="button"
            className="flex items-center justify-center w-10 h-10 bg-[#121116] rounded-lg p-0.5 cursor-pointer"
            aria-label="Close preview"
          >
            <div className="flex items-center justify-center w-full h-full bg-[#1E1D24] rounded-lg">
              <span className="text-white opacity-50 font-medium text-[13px] tracking-tight">
                ESC
              </span>
            </div>
          </button>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-2 px-3 pb-3 relative">
          {steps.map((step, index) => (
            <div key={index}>
              <div className="flex flex-col items-start p-1.5 border border-[#25232D] rounded-xl">
                <div className="flex items-center gap-1.5 w-full">
                  {/* Icon */}
                  <div
                    className={`w-9 h-9 ${step.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
                  >
                    {step.icon}
                  </div>

                  {/* Text */}
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-white text-sm tracking-tight">
                      {step.title}
                    </span>
                    <span className="text-white opacity-50 text-sm tracking-tight">
                      {step.description}
                    </span>
                  </div>
                </div>
              </div>

              {/* Connector arrow */}
              {index < steps.length - 1 && (
                <div className="flex justify-center -my-2 relative z-10">
                  <img
                    src={ArrowDownOnboarding}
                    alt="Arrow down"
                    className="w-5 h-5"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Fees */}
        <div className="flex items-center justify-center gap-1.5 px-3 pb-3">
          <span className="text-white opacity-50 text-[13px] tracking-tight">
            Gas fee:
          </span>
          {isEstimatingGas ? (
            <div className="flex items-center">
              <TailSpin color="#FFFFFF" height={12} width={12} />
            </div>
          ) : (
            <span className="text-white text-[13px] tracking-tight">
              {gasCostNative && nativeTokenSymbol
                ? `≈ ${formatExponentialSmallNumber(limitDigitsNumber(parseFloat(gasCostNative)))} ${nativeTokenSymbol}`
                : '≈ 0.00'}
            </span>
          )}
        </div>

        {/* Setup Error Display (Module Installation / EIP-7702 Upgrade) */}
        {setupError && (
          <div className="m-2.5 p-2.5 bg-red-500/10 border border-red-500 rounded-[10px]">
            <div className="text-red-300 text-xs mb-2">{setupError}</div>
            <button
              onClick={() => setSetupError(null)}
              type="button"
              className="text-red-300 text-xs underline hover:text-red-200"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Error Display */}
        {topUpError && (
          <div className="m-2.5 p-2.5 bg-red-500/10 border border-red-500 rounded-[10px]">
            <div className="text-red-300 text-xs">{topUpError}</div>
          </div>
        )}

        {/* Gas Estimation Error Display */}
        {gasEstimationError && (
          <div className="m-2.5 p-2.5 bg-yellow-500/10 border border-yellow-500 rounded-[10px]">
            <div className="text-yellow-300 text-xs">{gasEstimationError}</div>
          </div>
        )}

        {/* Confirm Button */}
        {!isTransactionRejected && (
          <div className="flex w-auto h-[50px] rounded-[10px] bg-[#121116] p-[2px_2px_6px_2px] mx-3 mb-3">
            <button
              onClick={handleConfirm}
              type="button"
              className={`flex items-center justify-center w-full rounded-lg text-white font-normal text-base ${
                isLoading || isEstimatingGas || setupError
                  ? 'bg-[#29292F]'
                  : 'bg-[#8A77FF]'
              }`}
              disabled={isLoading || isEstimatingGas || !!setupError}
              data-testid="pulse-preview-topup-confirm-button"
            >
              {isLoading || isEstimatingGas ? (
                <div className="flex items-center justify-center gap-2">
                  <TailSpin color="#FFFFFF" height={20} width={20} />
                  <span>
                    {isEstimatingGas ? 'Estimating Gas...' : 'Confirming...'}
                  </span>
                </div>
              ) : (
                'Confirm Transaction'
              )}
            </button>
          </div>
        )}

        {/* Waiting for Signature */}
        {isWaitingForSignature && !isTransactionRejected && (
          <div className="text-[#FFAB36] text-[13px] font-normal text-center mt-4 px-3 pb-3">
            Please open your wallet and confirm the transaction.
          </div>
        )}

        {/* Transaction Rejected */}
        {isTransactionRejected && (
          <div className="text-[#FF366C] text-[13px] font-normal text-center mt-4 px-3 pb-3">
            Transaction was cancelled. No funds were moved
          </div>
        )}
      </div>
    </div>
  );
}
