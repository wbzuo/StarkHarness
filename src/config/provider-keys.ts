export const PROVIDER_ENV_KEYS = {
  anthropic: { apiKey: 'ANTHROPIC_API_KEY', baseUrl: 'ANTHROPIC_BASE_URL', model: 'ANTHROPIC_MODEL' },
  openai: { apiKey: 'OPENAI_API_KEY', baseUrl: 'OPENAI_BASE_URL', model: 'OPENAI_MODEL' },
  compatible: { apiKey: 'COMPATIBLE_API_KEY', baseUrl: 'COMPATIBLE_BASE_URL', model: 'COMPATIBLE_MODEL' },
};

export function envKeysForProvider(id) {
  const keys = PROVIDER_ENV_KEYS[id];
  if (!keys) throw new Error(`Unsupported provider: ${id}`);
  return keys;
}

export function readProviderEnv(raw, id) {
  const keys = envKeysForProvider(id);
  return {
    apiKey: raw[keys.apiKey] ?? null,
    baseUrl: raw[keys.baseUrl] ?? null,
    model: raw[keys.model] ?? null,
  };
}

export function allProviderIds() {
  return Object.keys(PROVIDER_ENV_KEYS);
}
