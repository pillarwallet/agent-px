/**
 * Formatting utilities
 */

/**
 * Normalize symbol: strip USDT/USD/.P suffixes and uppercase
 */
export const normalizeSymbol = (ticker: string): string => {
  return ticker
    .replace(/\.P$/i, '')      // First remove .P suffix
    .replace(/USDT$|USD$/i, '') // Then remove USDT/USD suffix
    .toUpperCase();
};

/**
 * Format price with appropriate decimals: 4 for < 1, 2 for >= 1, except PEPEUSDT uses 2 decimals
 */
export const formatPrice = (price: number, ticker?: string): string => {
  if (ticker && ticker.toUpperCase().includes('PEPE')) return price.toFixed(2);
  return price < 1 ? price.toFixed(4) : price.toFixed(2);
};

