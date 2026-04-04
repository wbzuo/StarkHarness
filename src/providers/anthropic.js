import { createStubProvider } from './base.js';
import { callMessagesAPI, formatTools, formatMessages } from './anthropic-live.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export function createAnthropicProvider(config = {}) {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;

  // Fall back to stub if no API key
  if (!apiKey) {
    const stub = createStubProvider({
      id: 'anthropic',
      purpose: 'Claude-class provider adapter (stub — set ANTHROPIC_API_KEY to enable)',
      modelFamily: 'claude',
    });
    stub.capabilities = ['chat'];
    stub.priority = 100;
    return stub;
  }

  return {
    id: 'anthropic',
    purpose: 'Claude-class provider adapter',
    modelFamily: 'claude',
    capabilities: ['chat', 'tools', 'vision'],
    priority: 1,
    async complete({ systemPrompt, messages, tools, prompt, ...rest }) {
      // Support both old (prompt-based) and new (messages-based) calling conventions
      const effectiveMessages = messages ?? (prompt ? [{ role: 'user', content: prompt }] : []);
      const formattedTools = tools ? formatTools(tools) : [];
      const result = await callMessagesAPI({
        apiKey,
        baseUrl: config.baseUrl,
        model: config.model ?? DEFAULT_MODEL,
        systemPrompt: systemPrompt ?? '',
        messages: formatMessages(effectiveMessages),
        tools: formattedTools,
        maxTokens: config.maxTokens ?? 8192,
      });
      return result;
    },
  };
}
