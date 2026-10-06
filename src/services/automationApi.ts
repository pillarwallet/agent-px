import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Address, Hex } from 'viem';

export type TradingPolicyStatus =
  | 'DRAFT'
  | 'AWAITING_INSTALLATION'
  | 'ACTIVE'
  | 'REVOKED'
  | 'EXPIRED'
  | 'FAILED';

export type TradingPolicy = {
  id: string;
  walletAddress: string;
  chainId: number;
  name: string;
  permissionId: string;
  sessionSignerAddress: string;
  usdcTokenAddress: string;
  cumulativeUsdcLimit: string;
  remainingUsdcLimit?: string;
  remainingUsdcBalance?: string;
  remainingUsdc?: string;
  remainingBalance?: string;
  availableUsdcLimit?: string;
  providerIds: string[];
  validAfter: string;
  validUntil: string;
  status: TradingPolicyStatus;
  createdAt: string;
  updatedAt: string;
};

type CreatePolicyRequest = {
  walletAddress: string;
  chainId: number;
  name: string;
  cumulativeUsdcLimit: string;
  providerIds: ['0x-allowance-holder'];
  validUntil: string;
};

type PolicyInstallationAuthorization = {
  permissionId: Hex;
  sessionSignerAddress: Address;
  policyConfig: Record<string, unknown>;
  installation: {
    kernelVersion: string;
    entryPoint: Address;
    initConfig: Hex[];
    calls: { to: Address; value: string; data: Hex }[];
    callData: Hex;
  };
};

type PreparePolicyInstallationResponse = {
  policy: TradingPolicy;
  authorization: PolicyInstallationAuthorization;
};

type ConfirmPolicyInstallationResponse = {
  policy: TradingPolicy;
  installation: {
    status: 'PENDING' | 'VERIFIED' | 'FAILED';
    reason?: string;
    transactionHash?: Hex;
  };
};

export type AutomationOrderStatus =
  | 'DRAFT'
  | 'AWAITING_AUTHORIZATION'
  | 'ACTIVE'
  | 'TRIGGERED'
  | 'QUOTING'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'FAILED';

export type AutomationOrder = {
  id: string;
  walletAddress: Address;
  chainId: number;
  policyId?: string;
  tokenIn: { kind: 'erc20'; address: Address };
  tokenOut:
    | {
        kind: 'erc20';
        address: Address;
        name?: string;
        symbol?: string;
        logoUrl?: string;
      }
    | { kind: 'native' };
  amountIn: string;
  minPrice?: string;
  maxPrice?: string;
  maxSlippageBps: number;
  expiresAt: string;
  status: AutomationOrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type OrderConsent = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, string | number | boolean>;
  digest: Hex;
};

export type CreateOrderRequest = {
  walletAddress: Address;
  chainId: number;
  policyId: string;
  tokenIn: { kind: 'erc20'; address: Address };
  tokenOut:
    | {
        kind: 'erc20';
        address: Address;
        name: string;
        symbol: string;
        logoUrl?: string;
      }
    | { kind: 'native' };
  amountIn: string;
  quoteCurrency: 'usd';
  minPrice?: string;
  maxPrice?: string;
  maxSlippageBps: number;
  expiresAt: string;
};

export type ListOrdersRequest = {
  walletAddress: Address;
  chainId: number;
};

export const automationApi = createApi({
  reducerPath: 'automationApi',
  baseQuery: fetchBaseQuery({
    baseUrl:
      import.meta.env.VITE_AUTOMATION_API_URL?.replace(/\/$/, '') ||
      'http://127.0.0.1:3000',
  }),
  tagTypes: ['Policies', 'Orders'],
  endpoints: (builder) => ({
    getPolicies: builder.query<
      { policies: TradingPolicy[] },
      { walletAddress: string; chainId?: number }
    >({
      query: ({ walletAddress, chainId }) => ({
        url: '/v1/policies',
        params: { walletAddress, ...(chainId ? { chainId } : {}) },
      }),
      providesTags: ['Policies'],
    }),
    createPolicy: builder.mutation<
      { policy: TradingPolicy },
      CreatePolicyRequest
    >({
      query: (body) => ({
        url: '/v1/policies',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Policies'],
    }),
    preparePolicyInstallation: builder.mutation<
      PreparePolicyInstallationResponse,
      { policyId: string }
    >({
      query: ({ policyId }) => ({
        url: `/v1/policies/${policyId}/installation/prepare`,
        method: 'POST',
      }),
      invalidatesTags: ['Policies'],
    }),
    confirmPolicyInstallation: builder.mutation<
      ConfirmPolicyInstallationResponse,
      { policyId: string; transactionHash: Hex }
    >({
      query: ({ policyId, transactionHash }) => ({
        url: `/v1/policies/${policyId}/installation`,
        method: 'POST',
        body: { transactionHash },
      }),
      invalidatesTags: ['Policies'],
    }),
    createOrder: builder.mutation<
      {
        order: AutomationOrder;
        policy: { id: string; permissionId: Hex };
        consent: OrderConsent;
      },
      CreateOrderRequest
    >({
      query: (body) => ({
        url: '/v1/orders',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Orders'],
    }),
    submitOrderConsent: builder.mutation<
      { order: AutomationOrder },
      { orderId: string; signature: Hex }
    >({
      query: ({ orderId, signature }) => ({
        url: `/v1/orders/${orderId}/consent`,
        method: 'POST',
        body: { signature },
      }),
      invalidatesTags: ['Orders'],
    }),
    listOrders: builder.mutation<
      { orders: AutomationOrder[] },
      ListOrdersRequest
    >({
      query: (body) => ({
        url: '/v1/orders/list',
        method: 'POST',
        body,
      }),
    }),
    deleteOrder: builder.mutation<void, { orderId: string }>({
      query: ({ orderId }) => ({
        url: `/v1/orders/${orderId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Orders'],
    }),
  }),
});

export const {
  useConfirmPolicyInstallationMutation,
  useCreatePolicyMutation,
  useDeleteOrderMutation,
  useCreateOrderMutation,
  useGetPoliciesQuery,
  useListOrdersMutation,
  usePreparePolicyInstallationMutation,
  useSubmitOrderConsentMutation,
} = automationApi;
