const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;

export function formatMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export function formatTools(schemas) {
  return schemas.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

export function parseContentBlocks(response) {
  const content = response.content ?? [];
  const textBlocks = content.filter((b) => b.type === 'text');
  const toolBlocks = content.filter((b) => b.type === 'tool_use');

  return {
    text: textBlocks.map((b) => b.text).join('\n'),
    toolCalls: toolBlocks.map((b) => ({
      id: b.id,
      name: b.name,
      input: b.input,
    })),
    stopReason: response.stop_reason,
    usage: response.usage ?? {},
    raw: response,
  };
}

export function buildRequestBody({
  model = DEFAULT_MODEL,
  systemPrompt = '',
  messages = [],
  tools = [],
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (tools.length > 0) body.tools = tools;
  return body;
}

export async function callMessagesAPI({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  systemPrompt = '',
  messages = [],
  tools = [],
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const body = buildRequestBody({ model, systemPrompt, messages, tools, maxTokens });

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return parseContentBlocks(data);
}
