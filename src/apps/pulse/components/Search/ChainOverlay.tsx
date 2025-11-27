import React from 'react';
import { chainNameToChainIdTokensData } from '../../../../services/tokensData';
import {
  getLogoForChainId,
  isGnosisEnabled,
} from '../../../../utils/blockchain';
import GlobeIcon from '../../assets/globe-icon.svg';
import SelectedIcon from '../../assets/selected-icon.svg';
import { MobulaChainNames } from '../../utils/constants';

export interface ChainOverlayProps {
  setShowChainOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  setOverlayStyle: React.Dispatch<React.SetStateAction<React.CSSProperties>>;
  setChains: React.Dispatch<React.SetStateAction<MobulaChainNames>>;
  overlayStyle: React.CSSProperties;
  chains: MobulaChainNames;
}

const ChainOverlay = React.forwardRef<HTMLDivElement, ChainOverlayProps>(
  (
    { setShowChainOverlay, setChains, setOverlayStyle, overlayStyle, chains },
    ref
  ) => {
    return (
      <>
        <div
          className="fixed inset-0 w-screen h-screen cursor-default"
          style={{ zIndex: 1999 }}
          onClick={() => {
            setShowChainOverlay(false);
            setOverlayStyle({});
          }}
        />
        <div
          ref={ref}
          style={overlayStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '12px 0', height: '100%', overflowY: 'auto' }}>
            {Object.values(MobulaChainNames)
              .filter(
                (chain) => isGnosisEnabled || chain !== MobulaChainNames.XDAI
              ) // Remove XDAI if Gnosis is not enabled
              .sort((a, b) => {
                // Put "All" first, then alphabetical
                if (a === MobulaChainNames.All) return -1;
                if (b === MobulaChainNames.All) return 1;
                return a.localeCompare(b);
              })
              .map((chain) => {
                const isSelected = chains === chain;
                const isAll = chain === MobulaChainNames.All;
                let logo = null;
                if (isAll) {
                  logo = (
                    <span className="flex items-center justify-center w-6 h-6">
                      <img src={GlobeIcon} alt="globe-icon" />
                    </span>
                  );
                } else {
                  const chainId = chainNameToChainIdTokensData(chain);
                  logo = (
                    <img
                      src={getLogoForChainId(chainId)}
                      alt={chain}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: '#23222A',
                      }}
                    />
                  );
                }
                return (
                  <div
                    key={chain}
                    onClick={() => {
                      setChains(chain);
                      setShowChainOverlay(false);
                      setOverlayStyle({});
                    }}
                    className={`flex items-center gap-2 px-4.5 py-2.5 cursor-pointer relative text-base ${
                      isSelected
                        ? 'bg-[#29292F] text-white font-medium'
                        : 'bg-transparent text-[#b0b0b0] font-normal'
                    }`}
                  >
                    {logo}
                    <span style={{ flex: 1, marginLeft: 10 }}>
                      {chain === MobulaChainNames.All ? 'All chains' : chain}
                    </span>
                    {isSelected && (
                      <div>
                        <img src={SelectedIcon} alt="selected-icon" />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </>
    );
  }
);

ChainOverlay.displayName = 'ChainOverlay';

export default ChainOverlay;
