const PILLARX_PROVIDER_REQUEST = 'PILLARX_PROVIDER_REQUEST';
const PILLARX_PROVIDER_RESPONSE = 'PILLARX_PROVIDER_RESPONSE';
const PILLARX_PROVIDER_EVENT = 'PILLARX_PROVIDER_EVENT';

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

type ProviderEventMessage = {
  target: 'pillarx-inpage';
  type: typeof PILLARX_PROVIDER_EVENT;
  event: string;
  data: unknown;
};

type Listener = (...args: unknown[]) => void;
type ProviderRpcError = Error & {
  code: number;
  data?: unknown;
};

declare global {
  interface Window {
    ethereum?: PillarXInjectedProvider;
    pillarXEthereum?: PillarXInjectedProvider;
  }
}

const createRequestId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createProviderUuid = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return '0b5d2c67-91ce-42e1-b8e2-67c9637f1c66';
};

const createProviderRpcError = ({
  code,
  message,
  data,
}: ProviderRpcErrorPayload): ProviderRpcError => {
  const error = new Error(message) as ProviderRpcError;
  error.name = 'ProviderRpcError';
  error.code = code;
  error.data = data;
  return error;
};

const isProviderRpcError = (error: unknown): error is ProviderRpcError =>
  error instanceof Error &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'number';

const PROVIDER_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const PROVIDER_PROHIBITED_PATH_SUFFIXES = [/\.pdf$/iu, /\.xml$/iu];

const isTopLevelWindow = () => {
  try {
    return window.top === window;
  } catch {
    return false;
  }
};

const shouldInitializeInjectedProvider = () => {
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

class PillarXInjectedProvider {
  readonly isPillarX = true;

  readonly isPillarXWallet = true;

  private listeners = new Map<string, Set<Listener>>();

  request(args: ProviderRequestArguments): Promise<unknown> {
    if (!args || typeof args.method !== 'string') {
      return Promise.reject(
        createProviderRpcError({
          code: 4200,
          message: 'Invalid EIP-1193 request arguments.',
        })
      );
    }

    const id = `${this.isPillarX ? 'pillarx' : 'request'}:${createRequestId()}`;

    return new Promise((resolve, reject) => {
      const responseHandler = (event: MessageEvent) => {
        if (event.source !== window) return;

        const message = event.data as Partial<ProviderPageResponseMessage>;
        if (
          !message ||
          message.target !== 'pillarx-inpage' ||
          message.type !== PILLARX_PROVIDER_RESPONSE ||
          message.id !== id
        ) {
          return;
        }

        window.removeEventListener('message', responseHandler);

        if (message.error) {
          reject(createProviderRpcError(message.error));
          return;
        }

        if (args.method === 'eth_requestAccounts') {
          this.emit('accountsChanged', message.result);
        }

        if (
          args.method === 'wallet_switchEthereumChain' ||
          args.method === 'wallet_addEthereumChain'
        ) {
          const firstParam = Array.isArray(args.params)
            ? args.params[0]
            : undefined;
          if (
            firstParam &&
            typeof firstParam === 'object' &&
            'chainId' in firstParam
          ) {
            this.emit(
              'chainChanged',
              (firstParam as { chainId?: unknown }).chainId
            );
          }
        }

        resolve(message.result);
      };

      window.addEventListener('message', responseHandler);

      const requestMessage: ProviderPageRequestMessage = {
        target: 'pillarx-content',
        type: PILLARX_PROVIDER_REQUEST,
        payload: {
          id,
          args,
        },
      };

      window.postMessage(requestMessage, window.location.origin);
    });
  }

  on(eventName: string, listener: Listener) {
    const eventListeners = this.listeners.get(eventName) ?? new Set();
    eventListeners.add(listener);
    this.listeners.set(eventName, eventListeners);
    return this;
  }

  removeListener(eventName: string, listener: Listener) {
    this.listeners.get(eventName)?.delete(listener);
    return this;
  }

  emit(eventName: string, ...args: unknown[]) {
    this.listeners.get(eventName)?.forEach((listener) => {
      listener(...args);
    });
    return this;
  }

  enable() {
    return this.request({ method: 'eth_requestAccounts' });
  }

  send(
    payload: ProviderRequestArguments & { id?: string; jsonrpc?: string },
    callback?: (
      error: ProviderRpcError | null,
      response?: { id?: string; jsonrpc: string; result?: unknown }
    ) => void
  ) {
    if (typeof callback === 'function') {
      this.request(payload)
        .then((result) => {
          callback(null, {
            id: payload.id,
            jsonrpc: payload.jsonrpc ?? '2.0',
            result,
          });
        })
        .catch((error) => {
          callback(isProviderRpcError(error) ? error : null);
        });
      return undefined;
    }

    return this.request(payload);
  }

  sendAsync(
    payload: ProviderRequestArguments & { id?: string; jsonrpc?: string },
    callback: (
      error: ProviderRpcError | null,
      response?: { id?: string; jsonrpc: string; result?: unknown }
    ) => void
  ) {
    return this.send(payload, callback);
  }
}

const initializeInjectedProvider = () => {
  const provider = new PillarXInjectedProvider();
  const providerInfo = Object.freeze({
    uuid: createProviderUuid(),
    name: 'PillarX',
    icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACABAMAAAAxEHz4AAAAIVBMVEV1Adn///9vANj+/P+XP+LQqPLy6Py8g+2HI96pYOfTrvOQJ1PSAAAA/ElEQVRo3u2XsQrCMBCGQ3HoGkJ1DdIu3UJfQNoirvoEguIuvoSjgyCuPqnX0ErU6XJDEf+Prvn4oNw1VQoAAAAAAESRSM9frVBwqoWC494KBdNaKHDshGTusb2gYidM7p7LUMBOKLVnOwgMN6EwFeFeAs1NKEwXEAi4CV8C7R5SwQaCHxXoEQsmrWcRLaB9kFh6ogWfGwkCCMYR9J+2nghB2gas1jHjXAU4HbtQAiAYS/D2KqUFmnc/KDuBOQTseAW5o1tNlp4DmAPYGG1mNpwo5ghTAgkk19vGyASUUMkElCATUIJQkCyFApVn0l+lm1CgpOcBAAAAAP6WJx1PbDCvJNXfAAAAAElFTkSuQmCC',
    rdns: 'app.pillarx',
  });

  const setLegacyGlobalProvider = () => {
    window.pillarXEthereum = provider;

    if (!window.ethereum) {
      window.ethereum = provider;
      window.dispatchEvent(new Event('ethereum#initialized'));
    }
  };

  const announceProvider = () => {
    setLegacyGlobalProvider();

    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info: providerInfo,
          provider,
        }),
      })
    );
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const message = event.data as Partial<ProviderEventMessage>;
    if (
      !message ||
      message.target !== 'pillarx-inpage' ||
      message.type !== PILLARX_PROVIDER_EVENT ||
      typeof message.event !== 'string'
    ) {
      return;
    }

    provider.emit(message.event, message.data);
  });

  window.addEventListener('eip6963:requestProvider', announceProvider);

  announceProvider();
};

if (shouldInitializeInjectedProvider()) {
  initializeInjectedProvider();
}
