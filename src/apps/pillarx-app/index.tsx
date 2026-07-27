/* eslint-disable @typescript-eslint/no-use-before-define */
import { setWalletAddresses } from '@hypelab/sdk-react';
import { Setting2 } from 'iconsax-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import './styles/tailwindPillarX.css';

// hooks
import { useAuthAccount } from '../../hooks/useAuthAccount';
import useTransactionKit from '../../hooks/useTransactionKit';
import {
  useGetFreshHomeTokensQuery,
  useGetTrendingHomeTokensQuery,
} from './api/homeTokens';
import { useRecordProfileMutation } from './api/profile';
import { readCachedHomeTokenList } from '../../utils/homeTokenCache';

// components
import HomeTokenSection from './components/HomeTokenSection/HomeTokenSection';
import WalletPortfolioTile from './components/WalletPortfolioTile/WalletPortfolioTile';
import PerpsTile from './components/PerpsTile/PerpsTile';
import SettingsModal from './components/SettingsModal/SettingsModal';

// images
import PillarXLogo from './components/PillarXLogo/PillarXLogo';
import pillarLogoLight from './images/pillarX_full_white.png';
import searchIcon from '../pulse/assets/seach-icon.svg';

const App = () => {
  const [isRefreshingTrendingTokens, setIsRefreshingTrendingTokens] =
    useState(false);
  const [isRefreshingFreshTokens, setIsRefreshingFreshTokens] = useState(false);
  const [isWalletSettingsOpen, setIsWalletSettingsOpen] = useState(false);

  // Import wallets
  const { walletAddress } = useTransactionKit();
  const { walletAddress: ownerWalletAddress } = useAuthAccount();

  // hooks
  const navigate = useNavigate();

  // Check if we're in React Native app (check localStorage which is set in Main.tsx)
  const isReactNativeApp = !!localStorage.getItem('DEVICE_PLATFORM');

  /**
   * Import the recordProfile mutation from the
   * homefeed hook to let the PillarX API know
   * the EOA to Smart Wallet address mapping
   */
  const [recordProfile] = useRecordProfileMutation();

  const cachedTrendingTokens = useMemo(
    () => readCachedHomeTokenList('trending'),
    []
  );
  const cachedFreshTokens = useMemo(() => readCachedHomeTokenList('fresh'), []);

  // The token sections use cached data immediately, then update from the API.
  const {
    data: trendingTokens,
    isLoading: isTrendingTokensLoading,
    isFetching: isTrendingTokensFetching,
    isError: isTrendingTokensError,
    refetch: refetchTrendingTokens,
  } = useGetTrendingHomeTokensQuery();
  const {
    data: freshTokens,
    isLoading: isFreshTokensLoading,
    isFetching: isFreshTokensFetching,
    isError: isFreshTokensError,
    refetch: refetchFreshTokens,
  } = useGetFreshHomeTokensQuery();

  const trendingTokenData = trendingTokens || cachedTrendingTokens?.data;
  const freshTokenData = freshTokens || cachedFreshTokens?.data;

  const shouldShowTrendingTokenLoading =
    isRefreshingTrendingTokens ||
    (!trendingTokenData &&
      (isTrendingTokensLoading || isTrendingTokensFetching));
  const shouldShowFreshTokenLoading =
    isRefreshingFreshTokens ||
    (!freshTokenData && (isFreshTokensLoading || isFreshTokensFetching));

  const handleRefreshTrendingTokens = async () => {
    setIsRefreshingTrendingTokens(true);

    try {
      await refetchTrendingTokens().unwrap();
    } catch {
      // The section will keep showing its cached data or error state on failure.
    } finally {
      setIsRefreshingTrendingTokens(false);
    }
  };

  const handleRefreshFreshTokens = async () => {
    setIsRefreshingFreshTokens(true);

    try {
      await refetchFreshTokens().unwrap();
    } catch {
      // The section will keep showing its cached data or error state on failure.
    } finally {
      setIsRefreshingFreshTokens(false);
    }
  };

  useEffect(() => {
    // This is a "fire and forget" call to the profile API

    if (walletAddress && ownerWalletAddress) {
      recordProfile({
        owner: ownerWalletAddress,
        account: walletAddress,
      });
    }
  }, [walletAddress, ownerWalletAddress, recordProfile]);

  // to track walletAddress and adverts
  useEffect(() => {
    if (walletAddress) {
      setWalletAddresses([walletAddress]);
    }
  }, [walletAddress]);

  // Handler to open settings in React Native app
  const handleSettingsClick = () => {
    const message = JSON.stringify({
      type: 'pillarXAuthRequest',
      value: 'settings',
    });

    // Send message to React Native webview
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(message);
    } else {
      // Fallback for testing in browser
      window.postMessage(message, '*');
    }
  };

  // Handler to navigate to Pulse Search in Buy mode
  const handleSearchClick = () => {
    navigate('/pulse?searching=true');
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    <Wrapper>
      <HeaderContainer>
        {isReactNativeApp && (
          <SettingsButton
            onClick={handleSettingsClick}
            aria-label="Open settings"
          >
            <Setting2 size={24} variant="Outline" />
          </SettingsButton>
        )}
        <PillarXLogo
          src={pillarLogoLight}
          className="object-contain h-[20px] mobile:h-[18px]"
        />
      </HeaderContainer>
      <SearchActions>
        <button
          type="button"
          onClick={handleSearchClick}
          className="flex min-w-0 w-full items-center h-8 bg-[rgba(30,29,36,0.3)] border-2 border-[#1e1d24] shadow-[inset_0px_2px_0px_2px_#121116] rounded-[10px] pl-[10px] pr-[54px] cursor-pointer"
        >
          <img
            src={searchIcon}
            alt="search"
            className="w-[14px] h-[14px] opacity-60"
          />
          <span className="font-normal text-[13px] leading-[13px] tracking-[-0.02em] text-white opacity-50 ml-3 mt-[1px] select-none">
            Search
          </span>
        </button>
        <WalletSettingsButton
          type="button"
          onClick={() => setIsWalletSettingsOpen(true)}
          aria-label="Open wallet settings"
        >
          <Setting2 size={18} variant="Outline" />
        </WalletSettingsButton>
      </SearchActions>
      <div className="flex flex-col gap-[40px] tablet:gap-[28px] mobile:gap-[32px]">
        <WalletPortfolioTile />
        <PerpsTile />
        <HomeTokenSection
          title="Trending Tokens"
          data={trendingTokenData}
          isDataLoading={shouldShowTrendingTokenLoading}
          isRefreshing={isRefreshingTrendingTokens || isTrendingTokensFetching}
          isError={isTrendingTokensError}
          skeletonType="horizontal"
          accountAddress={walletAddress}
          onRefresh={handleRefreshTrendingTokens}
        />
        <HomeTokenSection
          title="Fresh Tokens"
          data={freshTokenData}
          isDataLoading={shouldShowFreshTokenLoading}
          isRefreshing={isRefreshingFreshTokens || isFreshTokensFetching}
          isError={isFreshTokensError}
          skeletonType="vertical"
          accountAddress={walletAddress}
          onRefresh={handleRefreshFreshTokens}
        />
      </div>
      {isWalletSettingsOpen && (
        <SettingsModal onClose={() => setIsWalletSettingsOpen(false)} />
      )}
    </Wrapper>
  );
};

