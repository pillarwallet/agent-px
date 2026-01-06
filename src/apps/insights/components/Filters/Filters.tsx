/**
 * Filters component - Tab navigation and leverage selector
 */

import { Badge } from '../ui/badge';
import type { LeverageType, TabType } from '../../types';

interface FiltersProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  leverage: LeverageType;
  onLeverageChange: (leverage: LeverageType) => void;
}

export const Filters = ({
  activeTab,
  onTabChange,
  leverage,
  onLeverageChange,
}: FiltersProps) => {
  return (
    <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
      {/* Tab Navigation */}
      <div className="glass-card rounded-full p-2 flex gap-1.5">
        {(['open', 'closed', 'feed', 'all'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground glow-violet'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Leverage Selector */}
      <div className="glass-card rounded-full p-2 flex gap-1.5 items-center">
        <span className="text-xs text-muted-foreground px-2">Leverage:</span>
        {([1, 3, 5, 10] as const).map((lev) => (
          <button
            key={lev}
            onClick={() => onLeverageChange(lev)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              leverage === lev
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {lev}x
          </button>
        ))}
        {leverage > 1 && (
          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] ml-1">
            High Risk
          </Badge>
        )}
      </div>
    </div>
  );
};
