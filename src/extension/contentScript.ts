const PILLARX_PROVIDER_REQUEST = 'PILLARX_PROVIDER_REQUEST';
const PILLARX_PROVIDER_RESPONSE = 'PILLARX_PROVIDER_RESPONSE';
const PILLARX_PROVIDER_RPC_REQUEST = 'PILLARX_PROVIDER_RPC_REQUEST';

type ProviderRequestArguments = {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
};

type ProviderRpcErrorPayload = {
  code: number;
  message: string;
  data?: unknown;
};

type ProviderPageRequestMessage = {
  target: 'pillarx-content';
  type: typeof PILLARX_PROVIDER_REQUEST;
  payload: {
    id: string;
    args: ProviderRequestArguments;
  };
};

type ProviderPageResponseMessage = {
  target: 'pillarx-inpage';
  type: typeof PILLARX_PROVIDER_RESPONSE;
  id: string;
  result?: unknown;
  error?: ProviderRpcErrorPayload;
};

type ProviderRuntimeRequestMessage = {
  type: typeof PILLARX_PROVIDER_RPC_REQUEST;
  id: string;
  origin: string;
  url: string;
  title?: string;
  favicon?: string;
  args: ProviderRequestArguments;
};

type ProviderRuntimeResponseMessage = {
  id: string;
  result?: unknown;
  error?: ProviderRpcErrorPayload;
};

type ChromeRuntimeLike = {
  getURL: (path: string) => string;
  lastError?: {
    message?: string;
  };
  sendMessage: (
    message: ProviderRuntimeRequestMessage,
    callback: (response?: ProviderRuntimeResponseMessage) => void
  ) => void;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
};

const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
const PROVIDER_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const PROVIDER_PROHIBITED_PATH_SUFFIXES = [/\.pdf$/iu, /\.xml$/iu];
let hasInjectedInpageProvider = false;

const isTopLevelWindow = () => {
  try {
    return window.top === window;
  } catch {
    return false;
  }
};

const shouldInitializeProviderBridge = () => {
  if (!isTopLevelWindow()) return false;
  if (!PROVIDER_ALLOWED_PROTOCOLS.has(window.location.protocol)) return false;
  if (
    PROVIDER_PROHIBITED_PATH_SUFFIXES.some((suffix) =>
      suffix.test(window.location.pathname)
    )
  ) {
    return false;
  }

  const { doctype, documentElement } = window.document;
  if (doctype && doctype.name !== 'html') return false;
  if (
    documentElement?.nodeName &&
    documentElement.nodeName.toLowerCase() !== 'html'
  ) {
    return false;
  }

  return true;
};

const injectInpageProvider = () => {
  if (hasInjectedInpageProvider || !chromeLike?.runtime?.getURL) return;

  hasInjectedInpageProvider = true;

  const script = document.createElement('script');
  script.src = chromeLike.runtime.getURL('assets/inpage.js');
  script.async = false;
  script.onload = () => script.remove();
  script.onerror = () => script.remove();

  (document.head || document.documentElement).appendChild(script);
};

const getFavicon = () => {
  const icon = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  );

  if (!icon?.href) return undefined;
  return icon.href;
};

const handleProviderRequest = (event: MessageEvent) => {
  if (event.source !== window) return;

  const message = event.data as Partial<ProviderPageRequestMessage>;
  if (
    !message ||
    message.target !== 'pillarx-content' ||
    message.type !== PILLARX_PROVIDER_REQUEST ||
    !message.payload?.id ||
    !message.payload.args?.method
  ) {
    return;
  }

  const runtimeMessage: ProviderRuntimeRequestMessage = {
    type: PILLARX_PROVIDER_RPC_REQUEST,
    id: message.payload.id,
    origin: window.location.origin,
    url: window.location.href,
    title: document.title,
    favicon: getFavicon(),
    args: message.payload.args,
  };

  chromeLike?.runtime?.sendMessage(runtimeMessage, (response) => {
    const lastError = chromeLike.runtime?.lastError?.message;

    const responseMessage: ProviderPageResponseMessage = {
      target: 'pillarx-inpage',
      type: PILLARX_PROVIDER_RESPONSE,
      id: message.payload?.id ?? runtimeMessage.id,
      ...(lastError
        ? {
            error: {
              code: 4900,
              message: lastError,
            },
          }
        : {
            result: response?.result,
            error: response?.error,
          }),
    };

    window.postMessage(responseMessage, window.location.origin);
  });
};

if (shouldInitializeProviderBridge()) {
  window.addEventListener('message', handleProviderRequest);
  window.addEventListener('eip6963:requestProvider', injectInpageProvider);
}
