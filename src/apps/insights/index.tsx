/**
 * PillarX Algorithmic Insights App
 * Main entry point for the Insights application
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Styles
import './styles/insights.css';

// Components
import { Header } from './components/Header/Header';
import { SignalCard } from './components/SignalCard/SignalCard';
import { FeedEventCard } from './components/FeedEventCard/FeedEventCard';
import { PnLDetailModal } from './components/PnLDetailModal';
import { ConsentModal } from './components/consent';

// Hooks
import { useTradingSignals } from './hooks/useTradingSignals';
import { useSparklineData } from './hooks/useSparklineData';
import { useLogoMap } from './hooks/useLogoMap';

// Utils
import { generateFeedEvents, generateOverallPnLSparkline, generateOpenPnLSparkline, generateClosedPnLSparkline } from './utils/signalUtils';
import { updateSignalPrices } from './api/insightsApi';

// Types
import type { TradingSignal, TabType, LeverageType, PnLViewType } from './types';

const App = () => {
  // State
  const [activeTab, setActiveTab] = useState<TabType>('open');
  const [selectedPnLView, setSelectedPnLView] = useState<PnLViewType>(null);
  const [leverage, setLeverage] = useState<LeverageType>(1);
  const [updating, setUpdating] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Hooks
  const { signals, loading, setSignals } = useTradingSignals();
  const { sparklineDataMap, fetchSparkline, fetchSparklines, loading: sparklineLoading } = useSparklineData();
  const logoMap = useLogoMap(signals);

  // Track initial load - only animate on first load, not on data refreshes
  useEffect(() => {
    if (!loading && signals.length > 0 && isInitialLoad) {
      // Mark initial load as complete after first data load completes
      setIsInitialLoad(false);
    }
  }, [loading, signals.length, isInitialLoad]);

  // Check consent status on mount
  useEffect(() => {
    const storedConsent = localStorage.getItem('pillarx_consent_accepted');
    if (storedConsent) {
      try {
        const consent = JSON.parse(storedConsent);
        const consentDate = new Date(consent.timestamp);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        if (consentDate > oneYearAgo) {
          setConsentGiven(true);
        } else {
          setShowConsentModal(true);
        }
      } catch {
        setShowConsentModal(true);
      }
    } else {
      setShowConsentModal(true);
    }
  }, []);

  // Track which signal IDs we've already initiated sparkline fetches for
  const fetchedSparklineIdsRef = useRef<Set<string>>(new Set());

  // Fetch sparklines for open signals only when new active signals are detected
  // This effect should only run once after signals are initially loaded, not on every update
  useEffect(() => {
    if (signals.length > 0 && !loading) {
      const openSignals = signals.filter(s => s.status === 'active');
      
      // Only fetch sparklines for signals we haven't fetched yet
      const signalsNeedingSparklines = openSignals.filter(signal => {
        const alreadyFetched = fetchedSparklineIdsRef.current.has(signal.id);
        const hasData = sparklineDataMap[signal.id] && sparklineDataMap[signal.id].length > 0;
        const isLoading = sparklineLoading[signal.id];
        
        if (alreadyFetched || hasData || isLoading) {
          return false;
        }
        
        // Mark as fetched to prevent duplicate requests
        fetchedSparklineIdsRef.current.add(signal.id);
        return true;
      });
      
      if (signalsNeedingSparklines.length > 0) {
        console.log(`📊 [Sparkline] Initial fetch for ${signalsNeedingSparklines.length} new signals`);
        fetchSparklines(signalsNeedingSparklines);
      }
    }
    // Only depend on signal count and loading state, not the signals array itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.length, loading]);

  // Helper functions
  const applyLeverage = (pnl: number) => pnl * leverage;

  const calculateTotalPnL = (signalList: TradingSignal[]) => {
    return signalList.reduce((sum, signal) => {
      return sum + (signal.realized_pnl_percent || 0);
    }, 0);
  };

  // Filtered signals
  const openSignals = useMemo(() => signals.filter(s => s.status === 'active'), [signals]);
  const closedSignals = useMemo(() => {
    return signals
      .filter(s => ['completed', 'stopped', 'closed'].includes(s.status || 'active'))
      .sort((a, b) => {
        const dateA = new Date(a.closed_at || a.last_price_update || a.created_at).getTime();
        const dateB = new Date(b.closed_at || b.last_price_update || b.created_at).getTime();
        return dateB - dateA;
      });
  }, [signals]);

  const calculateOpenPnL = () => {
    return openSignals.reduce((sum, signal) => {
      return sum + (signal.profit_loss_percent || 0);
    }, 0);
  };

  const calculateOpenRealizedPnL = () => {
    return openSignals.reduce((sum, signal) => {
      return sum + (signal.realized_pnl_percent || 0);
    }, 0);
  };

  // PnL calculations
  const openTotalPnL = useMemo(() => {
    const value = calculateOpenPnL();
    console.log(`💰 [PnL] openTotalPnL: ${value}% (${openSignals.length} signals)`);
    if (openSignals.length > 0) {
      console.log('📊 [PnL] Open signals breakdown:', openSignals.map(s => ({
        ticker: s.ticker,
        profit_loss_percent: s.profit_loss_percent,
        realized_pnl_percent: s.realized_pnl_percent,
      })));
    }
    return value;
  }, [openSignals]);
  
  const closedTotalPnL = useMemo(() => {
    const closedPnL = calculateTotalPnL(closedSignals);
    const openRealizedPnL = calculateOpenRealizedPnL();
    const value = closedPnL + openRealizedPnL;
    console.log(`💰 [PnL] closedTotalPnL: ${value}% (closed: ${closedPnL}%, open realized: ${openRealizedPnL}%)`);
    return value;
  }, [closedSignals, openSignals]);
  
  const floatingPnL = useMemo(() => {
    const value = openTotalPnL + closedTotalPnL;
    console.log(`💰 [PnL] floatingPnL: ${value}% (open: ${openTotalPnL}%, closed: ${closedTotalPnL}%)`);
    return value;
  }, [openTotalPnL, closedTotalPnL]);

  // Sparkline data
  const overallPnLSparklineData = useMemo(() => generateOverallPnLSparkline(closedSignals), [closedSignals]);
  const openPnLSparklineData = useMemo(() => generateOpenPnLSparkline(openSignals), [openSignals]);
  const closedPnLSparklineData = useMemo(() => generateClosedPnLSparkline(closedSignals, openSignals), [closedSignals, openSignals]);

  // Feed events
  const feedEvents = useMemo(() => generateFeedEvents(signals), [signals]);

  // Displayed signals based on active tab
  const displayedSignals = useMemo(() => {
    if (activeTab === 'open') return openSignals;
    if (activeTab === 'closed') return closedSignals;
    if (activeTab === 'feed') return [];
    return signals;
  }, [activeTab, openSignals, closedSignals, signals]);

  // Update prices function
  const handleUpdatePrices = async () => {
    setUpdating(true);
    try {
      const result = await updateSignalPrices();
      if (result.error) {
        console.error('Error updating prices:', result.error);
      }
    } catch (error) {
      console.error('Error calling update function:', error);
    } finally {
      setUpdating(false);
    }
  };

  // Poll for price updates every 30 seconds
  useEffect(() => {
    if (!consentGiven) return;

    handleUpdatePrices();
    const interval = setInterval(() => {
      handleUpdatePrices();
      // Refresh sparklines for open signals
      const currentOpenSignals = signals.filter(s => s.status === 'active');
      if (currentOpenSignals.length > 0) {
        fetchSparklines(currentOpenSignals);
      }
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentGiven]);

  // Consent handlers
  const handleConsentAccepted = (payload: any) => {
    localStorage.setItem('pillarx_consent_accepted', JSON.stringify(payload));
    setConsentGiven(true);
    setShowConsentModal(false);
  };

  const handleConsentDeclined = () => {
    alert('You must accept the terms to access PillarX Algorithmic Insights.');
  };

  if (!consentGiven) {
    return (
      <>
        <ConsentModal
          open={showConsentModal}
          onConsentAccepted={handleConsentAccepted}
          onConsentDeclined={handleConsentDeclined}
          userRegion="Other"
          immediateAccess={true}
        />
        <div className="min-h-screen bg-parallax-glow flex items-center justify-center">
          <div className="text-muted-foreground">Please accept the terms to continue...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <ConsentModal
        open={showConsentModal}
        onConsentAccepted={handleConsentAccepted}
        onConsentDeclined={handleConsentDeclined}
        userRegion="Other"
        immediateAccess={true}
      />

      <div className="min-h-screen bg-parallax-glow">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <Header
            openSignals={openSignals}
            closedSignals={closedSignals}
            floatingPnL={floatingPnL}
            openTotalPnL={openTotalPnL}
            closedTotalPnL={closedTotalPnL}
            overallPnLSparklineData={overallPnLSparklineData}
            openPnLSparklineData={openPnLSparklineData}
            closedPnLSparklineData={closedPnLSparklineData}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            leverage={leverage}
            onLeverageChange={setLeverage}
            onPnLViewClick={setSelectedPnLView}
            applyLeverage={applyLeverage}
            calculateTotalPnL={calculateTotalPnL}
          />

          {/* Main Content */}
          {loading ? (
            <div className="text-center text-muted-foreground py-12">Loading events...</div>
          ) : signals.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No events yet. Waiting for incoming events...
            </div>
          ) : activeTab === 'feed' ? (
            <div className="space-y-3 max-w-5xl mx-auto">
              <AnimatePresence mode="popLayout">
                {feedEvents.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    No events yet
                  </div>
                ) : (
                  feedEvents.map((event) => (
                    <FeedEventCard 
                      key={event.id} 
                      event={event} 
                      leverage={leverage}
                      animateOnMount={isInitialLoad}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-4 max-w-5xl mx-auto">
              <AnimatePresence mode="popLayout">
                {displayedSignals.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">No events in this category</div>
                ) : (
                  displayedSignals.map((signal) => (
                    <SignalCard
                      key={signal.id}
                      signal={signal}
                      leverage={leverage}
                      sparklineData={sparklineDataMap[signal.id]}
                      logoMap={logoMap}
                      animateOnMount={isInitialLoad}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* PillarX Watermark */}
        <div className="fixed bottom-6 right-6 text-muted-foreground/30 text-xs font-semibold">
          Powered by PillarX
        </div>

        {/* P&L Detail Modal */}
        <PnLDetailModal
          open={selectedPnLView !== null}
          onOpenChange={(open) => !open && setSelectedPnLView(null)}
          view={selectedPnLView}
          signals={signals}
        />
      </div>
    </>
  );
};

export default App;
