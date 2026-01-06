import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { MobileHeader } from '../components/mobile/MobileHeader';
import { MobileBalanceCard } from '../components/mobile/MobileBalanceCard';
import { MobilePositionsCard } from '../components/mobile/MobilePositionsCard';
import { MobileMarketsList } from '../components/mobile/MobileMarketsList';
import { useHyperliquid } from '../hooks/useHyperliquid';
import { getUserState, getMetaAndAssetCtxs } from '../lib/hyperliquid/client';
import { getImportedAccount } from '../lib/hyperliquid/keystore';

export default function MobileIndex() {
    const { address } = useAccount();
    const { userState, isLoading } = useHyperliquid();

    const [agentAddress, setAgentAddress] = useState<string | null>(null);
    const [agentUserState, setAgentUserState] = useState<any>(null);
    const [markets, setMarkets] = useState<any[]>([]);

    // Load imported account
    useEffect(() => {
        const loadImportedAccount = async () => {
            try {
                const imported = getImportedAccount();
                if (imported) {
                    setAgentAddress(imported.accountAddress);
                    const state = await getUserState(imported.accountAddress);
                    setAgentUserState(state);
                }
            } catch (error) {
                console.error('[MobileIndex] Error loading imported account:', error);
            }
        };

        loadImportedAccount();
    }, []);

    // Load markets data
    useEffect(() => {
        const loadMarkets = async () => {
            try {
                const data = await getMetaAndAssetCtxs();
                if (data?.universe) {
                    const formattedMarkets = data.universe.slice(0, 10).map((asset: any, index: number) => ({
                        coin: asset.name,
                        price: formatPrice(parseFloat(asset.markPx || '0')),
                        maxLeverage: asset.maxLeverage || 20,
                        volume: formatVolume(parseFloat(asset.dayNtlVlm || '0')),
                        change: '+0.80',
                        changePercent: '0.80%',
                    }));
                    setMarkets(formattedMarkets);
                }
            } catch (error) {
                console.error('[MobileIndex] Error loading markets:', error);
            }
        };

        loadMarkets();
    }, []);

    // Get balance from agent or connected wallet
    const displayState = agentUserState || userState;
    const balance = displayState?.marginSummary?.totalRawUsd || '0.00';

    // Format positions
    const positions = displayState?.assetPositions
        ?.filter((p: any) => parseFloat(p.position.szi) !== 0)
        .map((p: any) => {
            const size = parseFloat(p.position.szi);
            const isLong = size > 0;
            const pnl = parseFloat(p.position.unrealizedPnl || '0');
            const value = Math.abs(parseFloat(p.position.positionValue || '0'));

            return {
                coin: p.position.coin,
                leverage: Math.round(parseFloat(p.position.leverage?.value || '1')),
                side: isLong ? 'LONG' as const : 'SHORT' as const,
                value: value.toFixed(2),
                pnl: pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`,
                pnlPercent: '0.00%',
                entryPrice: parseFloat(p.position.entryPx || '0').toFixed(2),
                markPrice: parseFloat(p.position.markPx || '0').toFixed(2),
                liqPrice: p.position.liquidationPx || 'N/A',
            };
        }) || [];

    // Calculate total PNL
    const totalPnl = positions.reduce((sum, p) => {
        const pnl = parseFloat(p.pnl.replace(/[+$-]/g, ''));
        return sum + (p.pnl.startsWith('-') ? -pnl : pnl);
    }, 0);

    const totalValue = positions.reduce((sum, p) => sum + parseFloat(p.value), 0);
    const totalPnlPercent = totalValue > 0 ? ((totalPnl / totalValue) * 100).toFixed(2) : '0.00';

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <MobileHeader />

            {/* Content */}
            <div className="pt-16 px-4 pb-6 space-y-3">
                {/* Balance Card */}
                <MobileBalanceCard
                    balance={parseFloat(balance).toFixed(2)}
                    onWithdraw={() => console.log('Withdraw')}
                    onDeposit={() => console.log('Deposit')}
                />

                {/* Positions Card */}
                {positions.length > 0 && (
                    <MobilePositionsCard
                        positions={positions}
                        totalValue={totalValue.toFixed(2)}
                        totalPnl={totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`}
                        totalPnlPercent={`${totalPnlPercent}%`}
                    />
                )}

                {/* Markets List */}
                <MobileMarketsList
                    markets={markets}
                    onMarketSelect={(coin) => console.log('Selected:', coin)}
                />
            </div>
        </div>
    );
}

function formatPrice(price: number): string {
    if (price >= 1000) {
        return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return price.toFixed(2);
}

function formatVolume(volume: number): string {
    if (volume >= 1e9) {
        return `$${(volume / 1e9).toFixed(1)}B`;
    }
    if (volume >= 1e6) {
        return `$${(volume / 1e6).toFixed(1)}M`;
    }
    return `$${volume.toFixed(0)}`;
}
