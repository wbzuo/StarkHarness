// OpenAI-compatible chat completions API client.
// Converts between Anthropic-style messages (used internally by AgentRunner)
// and OpenAI wire format, so the same runner works with DeepSeek, OpenAI, etc.

const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_MAX_TOKENS = 4096;

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
    throw new Error(`OpenAI-compatible API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return parseOpenAIResponse(data);
}
