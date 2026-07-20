const MCP_URL = 'http://127.0.0.1:8000/mcp/';
const MCP_PROTOCOL_VERSION = '2025-06-18';

const MCP_HEADERS = {
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
  'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
};

const INITIALIZE_PAYLOAD = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'agent-px',
      version: '0.1.0',
    },
  },
};

export const DEFAULT_SIGNALS_QUERY =
  'Give me the top 10 Base tokens that are actually buyable right now. Hard filter for meaningful real volume, healthy liquidity, low risk, and momentum. Avoid brand-new dead pools, boosted junk, suspicious reports, non-core quote pairs, and anything with risk score above 4. Return a ranked table with logo_url, symbol, address, price, liquidity, 1h volume, 15m volume, volume acceleration, opportunity score, risk score, warnings, and verdict';

const createResearchTokensPayload = (query: string) => ({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'research_tokens',
    arguments: {
      query,
      limit: 50,
      chain: 'base',
    },
  },
});

export const initializeMcpSession = async (signal: AbortSignal) => {
  const response = await fetch(MCP_URL, {
    body: JSON.stringify(INITIALIZE_PAYLOAD),
    headers: MCP_HEADERS,
    method: 'POST',
    signal,
  });
  const body = await response.text();
  const sessionId =
    response.headers.get('mcp-session-id') ??
    response.headers.get('Mcp-Session-Id') ??
    '';

  console.log('----Signals MCP Initialize----', {
    body,
    sessionId,
    status: response.status,
  });

  if (!response.ok) {
    throw new Error(`MCP initialize failed: ${response.status}`);
  }

  if (!sessionId) {
    throw new Error('MCP initialize response did not include mcp-session-id.');
  }

  return sessionId;
};

export const researchTokens = async (
  sessionId: string,
  signal: AbortSignal,
  query = DEFAULT_SIGNALS_QUERY
) => {
  const response = await fetch(MCP_URL, {
    body: JSON.stringify(createResearchTokensPayload(query)),
    headers: {
      ...MCP_HEADERS,
      'Mcp-Session-Id': sessionId,
    },
    method: 'POST',
    signal,
  });
  const body = await response.text();

  console.log('----Signals MCP Research Response----', {
    body,
    query,
    status: response.status,
  });

  if (!response.ok) {
    throw new Error(`MCP research_tokens failed: ${response.status}`);
  }

  return body;
};
