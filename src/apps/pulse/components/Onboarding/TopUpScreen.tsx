import { Dispatch, SetStateAction, useState, useEffect } from 'react';

// assets
import UsdcLogo from '../../assets/usd-coin-usdc-logo.png';
import ArrowDown from '../../assets/arrow-down.svg';
import WalletIcon from '../../assets/wallet.svg';
import { getLogoForChainId } from '../../../../utils/blockchain';

// types
import { SelectedToken } from '../../types/tokens';
import { PortfolioToken } from '../../../../services/tokensData';
import { WalletPortfolioMobulaResponse } from '../../../../types/api';

interface TopUpScreenProps {
  onBack: () => void;
  initialBalance: number;
  setSearching: () => void;
  selectedToken: SelectedToken | null;
  setSelectedToken: Dispatch<SetStateAction<SelectedToken | null>>;
  portfolioTokens: PortfolioToken[];
  walletPortfolioData: WalletPortfolioMobulaResponse | undefined;
}

export default function TopUpScreen(props: TopUpScreenProps) {
  const {
    onBack,
    initialBalance,
    setSearching,
    selectedToken,
    portfolioTokens,
  } = props;
  const [amount, setAmount] = useState<string>('');
  const [allocateAmount, setAllocateAmount] = useState<number>(10);
  const [inputPlaceholder, setInputPlaceholder] = useState<string>('0');

  const quickAmounts = ['10', '20', '50', '100', 'MAX'];

  // Set allocate amount to selected token's balance when token changes
  useEffect(() => {
    if (selectedToken && portfolioTokens.length > 0) {
      // Find the matching portfolio token to get balance
      const portfolioToken = portfolioTokens.find(
        (token) => token.contract.toLowerCase() === selectedToken.address.toLowerCase()
      );

      if (portfolioToken && portfolioToken.balance && portfolioToken.price) {
        const tokenBalanceUsd = portfolioToken.balance * portfolioToken.price;
        setAllocateAmount(parseFloat(tokenBalanceUsd.toFixed(2)));
      }
    }
  }, [selectedToken, portfolioTokens]);

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

  const handleUsdAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  const handleQuickAmountClick = (item: string) => {
    if (item === 'MAX') {
      setAmount(initialBalance.toFixed(2));
    } else {
      setAmount(item);
    }
  };

  const handleAllocateAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    // Only allow numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      const numValue = parseFloat(value) || 0;
      const maxAmount = parseFloat(amount) || 0;
      // Don't allow more than the total amount
      if (numValue <= maxAmount || value === '') {
        setAllocateAmount(numValue);
      }
    }
  };

  const handleAllocateDecrease = () => {
    if (allocateAmount > 0) {
      setAllocateAmount(Math.max(0, allocateAmount - 1));
    }
  };

  const handleAllocateIncrease = () => {
    const maxAmount = parseFloat(amount) || 0;
    if (allocateAmount < maxAmount) {
      setAllocateAmount(Math.min(maxAmount, allocateAmount + 1));
    }
  };

  const handleTopUp = () => {
    // TODO: Implement top up logic
    console.log('Top up:', { amount, allocateAmount, selectedToken });
  };

  const handleTokenSelectorClick = () => {
    setSearching();
  };

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
          <h1 className="text-xl font-medium text-white">Top up</h1>
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
                src={WalletIcon}
                className="w-4 h-3"
                alt="wallet-icon"
                data-testid="pulse-topup-wallet-icon"
              />
              <div
                className="ml-1 text-xs text-[#8A77FF]"
                data-testid="pulse-topup-wallet-balance"
              >
                ${initialBalance.toFixed(2)}
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

        {/* Allocate to Gas Tank */}
        <div className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm">Allocate to Gas Tank:</span>
            <div className="flex items-center gap-2 bg-black rounded-lg px-1 py-1">
              <input
                type="text"
                value={allocateAmount || ''}
                onChange={handleAllocateAmountChange}
                placeholder="0"
                className="no-spinner bg-transparent text-white font-medium w-16 text-left outline-none"
                data-testid="pulse-topup-allocate-input"
              />
              <span className="text-white/50 text-sm">USDC</span>
              <button
                onClick={handleAllocateDecrease}
                type="button"
                className="text-white/50 bg-[#1E1D24] hover:text-white text-xl font-medium w-6 h-6 flex items-center justify-center"
                data-testid="pulse-topup-allocate-decrease"
              >
                −
              </button>
              <button
                onClick={handleAllocateIncrease}
                type="button"
                className="text-white/50 bg-[#1E1D24] hover:text-white text-xl font-medium w-6 h-6 flex items-center justify-center"
                data-testid="pulse-topup-allocate-increase"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Top Up Button */}
        <div className="flex w-auto h-[50px] rounded-[10px] bg-black p-[2px_2px_6px_2px] m-2.5">
          <button
            onClick={handleTopUp}
            type="button"
            className="flex items-center justify-center w-full rounded-lg bg-[#8A77FF] text-white font-medium text-base disabled:opacity-50"
            disabled={parseFloat(amount) <= 0}
            data-testid="pulse-topup-confirm-button"
          >
            Top up {allocateAmount} USDC
          </button>
        </div>
      </div>
    </div>
  );
}
