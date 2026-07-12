export const PILLARX_PROVIDER_REQUEST = 'PILLARX_PROVIDER_REQUEST';
export const PILLARX_PROVIDER_RESPONSE = 'PILLARX_PROVIDER_RESPONSE';
export const PILLARX_PROVIDER_EVENT = 'PILLARX_PROVIDER_EVENT';
export const PILLARX_PROVIDER_RPC_REQUEST = 'PILLARX_PROVIDER_RPC_REQUEST';
export const PILLARX_PROVIDER_APPROVAL_GET_PENDING =
  'PILLARX_PROVIDER_APPROVAL_GET_PENDING';
export const PILLARX_PROVIDER_APPROVAL_RESPOND =
  'PILLARX_PROVIDER_APPROVAL_RESPOND';

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

export type ProviderApprovalKind =
  | 'eth_requestAccounts'
  | 'eth_sendTransaction'
  | 'eth_sign'
  | 'eth_signTransaction'
  | 'eth_signTypedData'
  | 'eth_signTypedData_v3'
  | 'eth_signTypedData_v4'
  | 'personal_sign';

export type ProviderApprovalFeePaymentOption =
  | {
      id: 'native-token';
      title: string;
      type: 'native';
      value?: string;
    }
  | {
      balance?: number;
      decimals: number;
      id: string;
      imageSrc?: string;
      paymasterAddress: string;
      title: string;
      token: string;
      type: 'gasless';
      value?: string;
    };

export type ProviderApprovalFeePayment =
  | {
      type: 'native';
    }
  | {
      decimals: number;
      paymasterAddress: string;
      token: string;
      type: 'gasless';
    };

export type ProviderApprovalRequestView = {
  id: string;
  account?: string;
  chainId: number;
  createdAt: number;
  estimatedFee?: {
    formatted: string;
    gas?: string;
    feePerGas?: string;
    totalWei?: string;
  };
  feePaymentOptions?: ProviderApprovalFeePaymentOption[];
  favicon?: string;
  method: ProviderApprovalKind;
  origin: string;
  params?: ProviderRequestArguments['params'];
  simulation?: {
    changes: {
      amount?: string;
      assetType?: string;
      changeType?: string;
      contractAddress?: string;
      direction: 'receive' | 'spend';
      logo?: string;
      name?: string;
      symbol?: string;
      tokenId?: string | null;
    }[];
    error?: string;
  };
  title?: string;
  url: string;
};

export type ProviderApprovalGetPendingMessage = {
  type: typeof PILLARX_PROVIDER_APPROVAL_GET_PENDING;
};

export type ProviderApprovalRespondMessage = {
  type: typeof PILLARX_PROVIDER_APPROVAL_RESPOND;
  id: string;
  approved: boolean;
  feePayment?: ProviderApprovalFeePayment;
};
