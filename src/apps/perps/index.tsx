import { useState, useEffect } from 'react';
import useTransactionKit from '../../hooks/useTransactionKit';
import { StatusBanner } from './components/StatusBanner';
import { AgentControls } from './components/AgentControls';
import { BalanceCard } from './components/BalanceCard';
import { AssetSelector } from './components/AssetSelector';
import { TradeForm } from './components/TradeForm';
import { SparklineChart } from './components/SparklineChart';
import { PositionsCard } from './components/PositionsCard';
import { useHyperliquid } from './hooks/useHyperliquid';
import { getAgentWallet } from './lib/hyperliquid/keystore';
import { getUserState } from './lib/hyperliquid/client';
import type { AssetInfo, UserState } from './lib/hyperliquid/types';
import MobileIndex from './pages/MobileIndex';

import './styles/perps.css';

const Index = () => {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const { walletAddress: address } = useTransactionKit();
  const {
    setupStatus,
    userState,
    isLoading,
    checkSetupStatus,
    setupHyperliquid,
    loadBalance,
  } = useHyperliquid();

  const [selectedAsset, setSelectedAsset] = useState<AssetInfo | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentUserState, setAgentUserState] = useState<UserState | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load imported account from global storage
  useEffect(() => {
    const loadImportedAccount = async () => {
      try {
        const { getImportedAccount } = await import('./lib/hyperliquid/keystore');
        const imported = getImportedAccount();

        if (imported) {
          setAgentAddress(imported.accountAddress);
          const state = await getUserState(imported.accountAddress);
          setAgentUserState(state);
        }
      } catch (error) {
        console.error('[Index] Error loading imported account:', error);
      } finally {
        setIsLoadingAgent(false);
      }
    };

    loadImportedAccount();
  }, []);

  useEffect(() => {
    if (address) {
      checkSetupStatus();
    }
  }, [address, checkSetupStatus]);

  useEffect(() => {
    if (setupStatus === 'setup') {
      loadBalance();
    }
  }, [setupStatus, loadBalance]);

  const handleAssetSelect = (symbol: string, asset: AssetInfo) => {
    setSelectedAsset(asset);
  };

  const handleTradeComplete = () => {
    loadBalance();
  };

  // NOW we can conditionally render based on mobile
  if (isMobile) {
    return <MobileIndex />;
  }

  // Desktop version
  return (
    <div className="min-h-screen bg-gradient-bg">
      <div className="container mx-auto px-4 py-8 pb-24 md:pb-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Hyperliquid Trading
            </h1>
            <p className="text-muted-foreground mt-1">
              Professional perpetual futures trading interface
            </p>
          </div>
        </div>

        {/* Status Banner */}
        {address && (
          <div className="mb-6">
            <StatusBanner
              status={setupStatus}
              onSetup={setupHyperliquid}
              isSettingUp={isLoading}
            />
          </div>
        )}

        {/* Agent Controls */}
        {address && setupStatus === 'setup' && (
          <div className="mb-6">
            <AgentControls onStatusChange={loadBalance} />
          </div>
        )}

        {/* Sparkline Chart - Full Width */}
        {(agentAddress || (address && setupStatus === 'setup')) && (
          <div className="mb-6">
            <SparklineChart selectedAsset={selectedAsset} />
          </div>
        )}

        {/* Open Positions - Full Width */}
        {(agentAddress || (address && setupStatus === 'setup')) && (
          <div className="mb-6">
            <PositionsCard masterAddress={agentAddress || address} />
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Balance */}
          <div className="lg:col-span-1">
            {(agentUserState || (address && setupStatus === 'setup' && userState)) && (
              <BalanceCard
                userState={agentUserState || userState}
                isLoading={isLoading}
                onRefresh={loadBalance}
              />
            )}
          </div>

          {/* Middle Column - Asset Selector */}
          <div className="lg:col-span-1">
            {(agentAddress || (address && setupStatus === 'setup')) && (
              <AssetSelector
                selectedSymbol={selectedAsset?.symbol || null}
                onSelect={handleAssetSelect}
              />
            )}
          </div>

          {/* Right Columns - Trade Form (spans 2 columns) */}
          <div className="lg:col-span-2">
            {(agentAddress || (address && setupStatus === 'setup')) && (
              <TradeForm
                selectedAsset={selectedAsset}
                onTradeComplete={handleTradeComplete}
              />
            )}
          </div>
        </div>

        {!address && !agentAddress && (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              Connect your wallet or import an agent to start trading
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
