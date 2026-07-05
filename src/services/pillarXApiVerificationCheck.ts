import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

type VerificationCheckRequest = {
  to: string;
  code: string;
  verificationSid: string;
};

type VerificationCheckResponse = Record<string, unknown>;

export const pillarXApiVerificationCheck = createApi({
  reducerPath: 'pillarXApiVerificationCheck',
  baseQuery: fetchBaseQuery({
    baseUrl: 'https://verificationcheck-nubpgwxpiq-uc.a.run.app',
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
