const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;

function createStreamAccumulator() {
  return {
    text: '',
    toolCalls: [],
    stopReason: 'end_turn',
    usage: {},
    raw: [],
  };
}

function ensureToolCall(toolCalls, index, seed = {}) {
  if (!toolCalls[index]) {
    toolCalls[index] = {
      id: seed.id ?? `tool-${index}`,
      name: seed.name ?? 'unknown',
      input: seed.input ?? {},
      partialJson: '',
    };
  }
  return toolCalls[index];
}

function finalizeToolCalls(toolCalls) {
  return toolCalls
    .filter(Boolean)
    .map((toolCall) => {
      let parsedInput = toolCall.input ?? {};
      if (toolCall.partialJson) {
        try {
          parsedInput = JSON.parse(toolCall.partialJson);
        } catch {
          parsedInput = toolCall.input ?? {};
        }
      }
      return {
        id: toolCall.id,
        name: toolCall.name,
        input: parsedInput,
      };
    });
}

export function applyAnthropicStreamEvent(accumulator, payload) {
  accumulator.raw.push(payload);
  switch (payload.type) {
    case 'message_start':
      accumulator.usage = payload.message?.usage ?? accumulator.usage;
      break;
    case 'content_block_start':
      if (payload.content_block?.type === 'tool_use') {
        ensureToolCall(accumulator.toolCalls, payload.index ?? accumulator.toolCalls.length, {
          id: payload.content_block.id,
          name: payload.content_block.name,
          input: payload.content_block.input ?? {},
        });
      }
      break;
    case 'content_block_delta':
      if (payload.delta?.type === 'text_delta') {
        accumulator.text += payload.delta.text ?? '';
      }
      if (payload.delta?.type === 'input_json_delta') {
        const toolCall = ensureToolCall(accumulator.toolCalls, payload.index ?? 0);
        toolCall.partialJson = `${toolCall.partialJson ?? ''}${payload.delta.partial_json ?? ''}`;
      }
      break;
    case 'message_delta':
      if (payload.delta?.stop_reason) accumulator.stopReason = payload.delta.stop_reason;
      accumulator.usage = { ...accumulator.usage, ...(payload.usage ?? {}) };
      break;
    default:
      break;
  }
  return accumulator;
}

async function consumeSseResponse(response, onEvent) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const dataLines = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);
      for (const dataLine of dataLines) {
        if (dataLine === '[DONE]') continue;
        await onEvent(JSON.parse(dataLine));
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const dataLines = tail
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (const dataLine of dataLines) {
      if (dataLine === '[DONE]') continue;
      await onEvent(JSON.parse(dataLine));
    }
  }
}

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
    const error = new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return parseContentBlocks(data);
}

export async function streamMessagesAPI({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  systemPrompt = '',
  messages = [],
  tools = [],
  maxTokens = DEFAULT_MAX_TOKENS,
  onTextChunk,
} = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const body = {
    ...buildRequestBody({ model, systemPrompt, messages, tools, maxTokens }),
    stream: true,
  };

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
    const error = new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    error.status = response.status;
    throw error;
  }

  const accumulator = createStreamAccumulator();
  await consumeSseResponse(response, async (payload) => {
    const previousLength = accumulator.text.length;
    applyAnthropicStreamEvent(accumulator, payload);
    if (typeof onTextChunk === 'function' && accumulator.text.length > previousLength) {
      await onTextChunk(accumulator.text.slice(previousLength));
    }
  });

  return {
    text: accumulator.text,
    toolCalls: finalizeToolCalls(accumulator.toolCalls),
    stopReason: accumulator.stopReason,
    usage: accumulator.usage,
    raw: accumulator.raw,
    streamed: true,
  };
}
