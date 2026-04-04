import { readFile } from 'node:fs/promises';

export async function loadProviderConfig(configPath) {
  if (!configPath) return {};
  const content = await readFile(configPath, 'utf8');
  return JSON.parse(content);
}

export function getProviderConfig(config, providerId) {
  return config?.[providerId] ?? {};
}
