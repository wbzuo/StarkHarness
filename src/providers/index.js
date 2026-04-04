export class ProviderRegistry {
  #providers = new Map();

  register(provider) {
    if (!provider?.id) throw new Error('Provider requires id');
    this.#providers.set(provider.id, provider);
    return provider;
  }

  list() {
    return [...this.#providers.values()];
  }
}

export function createProviderBlueprint() {
  return [
    { id: 'anthropic', purpose: 'Claude-class provider adapter' },
    { id: 'openai', purpose: 'Codex/GPT-class provider adapter' },
    { id: 'compatible', purpose: 'OpenAI/Anthropic-compatible gateway adapter' },
  ];
}
