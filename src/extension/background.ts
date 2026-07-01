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
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;

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

    return false;
  }
);
