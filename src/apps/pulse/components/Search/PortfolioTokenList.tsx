import { useMemo, useState, useEffect } from 'react';
import { TailSpin } from 'react-loader-spinner';

// types
import {
  PortfolioData,
  PnLMetrics,
  WalletTransactionsMobulaResponse,
} from '../../../../types/api';

// utils
import { convertPortfolioAPIResponseToToken } from '../../../../services/pillarXApiWalletPortfolio';
import {
  chainNameToChainIdTokensData,
  Token,
} from '../../../../services/tokensData';
import { getLogoForChainId } from '../../../../utils/blockchain';
import {
  formatExponentialSmallNumber,
  limitDigitsNumber,
} from '../../../../utils/number';

// constants
import { STABLE_CURRENCIES } from '../../constants/tokens';

// components
import RandomAvatar from '../../../pillarx-app/components/RandomAvatar/RandomAvatar';
import TokenPnLCell from './TokenPnLCell';

// hooks
import useTransactionKit from '../../../../hooks/useTransactionKit';
import { useGetWalletTransactionsQuery } from '../../../../services/pillarXApiWalletTransactions';
import {
  fetchRelayRequestByHash,
  RelayRequest,
} from '../../../../services/relayApi';

// utils
import {
  reconstructTrades,
  calculatePnL as calculatePnLMetrics,
  calculatePnLFromRelay,
} from '../../../../utils/pnl';

export interface PortfolioTokenListProps {
  walletPortfolioData: PortfolioData | undefined;
  handleTokenSelect: (item: Token) => void;
  isLoading?: boolean;
  isError?: boolean;
  searchText?: string;
  hideSmallBalances: boolean;
  isFetching?: boolean;
}

// Skeleton loader component
const SkeletonTokenRow = () => (
  <div className="flex w-full rounded-[10px] h-[60px] py-3 px-6 animate-pulse">
    <div className="flex items-center flex-[2.2] min-w-0">
      <div className="w-8 h-8 rounded-full bg-white/10" />
      <div className="flex flex-col ml-3 min-w-0 gap-2">
        <div className="h-3 w-20 bg-white/10 rounded" />
        <div className="h-2 w-16 bg-white/10 rounded" />
      </div>
    </div>
    <div className="flex flex-col flex-1 items-end justify-center gap-2">
      <div className="h-3 w-16 bg-white/10 rounded" />
      <div className="h-2 w-12 bg-white/10 rounded" />
    </div>
    <div className="flex flex-col flex-[1.6] items-end justify-center gap-2">
      <div className="h-3 w-14 bg-white/10 rounded" />
      <div className="h-2 w-10 bg-white/10 rounded" />
    </div>
  </div>
);

