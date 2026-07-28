import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

type SignalsDisclaimerProps = {
  onAccept: () => void;
};

const disclaimerItems = [
  'Signals is an informational research tool only. It is not financial, investment, legal, or tax advice.',
  'Token research can be incomplete, delayed, inaccurate, or wrong. Crypto markets are highly volatile.',
  'You are solely responsible for reviewing every token, contract, pool, and trade before acting.',
  'PillarX does not guarantee profitability, execution quality, liquidity, or loss protection.',
];

const SignalsDisclaimer = ({ onAccept }: SignalsDisclaimerProps) => {
  const [hasCheckedAgreement, setHasCheckedAgreement] = useState(false);

  return (
    <section
      style={{
        alignItems: 'stretch',
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        gap: 18,
        justifyContent: 'center',
        minHeight: 'calc(100dvh - 244px)',
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            background: '#2a2216',
            border: '1px solid rgba(255, 199, 92, 0.34)',
            borderRadius: 18,
            color: '#ffd28a',
            display: 'flex',
            height: 58,
            justifyContent: 'center',
            width: 58,
          }}
        >
          <AlertTriangle aria-hidden size={28} />
        </div>
        <p
          style={{
            color: '#a9a3b6',
            fontSize: 13,
            fontWeight: 400,
            lineHeight: 1.42,
            margin: 0,
          }}
        >
          Review these terms before using token research inside PillarX.
        </p>
      </div>

      <div
        style={{
          background: '#0d0c12',
          border: '1px solid #292633',
          borderRadius: 10,
          display: 'grid',
          gap: 12,
          padding: 14,
        }}
      >
        {disclaimerItems.map((item) => (
          <div
            key={item}
            style={{
              alignItems: 'flex-start',
              display: 'flex',
              gap: 10,
            }}
          >
            <CheckCircle2
              aria-hidden
              size={16}
              style={{
                color: '#8b5cf6',
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <p
              style={{
                color: '#c8c2d4',
                fontSize: 12,
                fontWeight: 400,
                lineHeight: 1.42,
                margin: 0,
              }}
            >
              {item}
            </p>
          </div>
        ))}
      </div>

      <label
        style={{
          alignItems: 'flex-start',
          color: '#c8c2d4',
          cursor: 'pointer',
          display: 'flex',
          fontSize: 12,
          fontWeight: 400,
          gap: 10,
          lineHeight: 1.35,
        }}
      >
        <input
          checked={hasCheckedAgreement}
          onChange={(event) => setHasCheckedAgreement(event.target.checked)}
          style={{
            accentColor: '#8b5cf6',
            flexShrink: 0,
            height: 16,
            margin: 0,
            width: 16,
          }}
          type="checkbox"
        />
        I understand and agree that I am using Signals at my own risk.
      </label>

      <button
        disabled={!hasCheckedAgreement}
        onClick={onAccept}
        style={{
          alignItems: 'center',
          appearance: 'none',
          background: hasCheckedAgreement ? '#8b5cf6' : '#33284e',
          border: 0,
          borderRadius: 10,
          color: '#ffffff',
          cursor: hasCheckedAgreement ? 'pointer' : 'not-allowed',
          display: 'flex',
          fontSize: 15,
          fontWeight: 500,
          height: 48,
          justifyContent: 'center',
          opacity: hasCheckedAgreement ? 1 : 0.68,
          width: '100%',
        }}
        type="button"
      >
        I understand and agree
      </button>
    </section>
  );
};

export default SignalsDisclaimer;
