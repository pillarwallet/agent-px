import { Add, Trash } from 'iconsax-react';
import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  allCompatibleChains,
  getLogoForChainId,
} from '../../../../utils/blockchain';
import {
  CustomChain,
  readCustomChains,
  removeCustomChain,
} from '../../../../utils/customChains';
import {
  DEFAULT_EXTENSION_DISPLAY_MODE,
  ExtensionDisplayMode,
  readExtensionDisplayMode,
  writeExtensionDisplayMode,
} from '../../../../utils/extensionDisplayMode';
import CustomChainForm from './CustomChainForm';

type SettingsModalProps = {
  onClose: () => void;
};

const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isAddingCustomChain, setIsAddingCustomChain] = useState(false);
  const [editingCustomChain, setEditingCustomChain] =
    useState<CustomChain | null>(null);
  const [chainPendingDeletion, setChainPendingDeletion] =
    useState<CustomChain | null>(null);
  const [customChains, setCustomChains] = useState<CustomChain[]>(() =>
    readCustomChains()
  );
  const [displayMode, setDisplayMode] = useState<ExtensionDisplayMode>(
    DEFAULT_EXTENSION_DISPLAY_MODE
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

  useEffect(() => {
    let cancelled = false;

    readExtensionDisplayMode().then((mode) => {
      if (!cancelled) {
        setDisplayMode(mode);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAddingCustomChain && !editingCustomChain) return;

    requestAnimationFrame(() => {
      overlayRef.current?.scrollTo({ top: 0 });
    });
  }, [editingCustomChain, isAddingCustomChain]);

  useEffect(() => {
    if (!chainPendingDeletion) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setChainPendingDeletion(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chainPendingDeletion]);

  const handleAddCustomChain = () => {
    setEditingCustomChain(null);
    setIsAddingCustomChain(true);
  };

  const handleCustomChainAdded = () => {
    setCustomChains(readCustomChains());
    setIsAddingCustomChain(false);
    setEditingCustomChain(null);
  };

  const handleCustomChainCancel = () => {
    setIsAddingCustomChain(false);
    setEditingCustomChain(null);
  };

  const handleDeleteCustomChain = (chain: CustomChain) => {
    setChainPendingDeletion(chain);
  };

  const handleConfirmCustomChainDeletion = () => {
    if (!chainPendingDeletion) return;

    removeCustomChain(chainPendingDeletion.chainId);
    setCustomChains(readCustomChains());
    setChainPendingDeletion(null);
  };

  const handleClose = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 160);
  };

  const handleDisplayModeChange = (mode: ExtensionDisplayMode) => {
    setDisplayMode(mode);
    writeExtensionDisplayMode(mode).catch((error) => {
      console.error('Failed to save extension display mode', error);
      setDisplayMode(DEFAULT_EXTENSION_DISPLAY_MODE);
    });
  };

  return (
    <Overlay $isClosing={isClosing} ref={overlayRef}>
      <Content>
        <Header>
          <Title>Settings</Title>
          <CloseButton
            type="button"
            onClick={handleClose}
            aria-label="Close settings"
          >
            ×
          </CloseButton>
        </Header>

        {isAddingCustomChain || editingCustomChain ? (
          <CustomChainForm
            initialChain={editingCustomChain || undefined}
            onCancel={handleCustomChainCancel}
            onChainAdded={handleCustomChainAdded}
          />
        ) : (
          <>
            <SectionGroup>
              <DisplayModeRow>
                <DisplayModeLabel>Side Panel</DisplayModeLabel>
                <ModeSwitch
                  type="button"
                  role="switch"
                  aria-checked={displayMode === 'sidePanel'}
                  aria-label="Open wallet in side panel"
                  $active={displayMode === 'sidePanel'}
                  onClick={() =>
                    handleDisplayModeChange(
                      displayMode === 'sidePanel' ? 'popup' : 'sidePanel'
                    )
                  }
                >
                  <ModeSwitchKnob $active={displayMode === 'sidePanel'} />
                </ModeSwitch>
              </DisplayModeRow>
            </SectionGroup>

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
                    <ChainId>{chain.chainId}</ChainId>
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
                      {chain.chainId} · {chain.nativeTokenSymbol}
                    </ChainId>
                  </ChainInfo>
                  <ChainActions>
                    <EditChainButton
                      type="button"
                      onClick={() => setEditingCustomChain(chain)}
                    >
                      Edit
                    </EditChainButton>
                    <DeleteChainButton
                      type="button"
                      aria-label={`Delete ${chain.chainName}`}
                      title={`Delete ${chain.chainName}`}
                      onClick={() => handleDeleteCustomChain(chain)}
                    >
                      <Trash size={17} variant="Outline" />
                    </DeleteChainButton>
                  </ChainActions>
                </ChainRow>
              ))}
            </ChainList>

            <AddChainButton type="button" onClick={handleAddCustomChain}>
              <Add size={22} variant="Outline" />
              <span>Add chain</span>
            </AddChainButton>
          </>
        )}
      </Content>
      {chainPendingDeletion && (
        <DeleteConfirmationBackdrop
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setChainPendingDeletion(null);
            }
          }}
        >
          <DeleteConfirmationDialog
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chain-title"
            aria-describedby="delete-chain-description"
          >
            <DeleteConfirmationIcon>
              <Trash size={22} variant="Outline" />
            </DeleteConfirmationIcon>
            <DeleteConfirmationTitle id="delete-chain-title">
              Delete {chainPendingDeletion.chainName}?
            </DeleteConfirmationTitle>
            <DeleteConfirmationDescription id="delete-chain-description">
              Its RPC configuration and tracked tokens will be removed from
              PillarX.
            </DeleteConfirmationDescription>
            <DeleteConfirmationActions>
              <DeleteConfirmationCancelButton
                type="button"
                onClick={() => setChainPendingDeletion(null)}
              >
                Cancel
              </DeleteConfirmationCancelButton>
              <DeleteConfirmationButton
                type="button"
                autoFocus
                onClick={handleConfirmCustomChainDeletion}
              >
                Delete chain
              </DeleteConfirmationButton>
            </DeleteConfirmationActions>
          </DeleteConfirmationDialog>
        </DeleteConfirmationBackdrop>
      )}
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
  font-family: ${({ theme }) => theme.font.primary.family};
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
  font-weight: 500;
  line-height: 1;
