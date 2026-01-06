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

import './styles/perps.css';

const Index = () => {
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
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);

  useEffect(() => {
    // Load assets and set default to BTC
    const loadAssets = async () => {
      try {
        const { getAllAssets } = await import('./lib/hyperliquid/client');
        const assets = await getAllAssets();
        const btc = assets.find(a => a.symbol === 'BTC');
        if (btc && !selectedAsset) {
          setSelectedAsset(btc);
        }
      } catch (e) {
        console.error('Failed to load assets:', e);
      }
    };
    loadAssets();
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

  // Load imported account from global storage (persists after refresh)
  useEffect(() => {
    const loadImportedAccount = async () => {
      try {
        const { getImportedAccount } = await import('./lib/hyperliquid/keystore');
        const imported = getImportedAccount();

        if (imported) {
          setAgentAddress(imported.accountAddress);
          console.log('[Index] Imported account loaded:', imported.accountAddress);

          // Fetch account's user state
          setIsLoadingAgent(true);
          const state = await getUserState(imported.accountAddress);
          setAgentUserState(state);
          console.log('[Index] Account state loaded:', {
            address: imported.accountAddress,
            balance: state?.marginSummary?.totalRawUsd,
            positions: state?.assetPositions?.length || 0,
          });
        } else {
          setAgentAddress(null);
          setAgentUserState(null);
        }
      } catch (error) {
        console.error('[Index] Error loading imported account:', error);
        setAgentAddress(null);
        setAgentUserState(null);
      } finally {
        setIsLoadingAgent(false);
      }
    };

    loadImportedAccount();
  }, []); // Run once on mount

  // Only override if not already selected (handled in loadAssets)
  const handleAssetSelect = (symbol: string, asset: AssetInfo) => {
    setSelectedAsset(asset);
  };

  const handleTradeComplete = () => {
    loadBalance();
  };

  return (
    <div className="min-h-screen bg-gradient-bg text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Perps Trading
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
            <AgentControls onStatusChange={async () => {
              // Reload agent data when status changes
              if (address) {
                const agent = await getAgentWallet(address);
                if (agent && agent.approved) {
                  setAgentAddress(agent.address);
                  setIsLoadingAgent(true);
                  const state = await getUserState(agent.address);
                  setAgentUserState(state);
                  setIsLoadingAgent(false);
                }
              }
              loadBalance();
            }} />
          </div>
        )}

        {/* Sparkline Chart - Full Width */}
        {address && setupStatus === 'setup' && (
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
                isLoading={isLoadingAgent || isLoading}
                onRefresh={async () => {
                  if (agentAddress) {
                    setIsLoadingAgent(true);
                    const state = await getUserState(agentAddress);
                    setAgentUserState(state);
                    setIsLoadingAgent(false);
                  } else {
                    loadBalance();
                  }
                }}
              />
            )}
          </div>

          {/* Middle Column - Asset Selector */}
          <div className="lg:col-span-1">
            {address && setupStatus === 'setup' && (
              <AssetSelector
                selectedSymbol={selectedAsset?.symbol || null}
                onSelect={handleAssetSelect}
              />
            )}
          </div>

          {/* Right Columns - Trade Form (spans 2 columns) */}
          <div className="lg:col-span-2">
            {address && setupStatus === 'setup' && (
              <TradeForm
                selectedAsset={selectedAsset}
                onTradeComplete={handleTradeComplete}
              />
            )}
          </div>
        </div>

        {!address && (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              Connect your wallet to start trading
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
