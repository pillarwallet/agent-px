type ExtensionInstallReason = {
  reason?: string;
};

type ChromeRuntimeLike = {
  onInstalled?: {
    addListener: (listener: (details: ExtensionInstallReason) => void) => void;
  };
  onMessage?: {
    addListener: (
      listener: (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void
      ) => boolean | void
    ) => void;
  };
  lastError?: {
    message?: string;
  };
};

type ChromeWindow = {
  id?: number;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
  sidePanel?: {
    open?: (options: { windowId: number }) => Promise<void>;
  };
  windows?: {
    getLastFocused?: (callback: (window: ChromeWindow) => void) => void;
  };
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
const OPEN_SIDE_PANEL_MESSAGE_TYPE = 'PILLARX_OPEN_SIDE_PANEL';

const getLastFocusedWindowId = (): Promise<number> =>
  new Promise((resolve, reject) => {
    if (!chromeLike?.windows?.getLastFocused) {
      reject(new Error('Chrome windows API is unavailable.'));
      return;
    }

    chromeLike.windows.getLastFocused((currentWindow) => {
      const lastErrorMessage = chromeLike.runtime?.lastError?.message;

      if (lastErrorMessage) {
        reject(new Error(lastErrorMessage));
        return;
      }

      if (typeof currentWindow.id !== 'number') {
        reject(new Error('Unable to resolve current browser window.'));
        return;
      }

      resolve(currentWindow.id);
    });
  });

const openSidePanel = async () => {
  if (!chromeLike?.sidePanel?.open) {
    throw new Error('Chrome side panel API is unavailable.');
  }

  const windowId = await getLastFocusedWindowId();
  await chromeLike.sidePanel.open({ windowId });
};

chromeLike?.runtime?.onInstalled?.addListener((details) => {
  // eslint-disable-next-line no-console
  console.info('PillarX extension installed/updated', details.reason);
});

chromeLike?.runtime?.onMessage?.addListener(
  (message, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      (message as { type?: string }).type === 'PILLARX_EXTENSION_PING'
    ) {
      sendResponse({ ok: true, source: 'background' });
      return true;
    }

    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      (message as { type?: string }).type === OPEN_SIDE_PANEL_MESSAGE_TYPE
    ) {
      openSidePanel()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    return false;
  }
);
