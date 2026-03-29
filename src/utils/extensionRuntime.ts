export type ExtensionViewContext = 'popup' | 'options' | undefined;

declare global {
  interface Window {
    __PILLARX_EXTENSION_VIEW__?: ExtensionViewContext;
  }
}

type ChromeRuntimeLike = {
  id?: string;
};

type ChromeLike = {
  runtime?: ChromeRuntimeLike;
};

const getChromeRuntime = (): ChromeRuntimeLike | undefined => {
  const chromeLike = (globalThis as { chrome?: ChromeLike }).chrome;
  return chromeLike?.runtime;
};

export const isExtensionRuntime = () => Boolean(getChromeRuntime()?.id);

export const getExtensionViewContext = (): ExtensionViewContext => {
  if (typeof window === 'undefined') return undefined;
  return window.__PILLARX_EXTENSION_VIEW__;
};

export const isExtensionPopupView = () =>
  isExtensionRuntime() && getExtensionViewContext() === 'popup';
