import { useState, useEffect } from 'react';
import useTransactionKit from '../../hooks/useTransactionKit';
import { StatusBanner } from './components/StatusBanner';
import { AgentControls } from './components/AgentControls';
import { BalanceCard } from './components/BalanceCard';
import { AssetSelector } from './components/AssetSelector';
import { TradeForm } from './components/TradeForm';
import { TradingChart } from './components/TradingChart';
import { PositionsCard } from './components/PositionsCard';
import { useHyperliquid } from './hooks/useHyperliquid';
import type { AssetInfo } from './lib/hyperliquid/types';

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
            <AgentControls onStatusChange={loadBalance} />
          </div>
        )}

        {/* Trading Chart - Full Width */}
        {address && setupStatus === 'setup' && (
          <div className="mb-6">
            <TradingChart selectedAsset={selectedAsset} />
          </div>
        )}

        {/* Open Positions - Full Width */}
        {address && setupStatus === 'setup' && (
          <div className="mb-6">
            <PositionsCard masterAddress={address} />
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Balance */}
          <div className="lg:col-span-1">
            {address && setupStatus === 'setup' && userState && (
              <BalanceCard
                userState={userState}
                isLoading={isLoading}
                onRefresh={loadBalance}
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
