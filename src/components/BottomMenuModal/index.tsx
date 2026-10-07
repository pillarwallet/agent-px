/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react';
import { Transition } from 'react-transition-group';
import styled from 'styled-components';

// modals
import AccountModal from './AccountModal';
import AppsModal from './AppsModal';
import AutomationsModal from './AutomationsModal';
import HistoryModal from './HistoryModal/HistoryModal';
import SendModal from './SendModal';

// hooks
import useBottomMenuModal from '../../hooks/useBottomMenuModal';

const BottomMenuModal = () => {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const { active, activeIndex, hide } = useBottomMenuModal();

  return (
    <Transition nodeRef={modalRef} in={!!active} timeout={100}>
      {(overlayState) => (
        <OverflowControlWrapper>
          <ModalContentVerticalAnimation
            $offset={overlayState === 'entered' ? 0 : 1000}
            $display={overlayState !== 'exited'}
          >
            <ModalContent>
              {activeIndex === 0 && <AutomationsModal isContentVisible />}
              {activeIndex === 1 && (
                <SendModal
                  isContentVisible
                  {...(active?.type === 'send'
                    ? { payload: active.payload }
                    : {})}
                />
              )}
              {activeIndex === 2 && <HistoryModal isContentVisible />}
              {activeIndex === 3 && <AccountModal isContentVisible />}
              {activeIndex === 4 && <AppsModal isContentVisible />}
            </ModalContent>
            <ModalHandlebar onClick={hide} />
          </ModalContentVerticalAnimation>
        </OverflowControlWrapper>
      )}
    </Transition>
  );
};

const OverflowControlWrapper = styled.div`
  overflow: hidden;
`;

const ModalContentVerticalAnimation = styled.div<{
  $offset: number;
  $display: boolean;
}>`
  transition: 100ms linear;
  transform: translateY(${({ $offset }) => $offset}px);
  display: ${({ $display }) => ($display ? 'flex' : 'none')};
  flex-direction: row;
  align-content: start;
  justify-content: start;
  width: 100%;
  position: relative;
`;

const ModalContent = styled.div`
  width: 336px;
  height: 75dvh;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 31px 20px 20px;
  overflow: hidden;
  min-height: 0;
`;

const ModalHandlebar = styled.div`
  background: ${({ theme }) => theme.color.background.bottomModalHandlebar};
  height: 4px;
  width: 40px;
  cursor: pointer;
  border-radius: 2px;
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
`;

export default BottomMenuModal;
