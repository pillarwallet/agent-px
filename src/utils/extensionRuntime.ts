export type ExtensionViewContext =
  | 'popup'
  | 'options'
  | 'sidePanel'
  | undefined;

declare global {
  interface Window {
    pillarXExtensionView?: ExtensionViewContext;
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
  return window.pillarXExtensionView;
};

export const isExtensionPopupView = () =>
  isExtensionRuntime() &&
  ['popup', 'sidePanel'].includes(getExtensionViewContext() ?? '');
