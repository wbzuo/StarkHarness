import { readFile } from 'node:fs/promises';

export const DEFAULT_POLICY = Object.freeze({
  read: 'allow',
  write: 'ask',
  exec: 'ask',
  network: 'ask',
  delegate: 'allow',
  tools: {},
  bashRules: [],
  pathRules: [],
});

export function mergePolicy(base, override = {}) {
  return {
    ...base,
    ...override,
    tools: {
      ...(base.tools ?? {}),
      ...(override.tools ?? {}),
    },
    bashRules: [
      ...(base.bashRules ?? []),
      ...(override.bashRules ?? []),
    ],
    pathRules: [
      ...(base.pathRules ?? []),
      ...(override.pathRules ?? []),
    ],
  };
}

export async function loadPolicyFile(policyPath, { includeDefaults = true } = {}) {
  if (!policyPath) return includeDefaults ? mergePolicy(DEFAULT_POLICY) : {};
  const content = await readFile(policyPath, 'utf8');
  const parsed = JSON.parse(content);
  return includeDefaults ? mergePolicy(DEFAULT_POLICY, parsed) : parsed;
}
