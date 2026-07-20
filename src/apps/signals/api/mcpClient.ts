const SIGNALS_AGENT_BASE_URL = 'https://agent.pillarx.app';
const MCP_URL = `${SIGNALS_AGENT_BASE_URL}/mcp/`;
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
  'Show safer momentum Base tokens with low risk, decent liquidity, and positive buyer activity.';

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
