import { parseInt } from 'lodash';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

// types
import { WalletPortfolioMobulaResponse } from '../../../../types/api';
import { SelectedToken } from '../../types/tokens';

// utils
import { getLogoForChainId } from '../../../../utils/blockchain';
import {
  formatExponentialSmallNumber,
  limitDigitsNumber,
} from '../../../../utils/number';
import { logPulseError } from '../../utils/sentry';

// components
import HighDecimalsFormatted from '../../../pillarx-app/components/HighDecimalsFormatted/HighDecimalsFormatted';
import RandomAvatar from '../../../pillarx-app/components/RandomAvatar/RandomAvatar';
import ArrowDown from '../../assets/arrow-down.svg';
import WarningIcon from '../../assets/warning.svg';
import PnLStats from '../PnLStats/PnLStats';
import SellButton from './SellButton';

// hooks
import { useTokenPnL } from '../../../../hooks/useTokenPnL';
import useTransactionKit from '../../../../hooks/useTransactionKit';
import useRelaySell, { SellOffer } from '../../hooks/useRelaySell';

// services
import { useGetWalletTransactionsQuery } from '../../../../services/pillarXApiWalletTransactions';
import { PortfolioToken } from '../../../../services/tokensData';
import { getChainId, MobulaChainNames } from '../../utils/constants';

interface SellProps {
  setSearching: Dispatch<SetStateAction<boolean>>;
  token: SelectedToken | null;
  walletPortfolioData: WalletPortfolioMobulaResponse | undefined;
  setPreviewSell: Dispatch<SetStateAction<boolean>>;
  setSellOffer: Dispatch<SetStateAction<SellOffer | null>>;
  setTokenAmount: Dispatch<SetStateAction<string>>;
  isRefreshing?: boolean;
  portfolioTokens: PortfolioToken[];
  customSellAmounts: string[];
  selectedChainIdForSettlement: number;
}

