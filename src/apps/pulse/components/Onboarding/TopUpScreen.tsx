import { Dispatch, SetStateAction, useState, useEffect } from 'react';
import { TailSpin } from 'react-loader-spinner';

// assets
import ArrowDown from '../../assets/arrow-down.svg';
import WalletIcon from '../../assets/wallet.svg';
import { getLogoForChainId } from '../../../../utils/blockchain';

// components
import PreviewTopUp from './PreviewTopUp';

// constants
import { STABLE_CURRENCIES } from '../../constants/tokens';

// hooks
import useRelaySell, { SellOffer } from '../../hooks/useRelaySell';

// types
import { SelectedToken } from '../../types/tokens';
import { PortfolioToken } from '../../../../services/tokensData';

interface TopUpScreenProps {
  onBack: () => void;
  initialBalance: number;
  setSearching: () => void;
  selectedToken: SelectedToken | null;
  portfolioTokens: PortfolioToken[];
  setOnboardingScreen: Dispatch<SetStateAction<'welcome' | 'topup' | null>>;
  markOnboardingComplete: () => void;
  isPortfolioLoading?: boolean;
}

export default function TopUpScreen(props: TopUpScreenProps) {
  const {
    onBack,
    initialBalance,
    setSearching,
    selectedToken,
    portfolioTokens,
    setOnboardingScreen,
    markOnboardingComplete,
    isPortfolioLoading = false,
  } = props;
  const [amount, setAmount] = useState<string>('');
  const [allocateAmount, setAllocateAmount] = useState<number>(10);
  const [inputPlaceholder, setInputPlaceholder] = useState<string>('0');
  const [error, setError] = useState<string | null>(null);
  const [sellOffer, setSellOffer] = useState<SellOffer | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const {
    getBestSellOffer,
    isInitialized: isRelayInitialized,
    error: relayError,
  } = useRelaySell();

  // Check if selected token is USDC
  const isSelectedTokenUSDC = (): boolean => {
    if (!selectedToken) return false;
    return STABLE_CURRENCIES.some(
      (stable) =>
        stable.chainId === selectedToken.chainId &&
        stable.address.toLowerCase() === selectedToken.address.toLowerCase()
    );
  };

  // Get selected token balance info
  const getSelectedTokenBalance = () => {
    if (!selectedToken) {
      return { balance: 0, usdValue: 0, symbol: '' };
    }

    const portfolioToken = portfolioTokens.find(
      (token) =>
        token.contract.toLowerCase() === selectedToken.address.toLowerCase()
    );

    if (portfolioToken && portfolioToken.balance && portfolioToken.price) {
      const { balance } = portfolioToken;
      const usdValue = balance * portfolioToken.price;
      return { balance, usdValue, symbol: selectedToken.symbol };
    }

    return { balance: 0, usdValue: 0, symbol: selectedToken.symbol };
  };

  const quickAmounts = ['10', '20', '50', '100', 'MAX'];

  // Set allocate amount to selected token's balance when token changes
  useEffect(() => {
    if (selectedToken && portfolioTokens.length > 0) {
      // Find the matching portfolio token to get balance
      const portfolioToken = portfolioTokens.find(
        (token) =>
          token.contract.toLowerCase() === selectedToken.address.toLowerCase()
      );

      if (portfolioToken && portfolioToken.balance && portfolioToken.price) {
        const tokenBalanceUsd = portfolioToken.balance * portfolioToken.price;
        setAllocateAmount(parseFloat(tokenBalanceUsd.toFixed(2)));
      }
    }
  }, [selectedToken, portfolioTokens]);

  // Update allocate amount when amount or sell offer changes
  useEffect(() => {
    const usdAmount = parseFloat(amount) || 0;

    if (usdAmount > 0) {
      if (isSelectedTokenUSDC()) {
        // For USDC tokens: Convert USD to USDC amount using USDC price
        const usdcToken = portfolioTokens.find((token) => {
          const isUSDC = STABLE_CURRENCIES.some(
            (stable) =>
              stable.address.toLowerCase() === token.contract.toLowerCase() &&
              selectedToken &&
              stable.chainId === selectedToken.chainId
          );
          return isUSDC;
        });

        const usdcPrice = usdcToken?.price || 1; // Default to 1 if not found
        const usdcAmount = usdAmount / usdcPrice;
        setAllocateAmount(usdcAmount);
      } else if (sellOffer) {
        // For non-USDC tokens: Use the minimum USDC received from swap
        // Round down to 2 decimal places to prevent requesting more than received
        const receivedUsdcAmount = sellOffer.tokenAmountToReceive;
        const roundedDownAmount = Math.floor(receivedUsdcAmount * 100) / 100;
        setAllocateAmount(roundedDownAmount);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, sellOffer, selectedToken, portfolioTokens]);

  // Fetch sell offer for non-USDC tokens
  useEffect(() => {
    const fetchSellOffer = async () => {
      // Only fetch for non-USDC tokens
      if (
        !selectedToken ||
        isSelectedTokenUSDC() ||
        !amount ||
        parseFloat(amount) <= 0
      ) {
        setSellOffer(null);
        return;
      }

      if (!isRelayInitialized) {
        return;
      }

      // Find the token in portfolio to get actual balance and price
      const portfolioToken = portfolioTokens.find(
        (token) =>
          token.contract.toLowerCase() === selectedToken.address.toLowerCase()
      );

      if (!portfolioToken || !portfolioToken.balance || !portfolioToken.price) {
        return;
      }

      setIsLoadingQuote(true);
      try {
        // Convert USD amount to token amount
        // amount is in USD, we need to convert to token amount
        const usdAmount = parseFloat(amount);
        const tokenPrice = portfolioToken.price;
        const tokenAmount = usdAmount / tokenPrice;

        // Get quote for selling the token amount to get USDC
        const offer = await getBestSellOffer({
          fromAmount: tokenAmount.toString(),
          fromTokenAddress: selectedToken.address,
          fromChainId: selectedToken.chainId,
          fromTokenDecimals: selectedToken.decimals,
          toChainId: selectedToken.chainId, // Same chain
        });

        setSellOffer(offer);
      } catch (err) {
        console.error('Failed to get sell offer:', err);
        setSellOffer(null);
      } finally {
        setIsLoadingQuote(false);
      }
    };

    fetchSellOffer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amount,
    selectedToken,
    portfolioTokens,
    isRelayInitialized,
    getBestSellOffer,
  ]);

  // Get chain name from chain ID
  const getChainName = (chainId: number): string => {
    const chainNames: { [key: number]: string } = {
      1: 'Ethereum',
      137: 'Polygon',
      10: 'Optimism',
      42161: 'Arbitrum',
      8453: 'Base',
      56: 'BSC',
    };
    return chainNames[chainId] || 'Unknown';
  };

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const handleUsdAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    // Only allow numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      // Get selected token balance in USD
      const { usdValue } = getSelectedTokenBalance();
      const numValue = parseFloat(value) || 0;

      // Don't allow more than the token's USD balance
      if (numValue > usdValue && value !== '') {
        setError(
          `Amount cannot exceed your balance of $${usdValue.toFixed(2)}`
        );
        return;
      }

      setAmount(value);
      setError(null); // Clear error when user types
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const handleQuickAmountClick = (item: string) => {
    if (item === 'MAX') {
      // Use selected token's USD balance as max
      const { usdValue } = getSelectedTokenBalance();
      setAmount(usdValue.toFixed(2));
    } else {
      setAmount(item);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const handleAllocateAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { value } = e.target;
    // Only allow numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      const numValue = parseFloat(value) || 0;

      // For non-USDC tokens, max is the received USDC amount from sell offer
      let maxAmount: number;
      if (!isSelectedTokenUSDC() && sellOffer) {
        maxAmount = sellOffer.tokenAmountToReceive;
      } else {
        maxAmount = parseFloat(amount) || 0;
      }

      // Don't allow more than the max amount
      if (numValue <= maxAmount || value === '') {
        setAllocateAmount(numValue);
        setError(null); // Clear error when user types
      } else {
        setError(`Allocate amount cannot exceed ${maxAmount.toFixed(2)} USDC`);
      }
    }
  };

  const handleAllocateDecrease = () => {
    const minAmount = 2; // Minimum 2 USDC for gas tank
    if (allocateAmount > minAmount) {
      setAllocateAmount(Math.max(minAmount, allocateAmount - 1));
    }
  };

  const handleAllocateIncrease = () => {
    // For non-USDC tokens, max is the received USDC amount from sell offer
    let maxAmount: number;
    if (!isSelectedTokenUSDC() && sellOffer) {
      maxAmount = sellOffer.tokenAmountToReceive;
    } else {
      maxAmount = parseFloat(amount) || 0;
    }

    if (allocateAmount < maxAmount) {
      setAllocateAmount(Math.min(maxAmount, allocateAmount + 1));
    }
  };

  const handleTopUp = () => {
    // Validation
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!selectedToken) {
      setError('Please select a token');
      return;
    }

    const minAllocateAmount = 2; // Minimum 2 USDC for gas tank
    if (allocateAmount < minAllocateAmount) {
      setError(`Minimum amount is ${minAllocateAmount} USDC`);
      return;
    }

    // Additional validation for non-USDC tokens
    if (!isSelectedTokenUSDC()) {
      if (!sellOffer) {
        setError('Waiting for quote...');
        return;
      }

      const maxAllocateAmount = sellOffer.tokenAmountToReceive;
      if (allocateAmount > maxAllocateAmount) {
        setError(
          `Allocate amount cannot exceed ${maxAllocateAmount.toFixed(2)} USDC`
        );
        return;
      }
    }

    // Check against selected token's USD balance
    const { usdValue } = getSelectedTokenBalance();
    if (numAmount > usdValue) {
      setError(`Insufficient balance. You have $${usdValue.toFixed(2)}`);
      return;
    }

    // Clear any previous errors
    setError(null);

    // Navigate to preview screen
    setShowPreview(true);
  };

  const handleTokenSelectorClick = () => {
    setSearching();
  };

  // Get button text based on state
  const getButtonText = () => {
    // Show loading if either loading state is true OR if we have no portfolio data yet
    if (isPortfolioLoading || portfolioTokens.length === 0) {
      return (
        <div className="flex items-center justify-center gap-2">
          <TailSpin color="#FFFFFF" height={20} width={20} />
          <span>Loading balances...</span>
        </div>
      );
    }

    if (isLoadingQuote) {
      return (
        <div className="flex items-center justify-center gap-2">
          <TailSpin color="#FFFFFF" height={20} width={20} />
          <span>Getting quote...</span>
        </div>
      );
    }

    // For USDC tokens, show simple text
    if (isSelectedTokenUSDC()) {
      const usdcAmount = parseFloat(amount) || 0;
      if (usdcAmount > 0) {
        return `Top up ${usdcAmount.toFixed(2)} USDC`;
      }
      return 'Top up USDC';
    }

    // For non-USDC tokens, show the swap quote
    if (sellOffer && selectedToken && parseFloat(amount) > 0) {
      const usdAmount = parseFloat(amount);
      const usdcReceived = sellOffer.tokenAmountToReceive;

      // Get token price from portfolio to calculate token amount
      const portfolioToken = portfolioTokens.find(
        (token) =>
          token.contract.toLowerCase() === selectedToken.address.toLowerCase()
      );

      if (portfolioToken && portfolioToken.price) {
        const tokenAmount = usdAmount / portfolioToken.price;
        return (
          <span>
            Swap {tokenAmount.toFixed(4)} {selectedToken.symbol} for ~
            {usdcReceived.toFixed(2)} USDC
          </span>
        );
      }
    }

    // Default text
    if (selectedToken) {
      return `Top up ${selectedToken.symbol}`;
    }
    return 'Top up';
  };

  // Show preview screen if user clicked top up
  if (showPreview) {
    return (
      <PreviewTopUp
        onBack={() => setShowPreview(false)}
        selectedToken={selectedToken}
        amount={amount}
        allocateAmount={allocateAmount}
        sellOffer={sellOffer}
        userPortfolio={portfolioTokens}
        setOnboardingScreen={setOnboardingScreen}
        markOnboardingComplete={markOnboardingComplete}
      />
    );
  }

  return (
    <div className="w-full max-w-[446px]">
      <div
        className="w-full flex flex-col border-2 border-[#1E1D24] min-h-[264px] bg-[#1E1D24] rounded-2xl"
        data-testid="pulse-topup-screen"
      >
        {/* Header */}
        <div className="flex items-center p-3">
          <button
            onClick={onBack}
            type="button"
            className="mr-2 text-white flex items-center justify-center"
            aria-label="Go back"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18L9 12L15 6"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h1 className="text-xl font-medium text-white">Top up Gas Tank</h1>
        </div>

        {/* Subtitle */}
        <p className="text-white/50 px-4 pb-3 text-xs">
          Select Fee Tokens and Input Amount
        </p>

        <div className="flex flex-col bg-[#121116] rounded-[10px] m-3">
          {/* Token Selector and Amount Input */}
          <div className="flex justify-between p-3">
            <button
              type="button"
              className="flex items-center justify-center max-w-[150px] w-32 h-9 rounded-[10px] p-1"
              onClick={handleTokenSelectorClick}
              data-testid="pulse-topup-token-selector"
            >
              {selectedToken ? (
                <div className="flex items-center justify-center max-w-[150px] w-32 h-9 bg-[#1E1D24] rounded-[10px]">
                  <div className="flex ml-1.5 mr-1">
                    <div className="relative inline-block">
                      <img
                        src={selectedToken.logo}
                        alt={selectedToken.symbol}
                        className="w-4 h-4 rounded-full"
                      />
                      <img
                        src={getLogoForChainId(selectedToken.chainId)}
                        className="w-2 h-2 absolute bottom-[-2px] right-[-2px] rounded-full"
                        alt="Chain Logo"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-start">
                    <p className="ml-1 font-normal desktop:text-sm mobile:text-xs xs:text-xs text-white">
                      {selectedToken.symbol}
                    </p>
                    <p className="ml-1 opacity-30 font-normal desktop:text-sm mobile:text-xs xs:text-xs text-white">
                      {getChainName(selectedToken.chainId)}
                    </p>
                  </div>
                  <div className="flex m-1.5">
                    <img src={ArrowDown} className="w-2 h-1" alt="arrow-down" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center max-w-[150px] w-32 h-9 bg-[#1E1D24] rounded-[10px]">
                  <div className="flex ml-1.5 font-normal desktop:text-sm tablet:text-sm mobile:text-xs xs:text-xs justify-items-end">
                    Select token
                  </div>
                  <div className="flex ml-1.5">
                    <img src={ArrowDown} className="w-2 h-1" alt="arrow-down" />
                  </div>
                </div>
              )}
            </button>
            <div className="flex max-w-60 desktop:w-60 tablet:w-60 mobile:w-56 xs:w-44 items-right overflow-hidden">
              <div className="flex items-center max-w-60 desktop:w-60 tablet:w-60 mobile:w-56 xs:w-44 text-right justify-end bg-transparent outline-none pr-0 h-9">
                <input
                  className="no-spinner flex mobile:text-4xl xs:text-4xl desktop:text-4xl tablet:text-4xl desktop:w-40 tablet:w-40 mobile:w-36 xs:w-24 font-medium text-right"
                  placeholder={inputPlaceholder}
                  onChange={handleUsdAmountChange}
                  value={amount}
                  type="text"
                  onFocus={() => setInputPlaceholder('')}
                  onBlur={() => setInputPlaceholder('0')}
                  data-testid="pulse-topup-amount-input"
                />
                <span className="mobile:text-4xl xs:text-4xl desktop:text-4xl tablet:text-4xl desktop:w-20 tablet:w-20 mobile:w-20 xs:w-20 font-medium overflow-hidden text-[#FFFFFF4D]">
                  USD
                </span>
              </div>
            </div>
          </div>

          {/* Wallet Balance */}
          <div className="flex justify-end p-3 pt-0">
            <div className="flex items-center">
              <img
                src={selectedToken ? selectedToken.logo : WalletIcon}
                className="w-4 h-4 rounded-full"
                alt={
                  selectedToken ? `${selectedToken.symbol}-icon` : 'wallet-icon'
                }
                data-testid="pulse-topup-wallet-icon"
              />
              <div
                className="ml-1 text-xs text-[#8A77FF]"
                data-testid="pulse-topup-wallet-balance"
              >
                {selectedToken ? (
                  <>
                    {getSelectedTokenBalance().balance.toFixed(4)}{' '}
                    {getSelectedTokenBalance().symbol}
                    <span className="text-white/50">
                      {' '}
                      (${getSelectedTokenBalance().usdValue.toFixed(2)})
                    </span>
                  </>
                ) : (
                  `$${initialBalance.toFixed(2)}`
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Amount Buttons */}
        <div className="flex w-full">
          {quickAmounts.map((item) => {
            const isMax = item === 'MAX';

            return (
              <div
                key={item}
                className="flex bg-black ml-2.5 mr-2.5 w-[75px] h-[30px] rounded-[10px] p-0.5 pb-1 pt-0.5"
              >
                <button
                  className="flex-1 items-center justify-center rounded-[10px] bg-[#121116] text-white cursor-pointer"
                  onClick={() => handleQuickAmountClick(item)}
                  type="button"
                  data-testid={`pulse-topup-amount-button-${item.toLowerCase()}`}
                >
                  <span className="opacity-50 font-normal text-sm">
                    {isMax ? 'MAX' : `$${item}`}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Allocate to Gas Tank - Only show for non-USDC tokens */}
        {!isSelectedTokenUSDC() && (
          <div className="p-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-white text-sm">
                  Allocate to Gas Tank:
                  {isLoadingQuote && (
                    <span className="text-xs text-white/50 ml-1">
                      (Loading...)
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2 bg-black rounded-lg px-1 py-1">
                  <input
                    type="text"
                    value={allocateAmount || ''}
                    onChange={handleAllocateAmountChange}
                    placeholder="0"
                    className="no-spinner bg-transparent text-white font-medium w-16 text-left outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="pulse-topup-allocate-input"
                    disabled={isLoadingQuote || !sellOffer}
                  />
                  <span className="text-white/50 text-sm">USDC</span>
                  <button
                    onClick={handleAllocateDecrease}
                    type="button"
                    className="text-white/50 bg-[#1E1D24] hover:text-white text-xl font-medium w-6 h-6 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="pulse-topup-allocate-decrease"
                    disabled={isLoadingQuote || !sellOffer}
                  >
                    −
                  </button>
                  <button
                    onClick={handleAllocateIncrease}
                    type="button"
                    className="text-white/50 bg-[#1E1D24] hover:text-white text-xl font-medium w-6 h-6 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="pulse-topup-allocate-increase"
                    disabled={isLoadingQuote || !sellOffer}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="text-xs text-white/50 mt-1">Minimum: 2 USDC</div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {(error || relayError) && (
          <div className="m-2.5 p-2.5 bg-red-500/10 border border-red-500 rounded-[10px]">
            <div
              className="text-red-300 text-xs"
              data-testid="pulse-topup-error-message"
            >
              {error || relayError}
            </div>
          </div>
        )}

        {/* Top Up Button */}
        <div className="flex w-auto h-[50px] rounded-[10px] bg-black p-[2px_2px_6px_2px] m-2.5">
          <button
            onClick={handleTopUp}
            type="button"
            className="flex items-center justify-center w-full rounded-lg text-white font-medium text-base disabled:opacity-50 transition-colors"
            style={{
              backgroundColor:
                parseFloat(amount) <= 0 ||
                isPortfolioLoading ||
                portfolioTokens.length === 0 ||
                isLoadingQuote ||
                (!isSelectedTokenUSDC() &&
                  !sellOffer &&
                  parseFloat(amount) > 0) ||
                relayError ||
                error
                  ? '#29292F'
                  : '#8A77FF',
            }}
            disabled={
              parseFloat(amount) <= 0 ||
              isPortfolioLoading ||
              portfolioTokens.length === 0 ||
              isLoadingQuote ||
              (!isSelectedTokenUSDC() &&
                !sellOffer &&
                parseFloat(amount) > 0) ||
              !!relayError ||
              !!error
            }
            data-testid="pulse-topup-confirm-button"
          >
            {getButtonText()}
          </button>
        </div>
      </div>
    </div>
  );
}
