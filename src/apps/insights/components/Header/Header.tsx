/**
 * Header component - Title, KPI cards, and filters
 */

import { motion } from 'framer-motion';
import { KPICard } from '../KPICard/KPICard';
import { Filters } from '../Filters/Filters';
import type {
  TradingSignal,
  TabType,
  LeverageType,
  PnLViewType,
} from '../../types';

interface HeaderProps {
  openSignals: TradingSignal[];
  closedSignals: TradingSignal[];
  floatingPnL: number;
  openTotalPnL: number;
  closedTotalPnL: number;
  overallPnLSparklineData: Array<{ value: number }>;
  openPnLSparklineData: Array<{ value: number }>;
  closedPnLSparklineData: Array<{ value: number }>;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  leverage: LeverageType;
  onLeverageChange: (leverage: LeverageType) => void;
  onPnLViewClick: (view: PnLViewType) => void;
  applyLeverage: (pnl: number) => number;
  calculateTotalPnL: (signals: TradingSignal[]) => number;
}

export const Header = ({
  openSignals,
  closedSignals,
  floatingPnL,
  openTotalPnL,
  closedTotalPnL,
  overallPnLSparklineData,
  openPnLSparklineData,
  closedPnLSparklineData,
  activeTab,
  onTabChange,
  leverage,
  onLeverageChange,
  onPnLViewClick,
  applyLeverage,
  calculateTotalPnL,
}: HeaderProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 max-w-5xl mx-auto"
    >
      {/* Title Row with Hero Gradient */}
      <div className="hero-gradient rounded-3xl p-8 md:p-12 text-center mb-6 border border-primary/10">
        <h1 className="text-3xl md:text-6xl font-bold mb-3 md:mb-4 text-white leading-tight">
          <span className="whitespace-nowrap">PillarX Algorithmic</span>{' '}
          <span className="whitespace-nowrap text-gradient-violet">
            Insights
          </span>
        </h1>
        <p className="text-muted-foreground text-xs md:text-base max-w-3xl mx-auto px-4 leading-relaxed">
          PillarX provides algorithmic analytics for informational and
          educational purposes only. Nothing herein constitutes financial advice
          or an offer to buy or sell securities or digital assets.
        </p>
      </div>

      {/* KPI Row */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6"
      >
        <KPICard
          title="Floating P&L"
          value={applyLeverage(floatingPnL)}
          badge={openSignals.length + closedSignals.length}
          badgeColor="blue"
          sparklineData={overallPnLSparklineData}
          onClick={() => onPnLViewClick('floating')}
        />
        <KPICard
          title="Open Positions P&L"
          value={applyLeverage(openTotalPnL)}
          badge={openSignals.length}
          badgeColor="violet"
          sparklineData={openPnLSparklineData}
          onClick={() => onPnLViewClick('open')}
        />
        <KPICard
          title="Closed Trades P&L"
          value={applyLeverage(calculateTotalPnL(closedSignals))}
          badge={closedSignals.length}
          badgeColor="slate"
          sparklineData={closedPnLSparklineData}
          onClick={() => onPnLViewClick('closed')}
        />
      </motion.div>

      {/* Filters Row */}
      <Filters
        activeTab={activeTab}
        onTabChange={onTabChange}
        leverage={leverage}
        onLeverageChange={onLeverageChange}
      />
    </motion.div>
  );
};