const Wrapper = styled.div`
  display: flex;
  width: 100%;
  margin: 0 auto;
  flex-direction: column;
  max-width: 1248px;

  @media (min-width: 1024px) {
    padding: 52px 62px;
  }

  @media (max-width: 1024px) {
    padding: 52px 32px;
  }

  @media (max-width: 768px) {
    padding: 32px 16px;
  }
`;

const HeaderContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    margin-bottom: 16px;
  }
`;

const SearchActions = styled.div`
  position: relative;
  width: 100%;
  max-width: 645px;
  margin: 0 auto 20px;

  @media (max-width: 768px) {
    margin-bottom: 16px;
  }
`;

const WalletSettingsButton = styled.button`
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  width: 36px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 2px solid #1e1d24;
  border-radius: 10px;
  box-shadow: inset 0 2px 0 2px #121116;
  background: rgba(30, 29, 36, 0.3);
  color: rgba(255, 255, 255, 0.72);
  cursor: pointer;
`;

const SettingsButton = styled.button`
  position: absolute;
  left: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.text.body};
  transition: opacity 0.2s;
  border-radius: 8px;

  &:hover {
    opacity: 0.7;
    background: ${({ theme }) => theme.color.background.card}20;
  }

  &:active {
    opacity: 0.5;
  }
`;

export default App;
