import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// utils
import { isTestnet } from '../utils/blockchain';

type VerificationRequest = {
  to: string;
  channel: 'sms';
};

type VerificationResponse = Record<string, unknown>;

export const pillarXApiVerification = createApi({
  reducerPath: 'pillarXApiVerification',
  baseQuery: fetchBaseQuery({
    baseUrl: isTestnet
      ? 'https://verification-nubpgwxpiq-uc.a.run.app'
      : 'https://verification-7eu4izffpa-uc.a.run.app',
    headers: {
      'Content-Type': 'application/json',
    },
  }),
  endpoints: (builder) => ({
    sendVerificationOtp: builder.mutation<
      VerificationResponse,
      VerificationRequest
    >({
      query: (payload) => ({
        url: '',
        method: 'POST',
        body: payload,
      }),
    }),
  }),
});

export const { useSendVerificationOtpMutation } = pillarXApiVerification;
