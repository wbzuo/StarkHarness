import { createStubProvider } from './base.js';
import { callChatCompletionsAPI, streamChatCompletionsAPI, formatToolsOpenAI } from './openai-live.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

export function createCompatibleProvider(config = {}) {
  const apiKey = config.apiKey ?? process.env.COMPATIBLE_API_KEY;

  if (!apiKey) {
    const stub = createStubProvider({
      id: 'compatible',
      purpose: 'OpenAI/Anthropic-compatible gateway adapter (stub — set COMPATIBLE_API_KEY to enable)',
      modelFamily: 'compatible',
    });
    stub.capabilities = ['chat'];
    stub.priority = 100;
    return stub;
  }

  return {
    id: 'compatible',
    purpose: 'OpenAI/Anthropic-compatible gateway adapter',
    modelFamily: 'compatible',
    capabilities: ['chat', 'tools'],
    aliases: ['compatible', 'deepseek'],
    priority: 1,
    async complete({ systemPrompt, messages, tools, prompt, onTextChunk }) {
      const effectiveMessages = messages ?? (prompt ? [{ role: 'user', content: prompt }] : []);
      const formattedTools = tools ? formatToolsOpenAI(tools) : [];
      const request = {
        apiKey,
        baseUrl: config.baseUrl ?? process.env.COMPATIBLE_BASE_URL ?? DEFAULT_BASE_URL,
        model: config.model ?? process.env.COMPATIBLE_MODEL ?? DEFAULT_MODEL,
        systemPrompt: systemPrompt ?? '',
        messages: effectiveMessages,
        tools: formattedTools,
        maxTokens: config.maxTokens ?? 4096,
      };
      return typeof onTextChunk === 'function'
        ? streamChatCompletionsAPI({ ...request, onTextChunk })
        : callChatCompletionsAPI(request);
    },
  };
}
