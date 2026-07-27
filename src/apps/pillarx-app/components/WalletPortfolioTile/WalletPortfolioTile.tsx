import { sub } from 'date-fns';
import { useEffect, useLayoutEffect, useMemo } from 'react';

// services
import { useGetWalletHistoryQuery } from '../../../../services/pillarXApiWalletHistory';
import { useGetWalletPortfolioQuery } from '../../../../services/pillarXApiWalletPortfolio';

// types
import {
  PortfolioData,
  TokenPriceGraphPeriod,
  WalletHistory,
} from '../../../../types/api';

// utils
import { convertDateToUnixTimestamp } from '../../../../utils/common';
import {
  PeriodFilterBalance,
  getGraphResolutionBalance,
} from '../../utils/portfolio';
import { readCachedWalletHistory } from '../../../../utils/walletHistoryCache';
import { readCachedWalletPortfolio } from '../../../../utils/walletPortfolioCache';
import { CUSTOM_CHAINS_UPDATED_EVENT } from '../../../../utils/customChains';

// hooks
import useTransactionKit from '../../../../hooks/useTransactionKit';
import { useDataFetchingState } from '../../hooks/useDataFetchingState';

// reducer
import { useAppDispatch, useAppSelector } from '../../hooks/useReducerHooks';
import {
  setIsRefreshAll,
  setIsTopTokenUnrealizedPnLErroring,
  setIsTopTokenUnrealizedPnLLoading,
  setIsWalletHistoryGraphErroring,
  setIsWalletHistoryGraphLoading,
  setIsWalletPortfolioErroring,
  setIsWalletPortfolioLoading,
  setIsWalletPortfolioWithPnlErroring,
  setIsWalletPortfolioWithPnlLoading,
  setTopTokenUnrealizedPnL,
  setWalletHistoryGraph,
  setWalletPortfolio,
  setWalletPortfolioWithPnl,
} from '../../reducer/WalletPortfolioSlice';

// components
import PrimeTokensBalance from '../PrimeTokensBalance/PrimeTokensBalance';
import TileContainer from '../TileContainer/TileContainer';
import TopTokens from '../TopTokens/TopTokens';
import WalletPortfolioBalance from '../WalletPortfolioBalance/WalletPortfolioBalance';
import WalletPortfolioButtons from '../WalletPortfolioButtons/WalletPortfolioButtons';
import WalletPortfolioGraph from '../WalletPortfolioGraph/WalletPortfolioGraph';

