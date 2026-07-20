export const shortenAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;

export const formatCompactUsd = (value?: number) => {
  if (value === undefined) return '-';

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: value >= 1 ? 1 : 6,
    notation: value >= 1000 ? 'compact' : 'standard',
    style: 'currency',
  }).format(value);
};

export const formatScore = (value?: number) =>
  value === undefined ? '-' : value.toFixed(value % 1 === 0 ? 0 : 1);

export const getRiskColor = (score?: number) => {
  if (score === undefined) return '#7a7488';
  if (score <= 3) return '#38d996';
  if (score <= 7) return '#f5c84c';
  return '#ff6262';
};

export const getOpportunityColor = (score?: number) => {
  if (score === undefined) return '#7a7488';
  if (score >= 7) return '#38d996';
  if (score >= 4) return '#f5c84c';
  return '#ff6262';
};

