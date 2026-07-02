/* eslint-disable @typescript-eslint/no-use-before-define */
import { ArrowRight2 as ChevronRightIcon } from 'iconsax-react';
import React, { useCallback } from 'react';
import styled from 'styled-components';

const OPEN_SIDE_PANEL_MESSAGE_TYPE = 'PILLARX_OPEN_SIDE_PANEL';

type ChromeWindow = {
  id?: number;
};

type ChromeLike = {
  runtime?: {
    lastError?: {
      message?: string;
    };
    sendMessage?: (
      message: unknown,
      responseCallback?: (response?: unknown) => void
    ) => void;
  };
  sidePanel?: {
    open?: (options: { windowId: number }) => Promise<void>;
  };
  windows?: {
    getCurrent?: (callback: (window: ChromeWindow) => void) => void;
  };
};

const getChromeLike = (): ChromeLike | undefined =>
  (globalThis as { chrome?: ChromeLike }).chrome;

const getCurrentWindowId = (chromeLike: ChromeLike): Promise<number> =>
  new Promise((resolve, reject) => {
    if (!chromeLike.windows?.getCurrent) {
      reject(new Error('Chrome windows API is unavailable.'));
      return;
    }

    chromeLike.windows.getCurrent((currentWindow) => {
      const lastErrorMessage = chromeLike.runtime?.lastError?.message;

      if (lastErrorMessage) {
        reject(new Error(lastErrorMessage));
        return;
      }

      if (typeof currentWindow.id !== 'number') {
        reject(new Error('Unable to resolve current extension window.'));
        return;
      }

      resolve(currentWindow.id);
    });
  });

const requestBackgroundSidePanelOpen = (
  chromeLike: ChromeLike
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!chromeLike.runtime?.sendMessage) {
      reject(new Error('Chrome runtime messaging is unavailable.'));
      return;
    }

    chromeLike.runtime.sendMessage(
      { type: OPEN_SIDE_PANEL_MESSAGE_TYPE },
      (response) => {
        const lastErrorMessage = chromeLike.runtime?.lastError?.message;

        if (lastErrorMessage) {
          reject(new Error(lastErrorMessage));
          return;
        }

        if (
          typeof response === 'object' &&
          response !== null &&
          'ok' in response &&
          response.ok === true
        ) {
          resolve();
          return;
        }

        reject(new Error('Unable to open PillarX side panel.'));
      }
    );
  });

const openPillarXSidePanel = async () => {
  const chromeLike = getChromeLike();

  if (!chromeLike) return;

  if (chromeLike.sidePanel?.open) {
    try {
      const windowId = await getCurrentWindowId(chromeLike);
      await chromeLike.sidePanel.open({ windowId });
      window.close();
      return;
    } catch {
      // Fall through to the background worker fallback.
    }
  }

  await requestBackgroundSidePanelOpen(chromeLike);
  window.close();
};

const ChevronModal = () => {
  const handleChevronButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      openPillarXSidePanel().catch(() => undefined);
    },
    []
  );

  return (
    <ChevronMenuItem
      aria-label="Bottom modal chevron action"
      id="bottom-modal-chevron-button"
      type="button"
      onClick={handleChevronButtonClick}
    >
      <ChevronRightIcon />
    </ChevronMenuItem>
  );
};

const ChevronMenuItem = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.text.bottomMenuItem};
  cursor: pointer;
  transition: all 0.1s ease-in-out;
  letter-spacing: -0.5px;
  font-size: 14px;
  user-select: none;
  height: 100%;
  margin-right: 17px;
  padding: 0 7px;
  border: 0;
  background: transparent;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    color: ${({ theme }) => theme.color.text.bottomMenuItemActive};
    padding: 0 15px;
    margin-right: 0;
  }
`;

export default ChevronModal;
