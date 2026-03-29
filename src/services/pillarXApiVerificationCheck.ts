import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// utils
import { isTestnet } from '../utils/blockchain';

type VerificationCheckRequest = {
  to: string;
  code: string;
  verificationSid: string;
};

type VerificationCheckResponse = Record<string, unknown>;

export const pillarXApiVerificationCheck = createApi({
  reducerPath: 'pillarXApiVerificationCheck',
  baseQuery: fetchBaseQuery({
    baseUrl: isTestnet
      ? 'https://verificationcheck-nubpgwxpiq-uc.a.run.app'
      : 'https://verificationcheck-7eu4izffpa-uc.a.run.app',
    headers: {
      'Content-Type': 'application/json',
    },
  }),
  endpoints: (builder) => ({
    verifyOtpCode: builder.mutation<
      VerificationCheckResponse,
      VerificationCheckRequest
    >({
      query: (payload) => ({
        url: '',
        method: 'POST',
        body: payload,
      }),
    }),
  }),
});

export const { useVerifyOtpCodeMutation } = pillarXApiVerificationCheck;
