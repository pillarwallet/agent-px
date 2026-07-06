export const PILLARX_KEEP_ALIVE_PORT = 'PILLARX_KEEP_ALIVE_PORT';

type ChromePortLike = {
  disconnect?: () => void;
  onDisconnect?: {
    addListener: (listener: () => void) => void;
  };
  postMessage?: (message: unknown) => void;
};

type ChromeRuntimeLike = {
  connect?: (connectInfo?: { name?: string }) => ChromePortLike;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
};

export const startPillarXBackgroundKeepAlive = (source: string) => {
  const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
  if (!chromeLike?.runtime?.connect) return undefined;

  let port: ChromePortLike | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const clearTimers = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }

    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = undefined;
    }
  };

  const connect = () => {
    if (stopped) return;

    try {
      port = chromeLike.runtime?.connect?.({ name: PILLARX_KEEP_ALIVE_PORT });
      port?.postMessage?.({
        source,
        type: 'PILLARX_KEEP_ALIVE',
      });

      intervalId = setInterval(() => {
        try {
          port?.postMessage?.({
            source,
            type: 'PILLARX_KEEP_ALIVE',
            timestamp: Date.now(),
          });
        } catch {
          clearTimers();
          if (!stopped) reconnectTimeoutId = setTimeout(connect, 5000);
        }
      }, 10000);

      port?.onDisconnect?.addListener(() => {
        port = undefined;
        clearTimers();
        if (!stopped) reconnectTimeoutId = setTimeout(connect, 5000);
      });
    } catch {
      clearTimers();
      if (!stopped) reconnectTimeoutId = setTimeout(connect, 5000);
    }
  };

  connect();

  return () => {
    stopped = true;
    clearTimers();
    port?.disconnect?.();
    port = undefined;
  };
};
