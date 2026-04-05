import { readFile } from 'node:fs/promises';

export async function loadProviderConfig(configPath) {
  if (!configPath) return {};
  const content = await readFile(configPath, 'utf8');
  return JSON.parse(content);
}

export function getProviderConfig(config, providerId) {
  return config?.[providerId] ?? {};
}

export function mergeProviderConfig(base = {}, override = {}) {
  const providers = new Set([...Object.keys(base), ...Object.keys(override)]);
  return Object.fromEntries(
    [...providers].map((providerId) => [
      providerId,
      {
        ...(base?.[providerId] ?? {}),
        ...(override?.[providerId] ?? {}),
      },
    ]),
  );
}
