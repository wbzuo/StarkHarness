import { createAnthropicProvider } from './anthropic.js';
import { createOpenAIProvider } from './openai.js';
import { createCompatibleProvider } from './compatible.js';
import { ModelStrategy, withRetry } from './strategy.js';

export class ProviderRegistry {
  #providers = new Map();

  constructor(config = {}) {
    this.config = config;
  }

  register(provider) {
    if (!provider?.id) throw new Error('Provider requires id');
    if (typeof provider.complete !== 'function') {
      throw new Error(`Provider ${provider.id} must implement complete()`);
    }
    this.#providers.set(provider.id, provider);
    return provider;
  }

  get(id) {
    return this.#providers.get(id);
  }

  clear() {
    this.#providers.clear();
  }

  list() {
    return [...this.#providers.values()].map(({ id, purpose, modelFamily, capabilities }) => ({
      id,
      purpose,
      modelFamily,
      capabilities: capabilities ?? ['chat'],
    }));
  }

  listDetailed() {
    return [...this.#providers.values()].map((provider) => ({ ...provider }));
  }

  async complete(id, request) {
    const provider = this.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider.complete({ ...request, config: this.config[id] ?? {} });
  }

  describeConfig() {
    return Object.fromEntries(
      Object.entries(this.config).map(([id, value]) => [id, Object.keys(value)]),
    );
  }

  async completeWithStrategy({ capability = 'chat', prefer, request, retryOptions } = {}) {
    const strategy = new ModelStrategy({
      providers: this.listDetailed().map((p) => ({
        id: p.id,
        capabilities: p.capabilities ?? ['chat'],
        priority: p.priority,
      })),
    });
    const providerId = strategy.select({ require: capability, prefer });
    if (!providerId) throw new Error(`No provider available for capability: ${capability}`);
    return withRetry(
      () => this.complete(providerId, request),
      retryOptions,
    );
  }
}

export function createProviderBlueprint(config = {}) {
  return [
    createAnthropicProvider(config.anthropic ?? {}),
    createOpenAIProvider(config.openai ?? {}),
    createCompatibleProvider(config.compatible ?? {}),
  ];
}
