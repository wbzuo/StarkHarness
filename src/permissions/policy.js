import { readFile } from 'node:fs/promises';

export const DEFAULT_POLICY = Object.freeze({
  read: 'allow',
  write: 'ask',
  exec: 'ask',
  network: 'ask',
  delegate: 'allow',
  tools: {},
});

export function mergePolicy(base, override = {}) {
  return {
    ...base,
    ...override,
    tools: {
      ...(base.tools ?? {}),
      ...(override.tools ?? {}),
    },
  };
}

export async function loadPolicyFile(policyPath) {
  if (!policyPath) return mergePolicy(DEFAULT_POLICY);
  const content = await readFile(policyPath, 'utf8');
  const parsed = JSON.parse(content);
  return mergePolicy(DEFAULT_POLICY, parsed);
}
