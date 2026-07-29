import type { TokenInsight } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getByPath = (value: unknown, path: string) =>
  path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);

const getFirstValue = (value: unknown, paths: string[]) => {
  for (const path of paths) {
    const fieldValue = getByPath(value, path);
    if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
      return fieldValue;
    }
  }

  return undefined;
};

const getString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const getNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,%_,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const formatAgeFromMinutes = (minutes?: number) => {
  if (minutes === undefined || minutes < 0) return '';

  const wholeMinutes = Math.floor(minutes);
  const minutesInDay = 24 * 60;
  const days = Math.floor(wholeMinutes / minutesInDay);

  if (days > 365) return `${Math.floor(days / 365)}y`;
  if (wholeMinutes > minutesInDay) return `${days}d`;
  if (wholeMinutes > 60) return `${Math.floor(wholeMinutes / 60)}h`;

  return `${wholeMinutes}m`;
};

const parseJsonLikeText = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const fenced = fencedJson ?? trimmed.match(/```\s*([\s\S]*?)```/);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());

    const firstObject = trimmed.indexOf('{');
    const lastObject = trimmed.lastIndexOf('}');
    if (firstObject !== -1 && lastObject > firstObject) {
      return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
    }

    const firstArray = trimmed.indexOf('[');
    const lastArray = trimmed.lastIndexOf(']');
    if (firstArray !== -1 && lastArray > firstArray) {
      return JSON.parse(trimmed.slice(firstArray, lastArray + 1));
    }

    return undefined;
  }
};

const parseMcpBody = (body: string): unknown[] => {
  const trimmed = body.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('data:') || trimmed.includes('\ndata:')) {
    return trimmed
      .split(/\n\n+/)
      .map((block) =>
        block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''))
          .join('\n')
          .trim()
      )
      .filter((data) => data && data !== '[DONE]')
      .map((data) => {
        try {
          return parseJsonLikeText(data) ?? data;
        } catch {
          return data;
        }
      });
  }

  try {
    return [parseJsonLikeText(trimmed) ?? trimmed];
  } catch {
    return [trimmed];
  }
};

const collectTextFields = (value: unknown, texts: string[] = []): string[] => {
  if (typeof value === 'string') {
    texts.push(value);
    return texts;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextFields(item, texts));
    return texts;
  }

  if (isRecord(value)) {
    Object.values(value).forEach((item) => collectTextFields(item, texts));
  }

  return texts;
};

const isTokenLikeRecord = (value: unknown) =>
  isRecord(value) &&
  Boolean(
    getFirstValue(value, [
      'address',
      'baseToken.address',
      'contract_address',
      'contractAddress',
      'pairAddress',
      'token_address',
    ]) ||
      getFirstValue(value, [
        'baseToken.symbol',
        'symbol',
        'ticker',
        'token_symbol',
      ])
  );

const findTokenArray = (value: unknown, depth = 0): unknown[] | undefined => {
  if (depth > 10) return undefined;

  if (typeof value === 'string') {
    try {
      return findTokenArray(parseJsonLikeText(value), depth + 1);
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(value)) {
    if (value.some(isTokenLikeRecord)) return value;

    for (const item of value) {
      const tokens = findTokenArray(item, depth + 1);
      if (tokens) return tokens;
    }
  }

  if (isRecord(value)) {
    for (const key of ['tokens', 'results', 'data', 'items']) {
      const candidate = value[key];
      if (Array.isArray(candidate) && candidate.some(isTokenLikeRecord)) {
        return candidate;
      }
    }

    for (const text of collectTextFields(value)) {
      if (!text.includes('{') && !text.includes('[')) continue;

      try {
        const tokens = findTokenArray(parseJsonLikeText(text), depth + 1);
        if (tokens) return tokens;
      } catch {
        // Keep searching other fields; MCP tools often include human text too.
      }
    }

    for (const item of Object.values(value)) {
      const tokens = findTokenArray(item, depth + 1);
      if (tokens) return tokens;
    }
  }

  return undefined;
};

const normalizeToken = (
  token: unknown,
  index: number
): TokenInsight | undefined => {
  if (!isRecord(token)) return undefined;

  const address = getString(
    getFirstValue(token, [
      'address',
      'baseToken.address',
      'contract_address',
      'contractAddress',
      'pairAddress',
      'token_address',
    ])
  );
  const symbol = getString(
    getFirstValue(token, [
      'baseToken.symbol',
      'symbol',
      'ticker',
      'token_symbol',
    ])
  );
  const name = getString(
    getFirstValue(token, ['baseToken.name', 'name', 'token_name', 'tokenName'])
  );

  if (!address && !symbol && !name) return undefined;

  const ageMinutes = getNumber(
    getFirstValue(token, ['age_minutes', 'ageMinutes'])
  );

  return {
    address,
    age:
      formatAgeFromMinutes(ageMinutes) ||
      getString(
        getFirstValue(token, [
          'age',
          'age_human',
          'ageHuman',
          'created_at',
          'pair_age',
          'token_age',
        ])
      ),
    chain:
      getString(getFirstValue(token, ['chain', 'chainId', 'network'])) ||
      'base',
    confidenceScore: getNumber(
      getFirstValue(token, [
        'confidence_score',
        'confidenceScore',
        'confidence',
      ])
    ),
    imageUrl: getString(
      getFirstValue(token, [
        'logo_url',
        'image_url',
        'imageUrl',
        'image',
        'logo',
        'logoURI',
        'tokenImage',
      ])
    ),
    liquidity: getNumber(
      getFirstValue(token, [
        'liquidity.usd',
        'liquidity_usd',
        'liquidityUsd',
        'liquidityUSD',
        'liquidity',
      ])
    ),
    name,
    opportunityScore: getNumber(
      getFirstValue(token, ['opportunity_score', 'opportunityScore', 'score'])
    ),
    price: getNumber(
      getFirstValue(token, ['price_usd', 'priceUsd', 'price', 'current_price'])
    ),
    rank: getNumber(getFirstValue(token, ['rank', 'position'])) ?? index + 1,
    riskScore: getNumber(
      getFirstValue(token, ['risk_score', 'riskScore', 'risk'])
    ),
    symbol,
    volume1hUsd: getNumber(
      getFirstValue(token, [
        'volume.h1',
        'volume_1h_usd',
        'volume1hUsd',
        'volume1hUSD',
        'volume_1h',
      ])
    ),
  };
};

export const parseTokensFromMcpResponse = (body: string) => {
  const messages = parseMcpBody(body);
  const tokenArray = findTokenArray(messages) ?? [];

  return tokenArray
    .map(normalizeToken)
    .filter((token): token is TokenInsight => Boolean(token));
};
