import { createStubProvider } from './base.js';

export function createAnthropicProvider() {
  return createStubProvider({
    id: 'anthropic',
    purpose: 'Claude-class provider adapter',
    modelFamily: 'claude',
  });
}
