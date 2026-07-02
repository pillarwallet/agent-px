const TRANSACTION_DEBUG_STORAGE_KEY = 'debug_transactions';

export const isTransactionDebugEnabled = () => {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(TRANSACTION_DEBUG_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
};

export const transactionDebugLog = (...args: unknown[]) => {
  if (!isTransactionDebugEnabled()) return;

  // eslint-disable-next-line no-console
  console.log('[TRANSACTION-DEBUG]', ...args);
};

export const transactionDebugError = (...args: unknown[]) => {
  if (!isTransactionDebugEnabled()) return;

  // eslint-disable-next-line no-console
  console.error('[TRANSACTION-DEBUG]', ...args);
};