const Sell = (props: SellProps) => {
  const {
    setSearching,
    token,
    walletPortfolioData,
    setPreviewSell,
    setSellOffer,
    setTokenAmount: setParentTokenAmount,
    isRefreshing = false,
    portfolioTokens = [],
    customSellAmounts,
    selectedChainIdForSettlement,
  } = props;
  const [tokenAmount, setTokenAmount] = useState<string>('');
  const [debouncedTokenAmount, setDebouncedTokenAmount] = useState<string>('');
  const [inputPlaceholder, setInputPlaceholder] = useState<string>('0.00');
  const [notEnoughLiquidity, setNotEnoughLiquidity] = useState<boolean>(false);
  const [showNumInP, setShowNumInP] = useState(false);
  const [sellOffer, setLocalSellOffer] = useState<SellOffer | null>(null);
  const [isLoadingOffer, setIsLoadingOffer] = useState<boolean>(false);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  const [truncatedFlag, setTruncatedFlag] = useState<boolean>(false);
  const { walletAddress: accountAddress } = useTransactionKit();

  // Fetch transactions for PnL
  const {
    data: transactionsData,
    isLoading: isTransactionsLoading,
    refetch: refetchTransactions,
  } = useGetWalletTransactionsQuery(
    { wallet: accountAddress || '' },
    { skip: !accountAddress }
  );

  // Find matching portfolio token to get balance and price
  const portfolioToken = useMemo(() => {
    if (!token || !portfolioTokens || portfolioTokens.length === 0) return null;

    return portfolioTokens.find(
      (pt) =>
        pt.contract.toLowerCase() === token.address.toLowerCase() &&
        Number(getChainId(pt.blockchain as MobulaChainNames)) === token.chainId
    );
  }, [token, portfolioTokens]);

  // Calculate PnL for selected token with proper balance and price
  const { pnl, isLoading: isPnLLoading } = useTokenPnL(
    token && accountAddress && portfolioToken
      ? {
          token: {
            contract: token.address || '',
            symbol: token.symbol,
            decimals: token.decimals || 18,
            balance: portfolioToken.balance || 0,
            price: portfolioToken.price || 0,
          },
          transactionsData,
          walletAddress: accountAddress,
          chainId: token.chainId,
        }
      : null
  );

  // Refetch transactions when parent triggers refresh
  // If transactionsData changes, useTokenPnL will automatically recalculate
  useEffect(() => {
    if (isRefreshing && refetchTransactions) {
      refetchTransactions();
    }
  }, [isRefreshing, refetchTransactions]);

  const {
    getBestSellOffer,
    getBestSellOfferWithBridge,
    isInitialized,
    error: relayError,
  } = useRelaySell();

  const fetchSellOffer = useCallback(async () => {
    if (
      debouncedTokenAmount &&
      token &&
      isInitialized &&
      parseFloat(debouncedTokenAmount) > 0 &&
      !notEnoughLiquidity
    ) {
      setIsLoadingOffer(true);
      try {
        if (token.chainId === selectedChainIdForSettlement) {
          const offer = await getBestSellOffer({
            fromAmount: debouncedTokenAmount,
            fromTokenAddress: token.address,
            fromChainId: token.chainId,
            fromTokenDecimals: token.decimals,
            toChainId: selectedChainIdForSettlement,
          });
          setLocalSellOffer(offer);
        } else {
          const offer = await getBestSellOfferWithBridge({
            fromAmount: debouncedTokenAmount,
            fromTokenAddress: token.address,
            fromChainId: token.chainId,
            fromTokenDecimals: token.decimals,
            toChainId: selectedChainIdForSettlement,
          });
          setLocalSellOffer(offer);
        }
      } catch (error) {
        console.error('Failed to fetch sell offer:', error);

        // Only log actual errors, not user rejections
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isUserRejection =
          errorMessage.toLowerCase().includes('reject') ||
          errorMessage.toLowerCase().includes('denied');

        if (!isUserRejection) {
          logPulseError(
            error instanceof Error ? error : new Error(String(error)),
            {
              operation: 'fetch_relay_sell_offer',
              sellToken: token.symbol,
              amount: debouncedTokenAmount,
              fromChainId: token.chainId,
              toChainId: selectedChainIdForSettlement,
            },
            { operation_type: 'relay_sell_quote' }
          );
        }

        setLocalSellOffer(null);
      } finally {
        setIsLoadingOffer(false);
      }
    } else if (!debouncedTokenAmount || parseFloat(debouncedTokenAmount) <= 0) {
      setLocalSellOffer(null);
      setIsLoadingOffer(false);
    } else if (notEnoughLiquidity) {
      setLocalSellOffer(null);
      setIsLoadingOffer(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTokenAmount, token, isInitialized, notEnoughLiquidity]);

  // Get the user's balance for the selected token
  const getTokenBalance = () => {
    try {
      if (!token || !walletPortfolioData?.result?.data?.assets) return 0;

      // Find the asset in the portfolio
      const assetData = walletPortfolioData.result.data.assets.find(
        (asset) =>
          asset.asset.symbol === token.symbol &&
          asset.contracts_balances.some(
            (contract) =>
              contract.address.toLowerCase() === token.address.toLowerCase()
          )
      );

      if (!assetData) return 0;

      // Find the contract balance for the specific token address and chain
      const contractBalance = assetData.contracts_balances.find(
        (contract) =>
          contract.address.toLowerCase() === token.address.toLowerCase() &&
          contract.chainId === `evm:${token.chainId}`
      );
      return contractBalance?.balance || 0;
    } catch (error) {
      console.error('Error getting token balance:', error);

      // Log portfolio data access errors
      logPulseError(
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'get_token_balance',
          sellToken: token?.symbol,
          chainId: token?.chainId,
        },
        { operation_type: 'portfolio_data_access' }
      );

      return 0;
    }
  };

  // Calculate token balance (must be after getTokenBalance function)
  const tokenBalance = getTokenBalance();

  const handleTokenAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    if (!input || !Number.isNaN(parseFloat(input))) {
      setInputPlaceholder('0.00');
      setTokenAmount(input);
      setParentTokenAmount(input);

      if (input && token) {
        const inputAmount = parseFloat(input);
        setNotEnoughLiquidity(inputAmount > tokenBalance);
      } else {
        setNotEnoughLiquidity(false);
      }
    }
  };

  // Debounce token amount changes to fetch sell offers
  useEffect(() => {
    const timer = setTimeout(() => {
      // Always update debouncedTokenAmount, even if empty
      // This ensures clearing input properly clears the offer
      setDebouncedTokenAmount(tokenAmount);
    }, 1000);

    return () => clearTimeout(timer);
  }, [tokenAmount]);

  // Recalculate liquidity when token, balance, or amount changes
  useEffect(() => {
    if (tokenAmount && tokenAmount.trim() !== '') {
      const inputAmount = parseFloat(tokenAmount);
      if (!Number.isNaN(inputAmount)) {
        setNotEnoughLiquidity(inputAmount > tokenBalance);
      } else {
        setNotEnoughLiquidity(false);
      }
    } else {
      setNotEnoughLiquidity(false);
    }
  }, [token, tokenBalance, tokenAmount]);

  // Fetch sell offer when debounced amount changes
  useEffect(() => {
    fetchSellOffer();
  }, [fetchSellOffer]);

  return (
    <div className="flex flex-col w-full" data-testid="pulse-sell-component">
      <div className="m-2.5 bg-[#121116] min-h-[100px] rounded-lg">
        <div className="flex items-center p-3">
          <button
            onClick={() => {
              setSearching(true);
            }}
            type="button"
            className="flex-shrink-0"
            data-testid="pulse-sell-token-selector"
          >
            {token ? (
              <div
                className="relative w-[113px] h-[36px] bg-[#1E1D24] rounded-[6px] shrink-0"
                data-testid={`pulse-sell-token-selected-${token.chainId}-${token.name}`}
              >
                {/* Logo */}
                <div className="absolute left-[6px] top-[6px] w-[24px] h-[24px]">
                  {token.logo ? (
                    <img
                      src={token.logo}
                      alt="Main"
                      className="w-full h-full rounded-full"
                    />
                  ) : (
                    <div className="w-full h-full overflow-hidden rounded-full">
                      <RandomAvatar name={token.name || ''} />
                      <span className="absolute inset-0 flex items-center justify-center text-white text-[10px]">
                        {token.name?.slice(0, 2)}
                      </span>
                    </div>
                  )}
                  <img
                    src={getLogoForChainId(token.chainId)}
                    className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 rounded-full ring-1 ring-[#1E1D24]"
                    alt="Chain Logo"
                  />
                </div>

                {/* Top Row: Symbol and Name */}
                <div className="absolute left-[36px] top-[6px] flex items-center gap-[4px] max-w-[90px]">
                  <p
                    className="font-normal text-[12px] leading-[12px] tracking-[-0.02em] text-white truncate shrink-0 max-w-[50px]"
                    data-testid="pulse-sell-token-selector-symbol"
                  >
                    {token.symbol}
                  </p>
                  <p
                    className="font-normal text-[12px] leading-[12px] tracking-[-0.02em] text-white opacity-30 truncate block"
                    data-testid="pulse-sell-token-selector-name"
                  >
                    {token.name}
                  </p>
                </div>

                {/* Bottom Row: Price and Change */}
                <div className="absolute left-[36px] top-[20px] flex items-center gap-[6px]">
                  <p
                    className="font-normal text-[10px] leading-[10px] tracking-[-0.02em] text-white opacity-50"
                    data-testid="pulse-sell-token-selector-price"
                  >
                    ${formatExponentialSmallNumber(token.usdValue)}
                  </p>

                  <div className="flex items-center gap-[2px]">
                    {/* Triangle Indicator */}
                    {token.dailyPriceChange !== 0 && (
                      <div
                        className={`w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent ${
                          token.dailyPriceChange >= 0
                            ? 'border-b-[6px] border-b-[#5CFF93]'
                            : 'border-t-[6px] border-t-[#FF366C]'
                        } opacity-50`}
                      />
                    )}

                    <p
                      className={`font-normal text-[10px] leading-[10px] tracking-[-0.02em] opacity-50 ${
                        token.dailyPriceChange >= 0
                          ? 'text-[#5CFF93]'
                          : 'text-[#FF366C]'
                      }`}
                    >
                      {Math.abs(token.dailyPriceChange).toFixed(2)}%
                    </p>
                  </div>
                </div>

                {/* Chevron */}
                <div className="absolute right-[12px] top-[15px]">
                  <img
                    src={ArrowDown}
                    className="w-[12px] h-[6px] opacity-50"
                    alt="arrow-down"
                  />
                </div>
              </div>
            ) : (
              <div className="relative w-[113px] h-[36px] bg-[#1E1D24] rounded-[6px]">
                <div
                  className="absolute left-[12px] top-[12px] font-normal text-[12px] leading-[12px] tracking-[-0.02em] text-white"
                  data-testid="pulse-sell-token-selector-placeholder"
                >
                  Select token
                </div>
                {/* Chevron */}
                <div className="absolute right-[12px] top-[15px]">
                  <img
                    src={ArrowDown}
                    className="w-[12px] h-[6px] opacity-50"
                    alt="arrow-down"
                  />
                </div>
              </div>
            )}
          </button>
          <div className="flex flex-1 max-w-60 desktop:w-60 tablet:w-60 mobile:w-56 xs:w-auto items-right ml-auto">
            <div className="flex items-center flex-1 desktop:w-60 tablet:w-60 mobile:w-56 xs:w-auto text-right justify-end bg-transparent outline-none pr-0 h-9">
              {showNumInP ? (
                <>
                  <div
                    className="text-right mobile:hidden xs:hidden desktop:flex tablet:flex items-center justify-end flex-1 desktop:w-40 tablet:w-40 overflow-hidden whitespace-nowrap"
                    onClick={() => setShowNumInP(false)}
                  >
                    <div className="inline-block whitespace-nowrap">
                      <HighDecimalsFormatted
                        value={limitDigitsNumber(Number(tokenAmount))}
                        styleNumber={`text-white text-4xl ${truncatedFlag ? 'mt-1.5' : ''}`}
                        styleZeros="text-white/70 text-xs"
                        setTruncatedFlag={(flag: boolean) =>
                          setTruncatedFlag(flag)
                        }
                      />
                    </div>
                  </div>
                  <div
                    className="text-right desktop:hidden tablet:hidden mobile:flex xs:flex items-center justify-end flex-1 mobile:w-32 xs:w-auto overflow-hidden whitespace-nowrap"
                    onClick={() => setShowNumInP(false)}
                  >
                    <div className="inline-block whitespace-nowrap">
                      {(() => {
                        const roundOffFn = () => {
                          const roundedTokenAmount = tokenAmount;
                          const [, decimals] = tokenAmount
                            .toString()
                            .split('.');
                          if (!decimals) {
                            return roundedTokenAmount;
                          }
                          const match = decimals.match(/^(0+)/);
                          const zeroCount = match ? match[0].length : 0;
                          if (zeroCount < 2) {
                            return Number(roundedTokenAmount).toFixed(
                              decimals.length > 3 ? 3 : decimals.length
                            );
                          }
                          return Number(roundedTokenAmount).toFixed(
                            zeroCount + 2
                          );
                        };
                        const amount = roundOffFn();
                        return (
                          <HighDecimalsFormatted
                            value={limitDigitsNumber(Number(amount))}
                            styleNumber={`text-white text-4xl ${truncatedFlag ? 'mt-1.5' : ''}`}
                            styleZeros="text-white/70 text-xs"
                            setTruncatedFlag={(flag: boolean) =>
                              setTruncatedFlag(flag)
                            }
                          />
                        );
                      })()}
                    </div>
                  </div>
                </>
              ) : (
                <input
                  className={`no-spinner flex mobile:text-4xl xs:text-4xl desktop:text-4xl tablet:text-4xl font-medium text-right ${
                    token
                      ? 'flex-1 desktop:w-40 tablet:w-40 mobile:w-32 xs:w-full'
                      : 'flex-1 desktop:w-60 tablet:w-60 mobile:w-56 xs:w-full'
                  }`}
                  placeholder={inputPlaceholder}
                  onChange={handleTokenAmountChange}
                  value={tokenAmount}
                  type="text"
                  onFocus={() => setInputPlaceholder('')}
                  data-testid="pulse-sell-amount-input"
                />
              )}
              {token && (
                <div className="relative flex-shrink-0 max-w-[80px]">
                  <p
                    className="text-[#FFFFFF4D] flex ml-1 mobile:text-4xl xs:text-4xl desktop:text-4xl tablet:text-4xl overflow-hidden font-medium whitespace-nowrap cursor-help max-w-full text-clip"
                    data-testid="pulse-sell-token-symbol"
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                  >
                    {token.symbol.slice(0, 3)}
                  </p>
                  {showTooltip && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded shadow-lg z-10 whitespace-nowrap">
                      {token.symbol}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-3">
          <div className="flex">
            {(notEnoughLiquidity || relayError) && (
              <>
                <div className="flex items-center justify-center">
                  <img
                    src={WarningIcon}
                    alt="warning"
                    data-testid="pulse-sell-warning-icon"
                  />
                </div>
                <div
                  className="underline text-[#FF366C] text-xs ml-1"
                  data-testid="pulse-sell-error-message"
                >
                  {relayError ||
                    (notEnoughLiquidity ? 'Not enough balance' : '')}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center">
            {token && (
              <img
                src={token.logo}
                alt={token.symbol}
                className="w-2.5 h-2.5 rounded-full"
                data-testid="pulse-sell-token-logo"
              />
            )}
            <div
              className="text-[#8A77FF] ml-1 text-xs items-center"
              data-testid="pulse-sell-token-balance"
            >
              {token ? (
                <span className="flex items-center justify-end gap-1">
                  <HighDecimalsFormatted
                    value={limitDigitsNumber(tokenBalance)}
                    styleNumber="text-white"
                    styleZeros="text-white/70 text-[8px]"
                  />
                  {` ${token.symbol}`}($
                  {(tokenBalance * parseFloat(token.usdValue)).toFixed(2)})
                </span>
              ) : (
                '0.00($0.00)'
              )}
            </div>
          </div>
        </div>
      </div>

      {/* amounts */}
      <div className="flex w-full" data-testid="pulse-sell-percentage-buttons">
        {customSellAmounts.map((item) => {
          const isMax = item === 'MAX';
          const percentage = isMax ? 100 : parseInt(item);
          const isDisabled = !token;

          return (
            <div
              key={item}
              className="flex bg-black ml-2.5 mr-2.5 w-[75px] h-[30px] rounded-[10px] p-0.5 pb-1 pt-0.5"
            >
              <button
                className={`flex-1 items-center justify-center rounded-[10px] ${
                  isDisabled
                    ? 'bg-[#1E1D24] text-grey cursor-not-allowed'
                    : 'bg-[#121116] text-white cursor-pointer'
                }`}
                onClick={() => {
                  if (!isDisabled) {
                    setShowNumInP(true);
                    if (isMax) {
                      const decimals = token?.decimals || 18;
                      const multiplier = 10 ** decimals;
                      const amount =
                        Math.floor(tokenBalance * multiplier) / multiplier;
                      const formattedAmount =
                        formatExponentialSmallNumber(amount);
                      setTokenAmount(formattedAmount);
                      setParentTokenAmount(formattedAmount);
                    } else {
                      const amount = (
                        (tokenBalance * percentage) /
                        100
                      ).toFixed(6);
                      const formattedAmount =
                        formatExponentialSmallNumber(amount);
                      setTokenAmount(formattedAmount);
                      setParentTokenAmount(formattedAmount);
                    }
                  }
                }}
                type="button"
                disabled={isDisabled}
                data-testid={`pulse-sell-percentage-button-${item.toLowerCase()}`}
              >
                <span className="font-normal text-center opacity-50 text-sm">
                  {item}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* sell button */}
      <div
        className="flex w-auto h-[50px] rounded-[10px] bg-black p-[2px_2px_6px_2px] m-2.5"
        data-testid="pulse-sell-button-container"
      >
        <SellButton
          token={token}
          tokenAmount={tokenAmount}
          notEnoughLiquidity={notEnoughLiquidity}
          setPreviewSell={setPreviewSell}
          setSellOffer={setSellOffer}
          sellOffer={sellOffer}
          isLoadingOffer={isLoadingOffer || isRefreshing}
          isInitialized={isInitialized}
        />
      </div>

      {/* PnL Stats - only show if there's actual PnL data */}
      {token &&
        (isPnLLoading ||
          isTransactionsLoading ||
          (pnl && (pnl.totalBoughtUSDC > 0 || pnl.totalSoldUSDC > 0))) && (
          <div className="w-full px-2.5 mb-2">
            <PnLStats
              metrics={pnl}
              isLoading={isPnLLoading || isTransactionsLoading || isRefreshing}
            />
          </div>
        )}
    </div>
  );
};

export default Sell;
