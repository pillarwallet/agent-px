/**
 * Reusable KPI Card component for displaying P&L metrics
 */

import { motion } from 'framer-motion';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ResponsiveContainer, LineChart, Line } from 'recharts';

interface KPICardProps {
  title: string;
  value: number;
  badge: number;
  badgeColor?: 'blue' | 'violet' | 'slate';
  sparklineData?: Array<{ value: number }>;
  onClick?: () => void;
}

export const KPICard = ({ 
  title, 
  value, 
  badge, 
  badgeColor = 'blue',
  sparklineData,
  onClick 
}: KPICardProps) => {
  const badgeColors = {
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    slate: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };

  const valueColor = value >= 0 
    ? 'text-[hsl(142,76%,58%)]' 
    : 'text-[hsl(348,83%,58%)]';
  
  const strokeColor = value >= 0 
    ? 'hsl(142,76%,58%)' 
    : 'hsl(348,83%,58%)';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`glass-card rounded-3xl p-5 md:p-7 transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:glass-card-hover group' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs md:text-sm text-muted-foreground">{title}</p>
        <Badge className={`${badgeColors[badgeColor]} text-xs`}>
          {badge}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className={`text-2xl md:text-4xl font-bold ${valueColor}`}>
          {value >= 0 ? '+' : ''}{value.toFixed(2).replace('.', ',')}%
        </p>
        {sparklineData && sparklineData.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-14 md:h-16 w-32 md:w-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData}>
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke={strokeColor}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{title} trend</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </motion.div>
  );
};

