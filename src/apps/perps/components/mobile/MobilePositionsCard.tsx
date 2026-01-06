import { ChevronRight } from 'lucide-react';
import { Badge } from '../ui/badge';

interface Position {
    coin: string;
    coinIcon?: string;
    leverage: number;
    side: 'LONG' | 'SHORT';
    value: string;
    pnl: string;
    pnlPercent: string;
    entryPrice: string;
    markPrice: string;
    liqPrice: string;
}

interface MobilePositionsCardProps {
    positions: Position[];
    totalValue: string;
    totalPnl: string;
    totalPnlPercent: string;
}

export function MobilePositionsCard({
    positions,
    totalValue,
    totalPnl,
    totalPnlPercent,
}: MobilePositionsCardProps) {
    const isNegative = totalPnl.startsWith('-');

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-500">Open Positions</h3>
                <span className={`text-sm font-bold ${isNegative ? 'text-red-500' : 'text-green-500'}`}>
                    {isNegative ? '↓' : '↑'} {totalPnlPercent}
                </span>
            </div>

            {/* Total Value */}
            <div className="flex items-center justify-between mb-4">
                <span className="text-3xl font-bold">${totalValue}</span>
                <span className={`text-lg font-bold ${isNegative ? 'text-red-500' : 'text-green-500'}`}>
                    {totalPnl}
                </span>
            </div>

            {/* Positions List */}
            <div className="space-y-3">
                {positions.map((position, index) => (
                    <div key={index} className="border-t border-gray-100 pt-3">
                        {/* Position Header */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                {/* Coin Icon */}
                                <div className="h-10 w-10 rounded-full bg-yellow-500 flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">Z</span>
                                </div>

                                {/* Coin Name and Badges */}
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold">{position.coin}</span>
                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                </div>

                                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                                    {position.leverage}x
                                </Badge>

                                <Badge
                                    className={`text-xs px-2 py-0.5 ${position.side === 'LONG'
                                            ? 'bg-green-100 text-green-700 hover:bg-green-100'
                                            : 'bg-red-100 text-red-700 hover:bg-red-100'
                                        }`}
                                >
                                    {position.side}
                                </Badge>
                            </div>

                            {/* Value and PNL */}
                            <div className="text-right">
                                <div className="font-semibold">${position.value}</div>
                                <div className={`text-sm ${position.pnl.startsWith('-') ? 'text-red-500' : 'text-green-500'}`}>
                                    {position.pnl}
                                </div>
                            </div>
                        </div>

                        {/* Price Grid */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                                <p className="text-gray-500 uppercase mb-1">Entry</p>
                                <p className="font-medium">${position.entryPrice}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 uppercase mb-1">Mark Price</p>
                                <p className="font-medium">${position.markPrice}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 uppercase mb-1">Liq. Price</p>
                                <p className="font-medium">{position.liqPrice}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
