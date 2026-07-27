import React from 'react';
import { chainNameToChainIdTokensData } from '../../../../services/tokensData';
import { getLogoForChainId } from '../../../../utils/blockchain';
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
          <div className="px-3 py-3 h-full overflow-y-auto">
            {Object.values(MobulaChainNames)
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
                      className="w-6 h-6 rounded-full bg-[#23222A]"
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
                    className={`flex items-center gap-2 px-2.5 py-2.5 cursor-pointer relative text-base ${
                      isSelected
                        ? 'bg-[#29292F] text-white font-medium'
                        : 'bg-transparent text-[#b0b0b0] font-normal'
                    }`}
                  >
                    {logo}
                    <span className="flex-1 ml-2.5">
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
