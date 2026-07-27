import { Add, CloseCircle } from 'iconsax-react';
import { useEffect, useState } from 'react';
import styled from 'styled-components';

import {
  allCompatibleChains,
  getLogoForChainId,
} from '../../../../utils/blockchain';
import { CustomChain, readCustomChains } from '../../../../utils/customChains';
import CustomChainForm from './CustomChainForm';

type SettingsModalProps = {
  onClose: () => void;
};

const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const [isAddingCustomChain, setIsAddingCustomChain] = useState(false);
  const [customChains, setCustomChains] = useState<CustomChain[]>(() =>
    readCustomChains()
  );

  useEffect(() => {
    const htmlElement = document.documentElement;
    const hadHtmlScrollLock = htmlElement.classList.contains(
      'pillarx-no-page-scroll'
    );
    const hadBodyScrollLock = document.body.classList.contains(
      'pillarx-no-page-scroll'
    );

    htmlElement.classList.add('pillarx-no-page-scroll');
    document.body.classList.add('pillarx-no-page-scroll');

    return () => {
      if (!hadHtmlScrollLock) {
        htmlElement.classList.remove('pillarx-no-page-scroll');
      }

      if (!hadBodyScrollLock) {
        document.body.classList.remove('pillarx-no-page-scroll');
      }
    };
  }, []);

  const handleAddCustomChain = () => {
    setIsAddingCustomChain(true);
  };

  const handleCustomChainAdded = () => {
    setCustomChains(readCustomChains());
    setIsAddingCustomChain(false);
  };

  const handleClose = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 160);
  };

  return (
    <Overlay $isClosing={isClosing}>
      <Content>
        <Header>
          <Title>Settings</Title>
          <CloseButton
            type="button"
            onClick={handleClose}
            aria-label="Close settings"
          >
            <CloseCircle size={28} variant="Outline" />
          </CloseButton>
        </Header>

        {isAddingCustomChain ? (
          <CustomChainForm
            onCancel={() => setIsAddingCustomChain(false)}
            onChainAdded={handleCustomChainAdded}
          />
        ) : (
          <>
            <SectionTitle>Supported chains</SectionTitle>
            <ChainList>
              {allCompatibleChains.map((chain) => (
                <ChainRow key={chain.chainId}>
                  <ChainIcon
                    src={getLogoForChainId(chain.chainId)}
                    alt={`${chain.chainName} logo`}
                  />
                  <ChainInfo>
                    <ChainName>{chain.chainName}</ChainName>
                    <ChainId>Chain ID {chain.chainId}</ChainId>
                  </ChainInfo>
                </ChainRow>
              ))}

              {customChains.map((chain) => (
                <ChainRow key={`custom-chain-${chain.chainId}`}>
                  <ChainIcon
                    src={getLogoForChainId(chain.chainId)}
                    alt={`${chain.chainName} logo`}
                  />
                  <ChainInfo>
                    <ChainName>{chain.chainName}</ChainName>
                    <ChainId>
                      Chain ID {chain.chainId} · Native{' '}
                      {chain.nativeTokenSymbol} ·{' '}
                      {chain.gaslessEnabled
                        ? 'Gasless enabled'
                        : 'Gasless disabled'}
                    </ChainId>
                  </ChainInfo>
                </ChainRow>
              ))}
            </ChainList>

            <AddChainButton type="button" onClick={handleAddCustomChain}>
              <Add size={22} variant="Outline" />
              <span>Add custom chain</span>
            </AddChainButton>
          </>
        )}
      </Content>
    </Overlay>
  );
};

const Overlay = styled.div<{ $isClosing: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 1000;
  width: 100%;
  height: 100dvh;
  min-height: 0;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #030306;
  color: #ffffff;
  animation: ${({ $isClosing }) =>
    $isClosing
      ? 'settingsPageOut 160ms ease-in forwards'
      : 'settingsPageIn 180ms ease-out forwards'};

  @keyframes settingsPageIn {
    from {
      opacity: 0;
      transform: translateX(12px);
    }

    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes settingsPageOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }

    to {
      opacity: 0;
      transform: translateX(12px);
    }
  }
`;

const Content = styled.div`
  display: flex;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  gap: 20px;
  padding: 32px 16px 120px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h1`
  margin: 0;
  color: #ffffff;
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
`;

const CloseButton = styled.button`
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 2px solid #322d3f;
  border-radius: 14px;
  background: #17131f;
  color: #d8cdf8;
  cursor: pointer;
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: #a9a0b7;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
`;

const ChainList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ChainRow = styled.div`
  display: flex;
  min-height: 72px;
  align-items: center;
  gap: 14px;
  border: 2px solid #292533;
  border-radius: 14px;
  background: #0d0b12;
  padding: 12px 14px;
`;

const ChainIcon = styled.img`
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
`;

const ChainInfo = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
`;

const ChainName = styled.span`
  color: #ffffff;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.15;
`;

const ChainId = styled.span`
  color: #a9a0b7;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
`;

const AddChainButton = styled.button`
  display: flex;
  width: 100%;
  min-height: 58px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2px solid #5d41a8;
  border-radius: 14px;
  background: #2b2143;
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
`;

export default SettingsModal;
