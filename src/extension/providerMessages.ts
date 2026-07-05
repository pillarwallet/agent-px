export const PILLARX_PROVIDER_REQUEST = 'PILLARX_PROVIDER_REQUEST';
export const PILLARX_PROVIDER_RESPONSE = 'PILLARX_PROVIDER_RESPONSE';
export const PILLARX_PROVIDER_EVENT = 'PILLARX_PROVIDER_EVENT';
export const PILLARX_PROVIDER_RPC_REQUEST = 'PILLARX_PROVIDER_RPC_REQUEST';

export type ProviderRequestArguments = {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
};

export type ProviderRpcErrorPayload = {
  code: number;
  message: string;
  data?: unknown;
};

export type ProviderRequestPayload = {
  id: string;
  args: ProviderRequestArguments;
};

export type ProviderPageRequestMessage = {
  target: 'pillarx-content';
  type: typeof PILLARX_PROVIDER_REQUEST;
  payload: ProviderRequestPayload;
};

export type ProviderPageResponseMessage = {
  target: 'pillarx-inpage';
  type: typeof PILLARX_PROVIDER_RESPONSE;
  id: string;
  result?: unknown;
  error?: ProviderRpcErrorPayload;
};

export type ProviderEventMessage = {
  target: 'pillarx-inpage';
  type: typeof PILLARX_PROVIDER_EVENT;
  event: string;
  data: unknown;
};

export type ProviderRuntimeRequestMessage = {
  type: typeof PILLARX_PROVIDER_RPC_REQUEST;
  id: string;
  origin: string;
  url: string;
  title?: string;
  favicon?: string;
  args: ProviderRequestArguments;
};

export type ProviderRuntimeResponseMessage = {
  id: string;
  result?: unknown;
  error?: ProviderRpcErrorPayload;
};
