import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';

// store
import { addMiddleware } from '../../../store';

// utils
import { isTestnet } from '../../../utils/blockchain';

type RecordProfilePayload = {
  owner: string;
  account: string;
};

const profileBaseQuery = retry(
  fetchBaseQuery({
    baseUrl: isTestnet
      ? 'https://profiles-nubpgwxpiq-uc.a.run.app'
      : 'https://profiles-7eu4izffpa-uc.a.run.app',
  }),
  {
    maxRetries: 5,
  }
);

/**
 * This API is used to send Profile data.
 */
export const profileApi = createApi({
  reducerPath: 'profileApi',
  baseQuery: profileBaseQuery,
  endpoints: (builder) => ({
    recordProfile: builder.mutation<unknown, RecordProfilePayload>({
      query: (payload) => {
        return {
          url: 'ingest',
          method: 'POST',
          body: payload,
        };
      },
    }),
  }),
});

addMiddleware(profileApi);

export const { useRecordProfileMutation } = profileApi;