`;

const CloseButton = styled.button`
  display: flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #d8d2e6;
  cursor: pointer;
  font-size: 34px;
  font-weight: 300;
  line-height: 1;
  padding: 0 0 4px;

  &:hover {
    background: #17131f;
  }
`;

const SectionTitle = styled.h2`
  margin: 0;
  color: #a9a0b7;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.2;
`;

const SectionGroup = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DisplayModeRow = styled.div`
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  border: 2px solid #292533;
  border-radius: 14px;
  background: #0d0b12;
  padding: 12px 14px;
`;

const DisplayModeLabel = styled.span`
  color: #ffffff;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.2;
`;

const ModeSwitch = styled.button<{ $active: boolean }>`
  position: relative;
  width: 52px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? '#6d55d8' : '#292533')};
  cursor: pointer;
  padding: 3px;
  transition: background 160ms ease;

  &:hover {
    background: ${({ $active }) => ($active ? '#7d63f0' : '#342f40')};
  }
`;

const ModeSwitchKnob = styled.span<{ $active: boolean }>`
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
  transform: translateX(${({ $active }) => ($active ? '22px' : '0')});
  transition: transform 160ms ease;
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
  flex: 1;
  flex-direction: column;
  gap: 4px;
`;

const ChainName = styled.span`
  color: #ffffff;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.15;
`;

const ChainId = styled.span`
  color: #a9a0b7;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.2;
`;

const ChainActions = styled.div`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
`;

const EditChainButton = styled.button`
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid #393245;
  border-radius: 10px;
  background: #17131f;
  color: #d8cdf8;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  padding: 0 12px;
`;

const DeleteChainButton = styled.button`
  display: flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #4b2a36;
  border-radius: 10px;
  background: #211219;
  color: #ff6b8a;
  cursor: pointer;
  padding: 0;

  &:hover {
    border-color: #ff6b8a;
    background: #2d1721;
  }
`;

const DeleteConfirmationBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(3 3 6 / 82%);
  backdrop-filter: blur(4px);
  padding: 16px;
`;

const DeleteConfirmationDialog = styled.div`
  display: flex;
  width: 100%;
  max-width: 360px;
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  border: 1px solid #393245;
  border-radius: 14px;
  background: #111016;
  box-shadow: 0 20px 50px rgb(0 0 0 / 45%);
  padding: 24px;
  text-align: center;
`;

const DeleteConfirmationIcon = styled.div`
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 1px solid #5e2c3c;
  border-radius: 50%;
  background: #2d1721;
  color: #ff6b8a;
`;

const DeleteConfirmationTitle = styled.h2`
  margin: 16px 0 0;
  color: #ffffff;
  font-size: 20px;
  font-weight: 500;
  line-height: 1.2;
`;

const DeleteConfirmationDescription = styled.p`
  margin: 10px 0 0;
  color: #a9a0b7;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
`;

const DeleteConfirmationActions = styled.div`
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  margin-top: 24px;
`;

const DeleteConfirmationCancelButton = styled.button`
  min-height: 46px;
  border: 1px solid #393245;
  border-radius: 10px;
  background: #1a181f;
  color: #ffffff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
`;

const DeleteConfirmationButton = styled.button`
  min-height: 46px;
  border: 1px solid #ff6b8a;
  border-radius: 10px;
  background: #d63f61;
  color: #ffffff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;

  &:hover {
    background: #e34c6d;
  }
`;

const AddChainButton = styled.button`
  display: flex;
  width: 100%;
  min-height: 58px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 2px solid ${({ theme }) => theme.color.background.buttonPrimary};
  border-radius: 14px;
  background: ${({ theme }) => theme.color.background.buttonPrimary};
  color: ${({ theme }) => theme.color.text.buttonPrimary};
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  opacity: 1;
`;

export default SettingsModal;