const PortfolioTokenList = (props: PortfolioTokenListProps) => {
  console.log('[PortfolioTokenList] Component rendering!', {
    propsKeys: Object.keys(props),
    hasPortfolioData: !!props.walletPortfolioData,
  });

  const {
    walletPortfolioData,
    isLoading,
    isError,
    searchText,
    handleTokenSelect,
    hideSmallBalances,
    isFetching = false,
  } = props;

  const [sortConfig, setSortConfig] = useState<{
    key: 'price' | 'balance' | 'pnl';
    direction: 'asc' | 'desc';
  }>({ key: 'balance', direction: 'desc' });

  const { walletAddress } = useTransactionKit();

  const { data: transactionsData } = useGetWalletTransactionsQuery(
    { wallet: walletAddress || '' },
    { skip: !walletAddress }
  );

  const isStableCurrency = (token: Token) => {
    const chainId = chainNameToChainIdTokensData(token.blockchain);
    return STABLE_CURRENCIES.some(
      (stable) =>
        stable.chainId === chainId &&
        stable.address.toLowerCase() === token.contract.toLowerCase()
    );
  };

  // Filter out stable currencies and wrapped native tokens, then apply search filter
  const getFilteredPortfolioTokens = () => {
    if (!walletPortfolioData?.assets) return [];

    let tokens = convertPortfolioAPIResponseToToken(walletPortfolioData).filter(
      (token) => !isStableCurrency(token)
    );

    // Filter small balances if toggle is enabled
    if (hideSmallBalances) {
      tokens = tokens.filter((token) => {
        const balanceUSD = (token.price || 0) * (token.balance || 0);
        return balanceUSD >= 0.5;
      });
    }

    // Apply sorting
    tokens = tokens.sort((a: Token, b: Token) => {
      let valA = 0;
      let valB = 0;

      switch (sortConfig.key) {
        case 'price':
          // Sort by Token Name/Price? Usually alphabetical or by price.
          // Let's assume alphabetical by symbol for "Token" column sorting, or price?
          // The header says "Token/Price". Let's sort by Symbol for now as it's more common for "Token".
          // Or maybe USD Value?
          // Let's stick to the previous default: Balance USD.
          // But if user clicks "Token/Price", maybe alphabetical?
          return a.symbol.localeCompare(b.symbol);
        case 'balance':
          valA = (a.price || 0) * (a.balance || 0);
          valB = (b.price || 0) * (b.balance || 0);
          break;
        case 'pnl':
          // We need PnL data for this. We'll handle PnL sorting in the useMemo below or move PnL calc up.
          // Since PnL calc depends on transactions, and we are inside getFilteredPortfolioTokens which is called before PnL calc...
          // We should probably move sorting AFTER PnL calc.
          // For now, let's return tokens sorted by balance as default, and handle re-sorting in the rendered list or move logic.
          // To avoid complex refactoring, I'll keep basic filtering here and do final sort on `tokensWithPnL`.
          valA = (a.price || 0) * (a.balance || 0);
          valB = (b.price || 0) * (b.balance || 0);
          break;
      }
      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });

    // Apply search filter if searchText is provided
    if (searchText && searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      tokens = tokens.filter(
        (token: Token) =>
          token.symbol.toLowerCase().includes(searchLower) ||
          token.name.toLowerCase().includes(searchLower) ||
          token.contract.toLowerCase().includes(searchLower)
      );
    }

    return tokens;
  };

  const portfolioTokens = useMemo(() => {
    return getFilteredPortfolioTokens();
  }, [walletPortfolioData, searchText, hideSmallBalances]);

  // Apply sorting
  const sortedTokens = useMemo(() => {
    if (!portfolioTokens || portfolioTokens.length === 0) return [];

    return [...portfolioTokens].sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortConfig.key) {
        case 'price':
          return sortConfig.direction === 'asc'
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        case 'balance':
          valA = (a.price || 0) * (a.balance || 0);
          valB = (b.price || 0) * (b.balance || 0);
          break;
        case 'pnl':
          // PnL sorting is temporarily disabled as PnL is calculated in child components
          valA = 0;
          valB = 0;
          break;
      }
      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    });
  }, [portfolioTokens, sortConfig]);

  // Calculate Total Portfolio PnL (Removed as per new design, but keeping logic if needed later? No, remove to clean up)
  // The user explicitly said "nope its not here", implying the summary box shouldn't be there.

  // Loading state
  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center m-[50px]"
        data-testid="pulse-portfolio-loading"
      >
        <TailSpin
          color="#FFFFFF"
          height={40}
          width={40}
          data-testid="pulse-portfolio-loading-spinner"
        />
        <p
          className="text-gray-500 mt-2.5"
          data-testid="pulse-portfolio-loading-text"
        >
          Loading your portfolio...
        </p>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className="flex flex-col items-center justify-center m-[50px]"
        data-testid="pulse-portfolio-error"
      >
        <p
          className="text-red-500 mb-2.5"
          data-testid="pulse-portfolio-error-title"
        >
          ⚠️ Failed to load portfolio
        </p>
        <p
          className="text-gray-500 text-xs text-center"
          data-testid="pulse-portfolio-error-message"
        >
          Unable to fetch your wallet data. Please try again later.
        </p>
      </div>
    );
  }

  // No data state
  if (!walletPortfolioData) {
    return (
      <div
        className="flex flex-col items-center justify-center m-[50px]"
        data-testid="pulse-portfolio-no-data"
      >
        <p
          className="text-gray-500 mb-2.5"
          data-testid="pulse-portfolio-no-data-title"
        >
          🔍 No portfolio data
        </p>
        <p
          className="text-gray-500 text-xs text-center"
          data-testid="pulse-portfolio-no-data-message"
        >
          Connect your wallet to see your holdings
        </p>
      </div>
    );
  }

  // Empty portfolio state (either no tokens or no search results)
  if (portfolioTokens.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center m-[50px]"
        data-testid="pulse-portfolio-empty"
      >
        <p
          className="text-gray-500 mb-2.5"
          data-testid="pulse-portfolio-empty-title"
        >
          {searchText && searchText.trim()
            ? '🔍 No matching tokens found'
            : '💰 Portfolio is empty'}
        </p>
        <p
          className="text-gray-500 text-xs text-center"
          data-testid="pulse-portfolio-empty-message"
        >
          {searchText && searchText.trim()
            ? `No tokens match '${searchText}' in your portfolio`
            : // eslint-disable-next-line quotes
            "You don't have any tokens in your portfolio yet"}
        </p>
      </div>
    );
  }

  const handleSort = (key: 'price' | 'balance' | 'pnl') => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const SortIndicator = ({
    active,
    direction,
  }: {
    active: boolean;
    direction: 'asc' | 'desc';
  }) => (
    <div className="flex flex-col w-2 h-[14px] justify-center gap-[2px]">
      {/* Up Arrow - Polygon 50 */}
      <svg
        width="8"
        height="6"
        viewBox="0 0 8 6"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 0.5L7.5 5.5H0.5L4 0.5Z"
          fill="white"
          fillOpacity={active && direction === 'asc' ? 1 : 0.3}
        />
      </svg>
      {/* Down Arrow - Polygon 51 */}
      <svg
        width="8"
        height="6"
        viewBox="0 0 8 6"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 5.5L0.5 0.5H7.5L4 5.5Z"
          fill="white"
          fillOpacity={active && direction === 'desc' ? 1 : 0.3}
        />
      </svg>
    </div>
  );

  return (
    <div data-testid="pulse-portfolio-token-list">
      {/* Column Headers */}
      <div
        className="flex w-full pt-2 pb-2 border-b border-white/5 pl-3 pr-6"
        data-testid="pulse-portfolio-headers"
      >
        {/* Table Header */}
        <div className="flex items-center justify-between w-full mb-2">
          {/* Token/Price Column Header */}
          <div
            className="flex items-center flex-[1.8] cursor-pointer gap-1.5"
            onClick={() => handleSort('price')}
            data-testid="pulse-portfolio-header-token"
          >
            <p className="font-['Poppins'] text-[13px] font-normal text-white opacity-50 tracking-[-0.02em]">
              Token/Price
            </p>
            <SortIndicator
              active={sortConfig.key === 'price'}
              direction={sortConfig.direction}
            />
          </div>

          {/* Balance Column Header */}
          <div
            className="flex items-center justify-end flex-[1.2] cursor-pointer gap-1.5"
            onClick={() => handleSort('balance')}
            data-testid="pulse-portfolio-header-balance"
          >
            <p className="font-['Poppins'] text-[13px] font-normal text-white opacity-50 tracking-[-0.02em]">
              Balance
            </p>
            <SortIndicator
              active={sortConfig.key === 'balance'}
              direction={sortConfig.direction}
            />
          </div>

          {/* PnL Column Header */}
          <div
            className="flex items-center justify-end flex-[1.8] cursor-pointer gap-1.5"
            onClick={() => handleSort('pnl')}
            data-testid="pulse-portfolio-header-pnl"
          >
            <p className="font-['Poppins'] text-[13px] font-normal text-white opacity-50 tracking-[-0.02em] whitespace-nowrap">
              Unrealized PnL/%
            </p>
            <SortIndicator
              active={sortConfig.key === 'pnl'}
              direction={sortConfig.direction}
            />
          </div>
        </div>
      </div>

      {/* Show skeleton during refresh */}
      {isFetching && !isLoading && (
        <>
          <SkeletonTokenRow />
          <SkeletonTokenRow />
          <SkeletonTokenRow />
          <SkeletonTokenRow />
          <SkeletonTokenRow />
        </>
      )}

      {/* Show actual tokens (hidden during refresh with opacity) */}
      {sortedTokens.length > 0
        ? sortedTokens.map((token) => {
          const balanceUSD =
            token.price && token.balance ? token.price * token.balance : 0;
          const chainId = chainNameToChainIdTokensData(token.blockchain);

          return (
            <button
              key={`${token.blockchain}-${token.contract}`}
              className={`flex w-full hover:bg-[#25232D] rounded-[10px] transition-colors h-[60px] py-3 pl-3 pr-6 ${isFetching ? 'opacity-30' : ''}`}
              onClick={() => {
                handleTokenSelect(token);
              }}
              type="button"
              data-testid={`pulse-portfolio-token-item-${token.blockchain.toLowerCase()}-${token.name.toLowerCase()}`}
            >
              {/* Token/Price Column */}
              <div
                className="flex items-center flex-[1.8] min-w-0"
                data-testid="pulse-portfolio-token-info"
              >
                <div className="relative inline-block flex-shrink-0">
                  {token.logo ? (
                    <img
                      src={token.logo}
                      className="w-8 h-8 rounded-full"
                      alt="token logo"
                      data-testid="pulse-portfolio-token-logo"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full overflow-hidden">
                      <RandomAvatar name={token.name} />
                      <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold">
                        {token.name?.slice(0, 2)}
                      </span>
                    </div>
                  )}
                  <img
                    src={getLogoForChainId(
                      chainNameToChainIdTokensData(token.blockchain)
                    )}
                    className="absolute -bottom-px -right-px w-3.5 h-3.5 rounded-full border-[0.88px] border-[#25232D]"
                    alt="chain logo"
                    data-testid="pulse-portfolio-chain-logo"
                  />
                </div>
                <div className="flex flex-col ml-3 min-w-0">
                  <div className="flex items-center min-w-0">
                    <p
                      className="text-[13px] font-normal text-white tracking-[-0.26px] whitespace-nowrap"
                      data-testid="pulse-portfolio-token-symbol"
                    >
                      {token.symbol}
                    </p>
                    <p
                      className="text-[13px] font-normal tracking-[-0.26px] ml-2 text-white opacity-50 whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]"
                      title={token.name}
                      data-testid="pulse-portfolio-token-name"
                    >
                      {token.name}
                    </p>
                  </div>
                  <p
                    className="text-xs font-normal tracking-[-0.24px] text-white opacity-50 text-left"
                    data-testid="pulse-portfolio-token-price"
                  >
                    ${/* // Skip PnL for small balances */}
                    {/* if (valueUSD < 0.01) { */}
                    {/*   return { ...token, pnl: null }; */}
                    {/* } */}
                    {token.price
                      ? formatExponentialSmallNumber(
                        limitDigitsNumber(token.price)
                      )
                      : '0.00'}
                  </p>
                </div>
              </div>

              {/* Balance Column */}
              <div
                className="flex flex-col flex-[1.2] items-end justify-center"
                data-testid="pulse-portfolio-token-balance"
              >
                <p
                  className="text-[13px] font-normal tracking-[-0.26px] text-white text-right"
                  data-testid="pulse-portfolio-balance-usd"
                >
                  $
                  {formatExponentialSmallNumber(
                    limitDigitsNumber(balanceUSD)
                  )}
                </p>
                <p
                  className="text-xs font-normal tracking-[-0.24px] text-white text-right"
                  data-testid="pulse-portfolio-balance-token"
                >
                  {formatExponentialSmallNumber(
                    limitDigitsNumber(token.balance || 0)
                  )}
                </p>
              </div>

              {/* PnL Column */}
              <div
                className="flex flex-col flex-[1.8] items-end justify-center"
                data-testid="pulse-portfolio-token-pnl"
              >
                <TokenPnLCell
                  token={token}
                  chainId={chainId}
                  transactionsData={transactionsData}
                  walletAddress={walletAddress}
                />
              </div>
            </button>
          );
        })
        : null}
    </div>
  );
};

export default PortfolioTokenList;
