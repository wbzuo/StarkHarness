import { createStubProvider } from './base.js';
import { callChatCompletionsAPI, streamChatCompletionsAPI, formatToolsOpenAI } from './openai-live.js';

const DEFAULT_BASE_URL = 'https://api.openai.com';
const DEFAULT_MODEL = 'gpt-5';

export function createOpenAIProvider(config = {}) {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const stub = createStubProvider({
      id: 'openai',
      purpose: 'Codex/GPT-class provider adapter (stub — set OPENAI_API_KEY to enable)',
      modelFamily: 'gpt',
    });
    stub.capabilities = ['chat'];
    stub.priority = 100;
    return stub;
  }

  return {
    id: 'openai',
    purpose: 'Codex/GPT-class provider adapter',
    modelFamily: 'gpt',
    capabilities: ['chat', 'tools'],
    aliases: ['openai', 'gpt', 'codex'],
    priority: 2,
    async complete({ systemPrompt, messages, tools, prompt, onTextChunk }) {
      const effectiveMessages = messages ?? (prompt ? [{ role: 'user', content: prompt }] : []);
      const request = {
        apiKey,
        baseUrl: config.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
        model: config.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
        systemPrompt: systemPrompt ?? '',
        messages: effectiveMessages,
        tools: tools ? formatToolsOpenAI(tools) : [],
        maxTokens: config.maxTokens ?? 4096,
      };
      return typeof onTextChunk === 'function'
        ? streamChatCompletionsAPI({ ...request, onTextChunk })
        : callChatCompletionsAPI(request);
    },
  };
}