const WalletPortfolioTile = () => {
  const { walletAddress: accountAddress } = useTransactionKit();

  const dispatch = useAppDispatch();

  const priceGraphPeriod = useAppSelector(
    (state) => state.walletPortfolio.priceGraphPeriod as TokenPriceGraphPeriod
  );
  const periodFilter = useAppSelector(
    (state) => state.walletPortfolio.periodFilter as PeriodFilterBalance
  );
  const selectedBalanceOrPnl = useAppSelector(
    (state) => state.walletPortfolio.selectedBalanceOrPnl as 'balance' | 'pnl'
  );
  const isRefreshAll = useAppSelector(
    (state) => state.walletPortfolio.isRefreshAll as boolean
  );
  const walletPortfolio = useAppSelector(
    (state) =>
      state.walletPortfolio.walletPortfolio as PortfolioData | undefined
  );
  const walletPortfolioWithPnl = useAppSelector(
    (state) =>
      state.walletPortfolio.walletPortfolioWithPnl as PortfolioData | undefined
  );
  const walletHistoryGraph = useAppSelector(
    (state) =>
      state.walletPortfolio.walletHistoryGraph as WalletHistory | undefined
  );
  const topTokenUnrealizedPnL = useAppSelector(
    (state) =>
      state.walletPortfolio.topTokenUnrealizedPnL as WalletHistory | undefined
  );

  // Query parameters
  const topTokenUnrealizedPnLQueryArgs = useMemo(
    () => ({
      wallet: accountAddress || '',
      period: '1h',
      from: convertDateToUnixTimestamp(sub(new Date(), { days: 1 })),
    }),
    [accountAddress]
  );

  const walletHistoryDataQueryArgs = useMemo(
    () => ({
      wallet: accountAddress || '',
      period: getGraphResolutionBalance(periodFilter),
      from: priceGraphPeriod.from,
    }),
    [accountAddress, periodFilter, priceGraphPeriod.from]
  );

  const walletPortfolioWithPnlArgs = useMemo(
    () => ({
      wallet: accountAddress || '',
      isPnl: true,
    }),
    [accountAddress]
  );

  const shouldFetchPnl = !!accountAddress && selectedBalanceOrPnl === 'pnl';
  const shouldShowManualRefreshLoading = isRefreshAll;

  const cachedPortfolio = useMemo(() => {
    if (!accountAddress) return undefined;

    return readCachedWalletPortfolio({
      wallet: accountAddress,
      isPnl: false,
    });
  }, [accountAddress]);

  const cachedPortfolioWithPnl = useMemo(() => {
    if (!accountAddress || !shouldFetchPnl) return undefined;

    return readCachedWalletPortfolio({
      wallet: accountAddress,
      isPnl: true,
    });
  }, [accountAddress, shouldFetchPnl]);

  const cachedWalletHistoryGraph = useMemo(() => {
    if (!accountAddress) return undefined;

    return readCachedWalletHistory(walletHistoryDataQueryArgs);
  }, [accountAddress, walletHistoryDataQueryArgs]);

  const cachedTopTokenUnrealizedPnL = useMemo(() => {
    if (!accountAddress) return undefined;

    return readCachedWalletHistory(topTokenUnrealizedPnLQueryArgs);
  }, [accountAddress, topTokenUnrealizedPnLQueryArgs]);

  // API Queries
  const {
    data: walletPortfolioData,
    isLoading: isWalletPortfolioDataLoading,
    isFetching: isWalletPortfolioDataFetching,
    isSuccess: isWalletPortfolioDataSuccess,
    error: walletPortfolioDataError,
    refetch: refetchWalletPortfolioData,
  } = useGetWalletPortfolioQuery(
    { wallet: accountAddress || '', isPnl: false },
    { skip: !accountAddress }
  );

  const {
    data: walletPortfolioWithPnlData,
    isLoading: isWalletPortfolioDataWithPnlLoading,
    isFetching: isWalletPortfolioDataWithPnlFetching,
    isSuccess: isWalletPortfolioDataWithPnlSuccess,
    error: walletPortfolioDataWithPnlError,
    refetch: refetchWalletPortfolioWithPnlData,
  } = useGetWalletPortfolioQuery(walletPortfolioWithPnlArgs, {
    skip: !shouldFetchPnl,
  });

  const {
    data: walletHistoryData,
    isLoading: isWalletHistoryDataLoading,
    isFetching: isWalletHistoryDataFetching,
    isSuccess: isWalletHistoryDataSuccess,
    error: walletHistoryDataError,
    refetch: refetchWalletHistoryData,
  } = useGetWalletHistoryQuery(walletHistoryDataQueryArgs, {
    skip: !accountAddress,
  });

  const {
    data: topTokenUnrealizedPnLData,
    isLoading: isTopTokenUnrealizedPnLDataLoading,
    isFetching: isTopTokenUnrealizedPnLDataFetching,
    isSuccess: isTopTokenUnrealizedPnLDataSuccess,
    error: topTokenUnrealizedPnLDataError,
    refetch: refetchTopTokenUnrealizedPnLData,
  } = useGetWalletHistoryQuery(topTokenUnrealizedPnLQueryArgs, {
    skip: !accountAddress,
  });

  useLayoutEffect(() => {
    if (!accountAddress) {
      dispatch(setWalletPortfolio(undefined));
      return;
    }

    dispatch(setWalletPortfolio(cachedPortfolio?.data));

    if (cachedPortfolio) {
      dispatch(setIsWalletPortfolioLoading(false));
      dispatch(setIsWalletPortfolioErroring(false));
    }
  }, [accountAddress, cachedPortfolio, dispatch]);

  useLayoutEffect(() => {
    if (!accountAddress) {
      dispatch(setWalletPortfolioWithPnl(undefined));
      return;
    }

    if (!shouldFetchPnl) return;

    dispatch(setWalletPortfolioWithPnl(cachedPortfolioWithPnl?.data));

    if (cachedPortfolioWithPnl) {
      dispatch(setIsWalletPortfolioWithPnlLoading(false));
      dispatch(setIsWalletPortfolioWithPnlErroring(false));
    }
  }, [accountAddress, cachedPortfolioWithPnl, dispatch, shouldFetchPnl]);

  useLayoutEffect(() => {
    if (!accountAddress) {
      dispatch(setWalletHistoryGraph(undefined));
      return;
    }

    dispatch(setWalletHistoryGraph(cachedWalletHistoryGraph?.data));

    if (cachedWalletHistoryGraph) {
      dispatch(setIsWalletHistoryGraphLoading(false));
      dispatch(setIsWalletHistoryGraphErroring(false));
    }
  }, [accountAddress, cachedWalletHistoryGraph, dispatch]);

  useLayoutEffect(() => {
    if (!accountAddress) {
      dispatch(setTopTokenUnrealizedPnL(undefined));
      return;
    }

    dispatch(setTopTokenUnrealizedPnL(cachedTopTokenUnrealizedPnL?.data));

    if (cachedTopTokenUnrealizedPnL) {
      dispatch(setIsTopTokenUnrealizedPnLLoading(false));
      dispatch(setIsTopTokenUnrealizedPnLErroring(false));
    }
  }, [accountAddress, cachedTopTokenUnrealizedPnL, dispatch]);

  useDataFetchingState(
    walletPortfolioData?.result?.data,
    shouldShowManualRefreshLoading ||
      (isWalletPortfolioDataLoading &&
        !walletPortfolio &&
        !cachedPortfolio?.data),
    shouldShowManualRefreshLoading ||
      (isWalletPortfolioDataFetching &&
        !walletPortfolio &&
        !cachedPortfolio?.data),
    isWalletPortfolioDataSuccess,
    walletPortfolioDataError,
    setWalletPortfolio,
    setIsWalletPortfolioLoading,
    setIsWalletPortfolioErroring,
    { preserveDataOnError: true }
  );

  useDataFetchingState(
    walletPortfolioWithPnlData?.result?.data,
    (shouldShowManualRefreshLoading && shouldFetchPnl) ||
      (isWalletPortfolioDataWithPnlLoading &&
        !walletPortfolioWithPnl &&
        !cachedPortfolioWithPnl?.data),
    (shouldShowManualRefreshLoading && shouldFetchPnl) ||
      (isWalletPortfolioDataWithPnlFetching &&
        !walletPortfolioWithPnl &&
        !cachedPortfolioWithPnl?.data),
    isWalletPortfolioDataWithPnlSuccess,
    walletPortfolioDataWithPnlError,
    setWalletPortfolioWithPnl,
    setIsWalletPortfolioWithPnlLoading,
    setIsWalletPortfolioWithPnlErroring,
    { preserveDataOnError: true }
  );

  useDataFetchingState(
    walletHistoryData?.result?.data,
    shouldShowManualRefreshLoading ||
      (isWalletHistoryDataLoading &&
        !walletHistoryGraph &&
        !cachedWalletHistoryGraph?.data),
    shouldShowManualRefreshLoading ||
      (isWalletHistoryDataFetching &&
        !walletHistoryGraph &&
        !cachedWalletHistoryGraph?.data),
    isWalletHistoryDataSuccess,
    walletHistoryDataError,
    setWalletHistoryGraph,
    setIsWalletHistoryGraphLoading,
    setIsWalletHistoryGraphErroring,
    { preserveDataOnError: true }
  );

  useDataFetchingState(
    topTokenUnrealizedPnLData?.result?.data,
    shouldShowManualRefreshLoading ||
      (isTopTokenUnrealizedPnLDataLoading &&
        !topTokenUnrealizedPnL &&
        !cachedTopTokenUnrealizedPnL?.data),
    shouldShowManualRefreshLoading ||
      (isTopTokenUnrealizedPnLDataFetching &&
        !topTokenUnrealizedPnL &&
        !cachedTopTokenUnrealizedPnL?.data),
    isTopTokenUnrealizedPnLDataSuccess,
    topTokenUnrealizedPnLDataError,
    setTopTokenUnrealizedPnL,
    setIsTopTokenUnrealizedPnLLoading,
    setIsTopTokenUnrealizedPnLErroring,
    { preserveDataOnError: true }
  );

  useEffect(() => {
    if (!accountAddress) return undefined;

    const handleCustomChainsUpdated = () => {
      refetchWalletPortfolioData();

      if (shouldFetchPnl) {
        refetchWalletPortfolioWithPnlData();
      }
    };

    window.addEventListener(
      CUSTOM_CHAINS_UPDATED_EVENT,
      handleCustomChainsUpdated
    );

    return () => {
      window.removeEventListener(
        CUSTOM_CHAINS_UPDATED_EVENT,
        handleCustomChainsUpdated
      );
    };
  }, [
    accountAddress,
    refetchWalletPortfolioData,
    refetchWalletPortfolioWithPnlData,
    shouldFetchPnl,
  ]);

  useEffect(() => {
    if (!isRefreshAll) return undefined;

    let isCancelled = false;

    const refetchData = async () => {
      if (!accountAddress) {
        dispatch(setIsRefreshAll(false));
        return;
      }

      const refreshRequests = [
        refetchWalletPortfolioData().unwrap(),
        refetchWalletHistoryData().unwrap(),
        refetchTopTokenUnrealizedPnLData().unwrap(),
      ];

      if (shouldFetchPnl) {
        refreshRequests.push(refetchWalletPortfolioWithPnlData().unwrap());
      }

      await Promise.allSettled(refreshRequests);

      if (!isCancelled) {
        dispatch(setIsRefreshAll(false));
      }
    };

    refetchData().catch(() => {
      if (!isCancelled) {
        dispatch(setIsRefreshAll(false));
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [
    accountAddress,
    dispatch,
    isRefreshAll,
    refetchTopTokenUnrealizedPnLData,
    refetchWalletHistoryData,
    refetchWalletPortfolioData,
    refetchWalletPortfolioWithPnlData,
    shouldFetchPnl,
  ]);

  return (
    <TileContainer
      id="wallet-portfolio-tile"
      className="desktop:p-9 desktop:gap-9"
    >
      <div className="flex flex-col rounded-xl desktop:border-[1px] desktop:border-lighter_container_grey p-3.5 w-full desktop:gap-4 gap-3">
        <WalletPortfolioBalance />
        <div className="tablet:hidden mobile:hidden desktop:flex w-full">
          <WalletPortfolioButtons />
        </div>
        <PrimeTokensBalance />
        <div className="desktop:hidden mobile:flex tablet:flex rounded-xl w-full">
          <WalletPortfolioGraph />
        </div>
        <div className="desktop:hidden mobile:flex tablet:flex w-full">
          <WalletPortfolioButtons />
        </div>
        <TopTokens />
      </div>
      <div className="tablet:hidden mobile:hidden desktop:flex rounded-xl border-[1px] border-lighter_container_grey w-full">
        <WalletPortfolioGraph />
      </div>
    </TileContainer>
  );
};

export default WalletPortfolioTile;
