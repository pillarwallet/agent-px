import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import arbitrumLogo from '../../../assets/images/logo-arbitrum.png';
import baseLogo from '../../../assets/images/logo-base.png';
import bscLogo from '../../../assets/images/logo-bsc.png';
import ethereumLogo from '../../../assets/images/logo-ethereum.png';
import optimismLogo from '../../../assets/images/logo-optimism.png';
import polygonLogo from '../../../assets/images/logo-polygon.png';

type ChainSelectProps = {
  value: string;
};

const chains = [
  { id: 'base', label: 'Base', logo: baseLogo, enabled: true },
  { id: 'ethereum', label: 'Ethereum', logo: ethereumLogo, enabled: false },
  { id: 'arbitrum', label: 'Arbitrum', logo: arbitrumLogo, enabled: false },
  { id: 'optimism', label: 'Optimism', logo: optimismLogo, enabled: false },
  { id: 'bsc', label: 'BNB Smart Chain', logo: bscLogo, enabled: false },
  { id: 'polygon', label: 'Polygon', logo: polygonLogo, enabled: false },
];

const ChainSelect = ({ value }: ChainSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedChain = chains.find((chain) => chain.id === value) ?? chains[0];

  return (
    <div style={{ flexShrink: 0, position: 'relative' }}>
      <button
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        style={{
          alignItems: 'center',
          background: '#14131a',
          border: '1px solid #34303f',
          borderRadius: 999,
          color: '#ffffff',
          cursor: 'pointer',
          display: 'inline-flex',
          fontSize: 13,
          fontWeight: 500,
          gap: 8,
          height: 38,
          padding: '0 11px',
        }}
        type="button"
      >
        <img
          alt=""
          src={selectedChain.logo}
          style={{ borderRadius: 999, height: 20, width: 20 }}
        />
        {selectedChain.label}
        <ChevronDown
          aria-hidden
          size={16}
          style={{
            color: '#a19cad',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
          }}
        />
      </button>

      {isOpen ? (
        <div
          style={{
            background: '#111017',
            border: '1px solid #34303f',
            borderRadius: 8,
            boxShadow: '0 14px 32px rgba(0, 0, 0, 0.36)',
            display: 'grid',
            gap: 4,
            minWidth: 206,
            padding: 6,
            position: 'absolute',
            left: 0,
            top: 44,
            zIndex: 3,
          }}
        >
          {chains.map((chain) => (
            <button
              disabled={!chain.enabled}
              key={chain.id}
              onClick={() => setIsOpen(false)}
              style={{
                alignItems: 'center',
                background: chain.id === value ? '#241f34' : 'transparent',
                border: 0,
                borderRadius: 7,
                color: chain.enabled ? '#ffffff' : '#686173',
                cursor: chain.enabled ? 'pointer' : 'not-allowed',
                display: 'flex',
                fontSize: 13,
                fontWeight: 500,
                gap: 9,
                opacity: chain.enabled ? 1 : 0.56,
                padding: '9px 10px',
                textAlign: 'left',
                width: '100%',
              }}
              type="button"
            >
              <img
                alt=""
                src={chain.logo}
                style={{ borderRadius: 999, height: 20, width: 20 }}
              />
              <span style={{ flex: 1 }}>{chain.label}</span>
              {!chain.enabled ? (
                <span
                  style={{
                    color: '#8f8a9d',
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  Soon
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default ChainSelect;
