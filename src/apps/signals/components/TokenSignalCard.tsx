import { Check, ChevronDown, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { TokenSignal } from '../types';
import {
  formatCompactUsd,
  formatScore,
  getOpportunityColor,
  getRiskColor,
  shortenAddress,
} from '../utils/format';
import ScoreBar from './ScoreBar';

type TokenSignalCardProps = {
  token: TokenSignal;
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div
    style={{
      background: '#14131a',
      border: '1px solid #292633',
      borderRadius: 8,
      minWidth: 0,
      padding: '10px 11px',
    }}
  >
    <div
      style={{
        color: '#8f8a9d',
        fontSize: 10,
        fontWeight: 500,
        marginBottom: 4,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
    <div
      style={{
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {value}
    </div>
  </div>
);

const TokenSignalCard = ({ token }: TokenSignalCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const copiedTimeoutRef = useRef<number>();

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    },
    []
  );

  const copyAddress = () => {
    if (!token.address) return;

    navigator.clipboard
      .writeText(token.address)
      .then(() => {
        setIsCopied(true);

        if (copiedTimeoutRef.current) {
          window.clearTimeout(copiedTimeoutRef.current);
        }

        copiedTimeoutRef.current = window.setTimeout(() => {
          setIsCopied(false);
        }, 1100);
      })
      .catch((error) => {
        console.error('Unable to copy address.', error);
      });
  };

  return (
    <article
      style={{
        background: '#0d0c12',
        border: '1px solid #292633',
        borderRadius: 8,
        overflow: 'visible',
      }}
    >
      <div
        style={{
          width: '100%',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            padding: '14px',
          }}
        >
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 10,
              minWidth: 0,
            }}
          >
            {token.imageUrl ? (
              <img
                alt=""
                src={token.imageUrl}
                style={{
                  borderRadius: 999,
                  flexShrink: 0,
                  height: 34,
                  width: 34,
                }}
              />
            ) : (
              <div
                style={{
                  alignItems: 'center',
                  background: '#31284b',
                  borderRadius: 999,
                  color: '#cab9ff',
                  display: 'flex',
                  flexShrink: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  height: 34,
                  justifyContent: 'center',
                  width: 34,
                }}
              >
                {token.symbol.slice(0, 1) || '?'}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  alignItems: 'center',
                  color: '#ffffff',
                  display: 'flex',
                  fontSize: 15,
                  fontWeight: 500,
                  gap: 8,
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    flexShrink: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {token.symbol || '-'}
                </span>
                {token.address ? (
                  <button
                    onClick={copyAddress}
                    style={{
                      alignItems: 'center',
                      background: isCopied ? '#103126' : '#1b1923',
                      border: `1px solid ${isCopied ? '#38d996' : '#34303f'}`,
                      borderRadius: 999,
                      color: isCopied ? '#6ff0bb' : '#d8d0ff',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      flexShrink: 0,
                      fontFamily: 'inherit',
                      fontSize: 10,
                      fontWeight: 500,
                      gap: 5,
                      maxWidth: 132,
                      padding: '4px 7px',
                      transform: isCopied ? 'scale(1.04)' : 'scale(1)',
                      transition:
                        'background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease',
                    }}
                    type="button"
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isCopied ? 'Copied' : shortenAddress(token.address)}
                    </span>
                    {isCopied ? (
                      <Check aria-hidden size={12} style={{ flexShrink: 0 }} />
                    ) : (
                      <Copy aria-hidden size={12} style={{ flexShrink: 0 }} />
                    )}
                  </button>
                ) : null}
              </div>
              <div
                style={{
                  alignItems: 'center',
                  color: '#a19cad',
                  display: 'flex',
                  fontSize: 12,
                  fontWeight: 400,
                  gap: 8,
                  marginTop: 2,
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {token.name || '-'}
                  {token.price !== undefined
                    ? ` · ${formatCompactUsd(token.price)}`
                    : ''}
                </span>
              </div>
            </div>
          </div>
          <button
            aria-label={isExpanded ? 'Collapse token details' : 'Expand token details'}
            onClick={() => setIsExpanded((currentValue) => !currentValue)}
            style={{
              alignItems: 'center',
              background: '#17151f',
              border: '1px solid #302c3a',
              borderRadius: 999,
              color: '#9e98ad',
              cursor: 'pointer',
              display: 'flex',
              height: 30,
              justifyContent: 'center',
              width: 30,
            }}
            type="button"
          >
            <ChevronDown
              aria-hidden
              size={18}
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}
            />
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: '1fr 1fr',
            padding: '0 14px 14px',
          }}
        >
          <ScoreBar
            color={getRiskColor(token.riskScore)}
            label="Risk"
            score={token.riskScore}
            tooltip="Risk is scored from 0 to 10. Lower is safer; it weighs suspicious warnings, liquidity quality, pool age, volatility, and whether volume looks real."
            tooltipAlign="left"
          />
          <ScoreBar
            color={getOpportunityColor(token.opportunityScore)}
            label="Opportunity"
            score={token.opportunityScore}
            tooltip="Opportunity is scored from 0 to 10. Higher is stronger; it weighs real volume, liquidity, buyer activity, momentum, and how clean the setup looks."
            tooltipAlign="right"
          />
        </div>
      </div>

      {isExpanded ? (
        <div
          style={{
            borderTop: '1px solid #292633',
            display: 'grid',
            gap: 10,
            gridTemplateColumns: '1fr 1fr',
            padding: 14,
          }}
        >
          <Metric label="Liquidity" value={formatCompactUsd(token.liquidity)} />
          <Metric label="Vol 1h" value={formatCompactUsd(token.volume1hUsd)} />
          <Metric label="Confidence" value={formatScore(token.confidenceScore)} />
          <Metric label="Age" value={token.age || '-'} />
        </div>
      ) : null}
    </article>
  );
};

export default TokenSignalCard;
