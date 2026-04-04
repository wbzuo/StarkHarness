import { createStubProvider } from './base.js';

export function createOpenAIProvider() {
  return createStubProvider({
    id: 'openai',
    purpose: 'Codex/GPT-class provider adapter',
    modelFamily: 'gpt',
  });
}
