// OpenAI-compatible chat completions API client.
// Converts between Anthropic-style messages (used internally by AgentRunner)
// and OpenAI wire format, so the same runner works with DeepSeek, OpenAI, etc.

const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_MAX_TOKENS = 4096;

function ensureStreamToolCall(toolCalls, index) {
  if (!toolCalls[index]) {
    toolCalls[index] = {
      id: `tool-${index}`,
      name: 'unknown',
      arguments: '',
    };
  }
  return toolCalls[index];
}

function finalizeStreamToolCalls(toolCalls) {
  return toolCalls
    .filter(Boolean)
    .map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      input: (() => {
        try {
          return JSON.parse(toolCall.arguments || '{}');
        } catch {
          return {};
        }
      })(),
    }));
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

// Anthropic tool schema → OpenAI function tool
export function formatToolsOpenAI(schemas = []) {
  return schemas.map(({ name, description, input_schema }) => ({
    type: 'function',
    function: {
      name,
      description: description ?? '',
      parameters: input_schema ?? { type: 'object', properties: {} },
    },
  }));
}

// Convert Anthropic-style message array → OpenAI message array.
// AgentRunner pushes:
//   assistant: { role:'assistant', content: string | [{type:'text',...},{type:'tool_use',...}] }
//   user (tool results): { role:'user', content: [{type:'tool_result', tool_use_id, content}] }
export function convertMessagesToOpenAI(messages) {
  const result = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = msg.content;
      // Array of tool_result blocks
      if (Array.isArray(content) && content.length > 0 && content[0].type === 'tool_result') {
        for (const block of content) {
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          });
        }
      } else {
        result.push({ role: 'user', content: typeof content === 'string' ? content : JSON.stringify(content) });
      }
    } else if (msg.role === 'assistant') {
      const content = msg.content;
      if (typeof content === 'string') {
        result.push({ role: 'assistant', content });
      } else if (Array.isArray(content)) {
        const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || null;
        const toolCalls = content.filter((b) => b.type === 'tool_use').map((b) => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
        const msg = { role: 'assistant', content: text };
        if (toolCalls.length > 0) msg.tool_calls = toolCalls;
        result.push(msg);
      }
    } else {
      result.push(msg);
    }
  }
  return result;
}

// OpenAI response → standard { text, toolCalls, stopReason, usage }
export function parseOpenAIResponse(data) {
  const choice = data.choices?.[0];
  const message = choice?.message ?? {};
  const text = message.content ?? '';
  const toolCalls = (message.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
  }));
  return {
    text,
    toolCalls,
    stopReason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : (choice?.finish_reason ?? 'end_turn'),
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
    raw: data,
  };
}

export async function callChatCompletionsAPI({
  apiKey,
  baseUrl,
  model = DEFAULT_MODEL,
  systemPrompt = '',
  messages = [],
  tools = [],
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  if (!apiKey) throw new Error('API key is required for compatible provider');

  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const openAIMessages = [];
  if (systemPrompt) openAIMessages.push({ role: 'system', content: systemPrompt });
  openAIMessages.push(...convertMessagesToOpenAI(messages));

  const body = {
    model,
    max_tokens: maxTokens,
    messages: openAIMessages,
  };
  if (tools.length > 0) body.tools = tools;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const error = new Error(`OpenAI-compatible API error ${response.status}: ${errorBody}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return parseOpenAIResponse(data);
}

export async function streamChatCompletionsAPI({
  apiKey,
  baseUrl,
  model = DEFAULT_MODEL,
  systemPrompt = '',
  messages = [],
  tools = [],
  maxTokens = DEFAULT_MAX_TOKENS,
  onTextChunk,
} = {}) {
  if (!apiKey) throw new Error('API key is required for compatible provider');

  const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const openAIMessages = [];
  if (systemPrompt) openAIMessages.push({ role: 'system', content: systemPrompt });
  openAIMessages.push(...convertMessagesToOpenAI(messages));

  const body = {
    model,
    max_tokens: maxTokens,
    messages: openAIMessages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools.length > 0) body.tools = tools;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const error = new Error(`OpenAI-compatible API error ${response.status}: ${errorBody}`);
    error.status = response.status;
    throw error;
  }

  const result = {
    text: '',
    toolCalls: [],
    stopReason: 'end_turn',
    usage: {},
    raw: [],
    streamed: true,
  };

  await consumeSseResponse(response, async (payload) => {
    result.raw.push(payload);
    const choice = payload.choices?.[0];
    const delta = choice?.delta ?? {};
    if (delta.content) {
      result.text += delta.content;
      if (typeof onTextChunk === 'function') await onTextChunk(delta.content);
    }
    for (const toolDelta of delta.tool_calls ?? []) {
      const toolCall = ensureStreamToolCall(result.toolCalls, toolDelta.index ?? 0);
      if (toolDelta.id) toolCall.id = toolDelta.id;
      if (toolDelta.function?.name) toolCall.name = toolDelta.function.name;
      if (toolDelta.function?.arguments) toolCall.arguments += toolDelta.function.arguments;
    }
    if (choice?.finish_reason === 'tool_calls') result.stopReason = 'tool_use';
    else if (choice?.finish_reason) result.stopReason = choice.finish_reason;
    if (payload.usage) {
      result.usage = {
        input_tokens: payload.usage.prompt_tokens ?? result.usage.input_tokens ?? 0,
        output_tokens: payload.usage.completion_tokens ?? result.usage.output_tokens ?? 0,
      };
    }
  });

  return {
    ...result,
    toolCalls: finalizeStreamToolCalls(result.toolCalls),
  };
}
