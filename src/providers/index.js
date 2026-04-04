export class ProviderRegistry {
  #providers = new Map();

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

  list() {
    return [...this.#providers.values()].map(({ id, purpose, modelFamily }) => ({
      id,
      purpose,
      modelFamily,
    }));
  }

  async complete(id, request) {
    const provider = this.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider.complete(request);
  }
}

function createProvider(id, purpose, modelFamily) {
  return {
    id,
    purpose,
    modelFamily,
    async complete(request) {
      return {
        provider: id,
        modelFamily,
        request,
        status: 'stubbed',
        output: `stub:${id}:${request.prompt ?? ''}`,
      };
    },
  };
}

export function createProviderBlueprint() {
  return [
    createProvider('anthropic', 'Claude-class provider adapter', 'claude'),
    createProvider('openai', 'Codex/GPT-class provider adapter', 'gpt'),
    createProvider('compatible', 'OpenAI/Anthropic-compatible gateway adapter', 'compatible'),
  ];
}
