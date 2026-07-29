import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { formatScore } from '../utils/format';

type ScoreBarProps = {
  color: string;
  label: string;
  score?: number;
  tooltip?: string;
  tooltipAlign?: 'left' | 'right';
};

const ScoreBar = ({
  color,
  label,
  score,
  tooltip,
  tooltipAlign = 'left',
}: ScoreBarProps) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipTimeoutRef = useRef<number>();
  const normalizedScore =
    score === undefined ? 0 : Math.max(0, Math.min(10, score));

  const showTooltipWithDelay = () => {
    if (!tooltip) return;

    tooltipTimeoutRef.current = window.setTimeout(() => {
      setIsTooltipVisible(true);
    }, 1000);
  };

  const hideTooltip = () => {
    if (tooltipTimeoutRef.current) {
      window.clearTimeout(tooltipTimeoutRef.current);
    }

    setIsTooltipVisible(false);
  };

  useEffect(
    () => () => {
      if (tooltipTimeoutRef.current) {
        window.clearTimeout(tooltipTimeoutRef.current);
      }
    },
    []
  );

  return (
    <div style={{ minWidth: 78, position: 'relative' }}>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 5,
        }}
      >
        <span
          style={{
            alignItems: 'center',
            color: '#918b9f',
            display: 'inline-flex',
            fontSize: 10,
            fontWeight: 500,
            gap: 4,
          }}
        >
          {label}
          {tooltip ? (
            <button
              aria-label={`${label} score information`}
              onBlur={hideTooltip}
              onFocus={showTooltipWithDelay}
              onMouseEnter={showTooltipWithDelay}
              onMouseLeave={hideTooltip}
              style={{
                alignItems: 'center',
                background: '#17151f',
                border: '1px solid #34303f',
                borderRadius: 999,
                color: '#bcb4cb',
                cursor: 'help',
                display: 'inline-flex',
                height: 14,
                justifyContent: 'center',
                padding: 0,
                width: 14,
              }}
              type="button"
            >
              <Info aria-hidden size={9} strokeWidth={3} />
            </button>
          ) : null}
        </span>
        <span style={{ color, fontSize: 11, fontWeight: 500 }}>
          {formatScore(score)}
        </span>
      </div>
      {tooltip && isTooltipVisible ? (
        <div
          role="tooltip"
          style={{
            background: '#17151f',
            border: '1px solid #3b3449',
            borderRadius: 8,
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.32)',
            color: '#d8d3e5',
            fontSize: 10,
            fontWeight: 400,
            lineHeight: 1.35,
            padding: '8px 9px',
            position: 'absolute',
            [tooltipAlign]: 0,
            top: -8,
            transform: 'translateY(-100%)',
            width: 190,
            zIndex: 5,
          }}
        >
          {tooltip}
        </div>
      ) : null}
      <div
        style={{
          background: '#25222d',
          borderRadius: 999,
          height: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: color,
            borderRadius: 999,
            height: '100%',
            width: `${normalizedScore * 10}%`,
          }}
        />
      </div>
    </div>
  );
};

export default ScoreBar;
