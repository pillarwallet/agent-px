export const EXTENSION_DISPLAY_MODE_STORAGE_KEY =
  'pillarx:extensionDisplayMode:v1';

export type ExtensionDisplayMode = 'popup' | 'sidePanel';

export const DEFAULT_EXTENSION_DISPLAY_MODE: ExtensionDisplayMode = 'sidePanel';

type ChromeStorageAreaLike = {
  get?: (
    keys: string[] | string,
    callback?: (items?: Record<string, unknown>) => void
  ) => void | Record<string, unknown> | Promise<Record<string, unknown>>;
  set?: (
    items: Record<string, unknown>,
    callback?: () => void
  ) => void | Promise<void>;
};

const isExtensionDisplayMode = (
  value: unknown
): value is ExtensionDisplayMode => value === 'popup' || value === 'sidePanel';

const getChromeLocalStorage = () =>
  (globalThis as {
    chrome?: { storage?: { local?: ChromeStorageAreaLike } };
  }).chrome?.storage?.local;

const getLocalStorageDisplayMode = () => {
  try {
    const value = globalThis.localStorage?.getItem(
      EXTENSION_DISPLAY_MODE_STORAGE_KEY
    );

    return isExtensionDisplayMode(value)
      ? value
      : DEFAULT_EXTENSION_DISPLAY_MODE;
  } catch {
    return DEFAULT_EXTENSION_DISPLAY_MODE;
  }
};

const setLocalStorageDisplayMode = (mode: ExtensionDisplayMode) => {
  try {
    globalThis.localStorage?.setItem(EXTENSION_DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // Extension background contexts do not always expose localStorage.
  }
};

export const readExtensionDisplayMode = async (): Promise<ExtensionDisplayMode> =>
  new Promise((resolve) => {
    const storage = getChromeLocalStorage();

    if (!storage?.get) {
      resolve(getLocalStorageDisplayMode());
      return;
    }

    const finish = (items?: Record<string, unknown>) => {
      const storedMode = items?.[EXTENSION_DISPLAY_MODE_STORAGE_KEY];

      if (isExtensionDisplayMode(storedMode)) {
        setLocalStorageDisplayMode(storedMode);
        resolve(storedMode);
        return;
      }

      resolve(getLocalStorageDisplayMode());
    };

    try {
      const result = storage.get([EXTENSION_DISPLAY_MODE_STORAGE_KEY], finish);

      if (
        result &&
        typeof (result as Promise<Record<string, unknown>>).then === 'function'
      ) {
        (result as Promise<Record<string, unknown>>).then(finish).catch(() => {
          resolve(getLocalStorageDisplayMode());
        });
      } else if (result && typeof result === 'object') {
        finish(result as Record<string, unknown>);
      }
    } catch {
      resolve(getLocalStorageDisplayMode());
    }
  });

export const writeExtensionDisplayMode = async (
  mode: ExtensionDisplayMode
): Promise<void> =>
  new Promise((resolve) => {
    setLocalStorageDisplayMode(mode);

    const storage = getChromeLocalStorage();

    if (!storage?.set) {
      resolve();
      return;
    }

    const finish = () => resolve();

    try {
      const result = storage.set(
        { [EXTENSION_DISPLAY_MODE_STORAGE_KEY]: mode },
        finish
      );

      if (result && typeof (result as Promise<void>).then === 'function') {
        (result as Promise<void>).then(finish).catch(finish);
      }
    } catch {
      resolve();
    }
  });
