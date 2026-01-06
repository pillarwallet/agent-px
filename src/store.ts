/* eslint-disable @typescript-eslint/no-use-before-define */
// Core
import {
  Middleware,
  Reducer,
  combineReducers,
  configureStore,
  createDynamicMiddleware,
} from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

// Services
import depositSlice from './apps/deposit/reducer/depositSlice';
import leaderboardSlice from './apps/leaderboard/reducer/LeaderboardSlice';
import walletPortfolioSlice from './apps/pillarx-app/reducer/WalletPortfolioSlice';
import swapSlice from './apps/the-exchange/reducer/theExchangeSlice';
import tokenAtlasSlice from './apps/token-atlas/reducer/tokenAtlasSlice';
import { pillarXApiPresence } from './services/pillarXApiPresence';
import { pillarXApiTransactionsHistory } from './services/pillarXApiTransactionsHistory';
import { pillarXApiWaitlist } from './services/pillarXApiWaitlist';
import { pillarXApiWalletTransactions } from './services/pillarXApiWalletTransactions';
import { relayApi } from './services/relayApi';

// Initialisation
const dynamicMiddleware = createDynamicMiddleware();
const middlewareReducers: { [key: string]: Reducer } = {};

/**
 * @name addReducer
 * @description addReducer is a function that allows anyone
 * working with PillarX to add reducers to the store
 * from their own application.
 *
 * @param newReducer
 */
export const addReducer = (newReducer: {
  reducerPath: string;
  reducer: Reducer;
}) => {
  console.log('=== Adding reducer ===');
  console.log('Full object:', newReducer);
  console.log('Object keys:', Object.keys(newReducer));
  console.log('reducerPath:', newReducer.reducerPath);
  console.log('reducer type:', typeof newReducer.reducer);
  console.log('reducer value:', newReducer.reducer);

  const path = newReducer.reducerPath || (newReducer as any).name;
  if (!path) {
    console.error('Reducer path/name is missing for:', newReducer);
  } else {
    const actualReducer = newReducer.reducer;
    if (!actualReducer) {
      console.error('ERROR: Reducer is undefined/null for path:', path);
      console.error('This will cause Redux store to fail!');
      return; // Don't add invalid reducers
    }
    middlewareReducers[path] = actualReducer;
    console.log('✓ Successfully added reducer for:', path);
    console.log('Current reducers:', Object.keys(middlewareReducers));
    store.replaceReducer(combineReducers(middlewareReducers));
  }
};

/**
 * @name addMiddleware
 * @description addMiddleware is a function that allows anyone
 * working with PillarX to add RTK middleware to the store
 * from their own application.
 *
 * @param newMiddleware
 */
export const addMiddleware = (newMiddleware: {
  reducerPath: string;
  reducer: Reducer;
  middleware: Middleware;
}) => {
  middlewareReducers[newMiddleware.reducerPath as string] =
    newMiddleware.reducer;
  dynamicMiddleware.addMiddleware(newMiddleware.middleware);

  store.replaceReducer(combineReducers(middlewareReducers));
};

/**
 * Export a store from RTK
 */
export const store = configureStore({
  // Empty reducer for now - the addMiddleware function
  // below will dynamically regenerate the reducers required
  // from the middleware functions.
  reducer: {},
  // Adding the api middleware enables caching, invalidation, polling,
  // and other useful features of `rtk-query`.
  // Note: here we have added dynamicMiddleware.middleware
  // which instructs the store to use the middleware that we
  // will add later.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(dynamicMiddleware.middleware),
});

/**
 * Whilst we're here we'll immediately mount the
 * PillarXApi middleware. This will contain all the
 * core API functionality for the PillarX application.
 */
addMiddleware(pillarXApiWaitlist);
addMiddleware(pillarXApiPresence);
addMiddleware(pillarXApiTransactionsHistory);
addMiddleware(pillarXApiWalletTransactions);
addMiddleware(relayApi);
addReducer({ reducerPath: swapSlice.name, reducer: swapSlice.reducer });
addReducer({ reducerPath: tokenAtlasSlice.name, reducer: tokenAtlasSlice.reducer });
addReducer({ reducerPath: depositSlice.name, reducer: depositSlice.reducer });
addReducer({ reducerPath: walletPortfolioSlice.name, reducer: walletPortfolioSlice.reducer });
addReducer({ reducerPath: leaderboardSlice.name, reducer: leaderboardSlice.reducer });

// optional, but required for refetchOnFocus/refetchOnReconnect behaviors
// see `setupListeners` docs - takes an optional callback as the 2nd arg for customization
setupListeners(store.dispatch);

// // Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
