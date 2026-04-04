import { createStubProvider } from './base.js';

export function createCompatibleProvider() {
  return createStubProvider({
    id: 'compatible',
    purpose: 'OpenAI/Anthropic-compatible gateway adapter',
    modelFamily: 'compatible',
  });
}
