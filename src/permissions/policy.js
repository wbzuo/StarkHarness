import { readFile } from 'node:fs/promises';

export const DEFAULT_POLICY = Object.freeze({
  read: 'allow',
  write: 'ask',
  exec: 'ask',
  network: 'ask',
  delegate: 'allow',
});

export async function loadPolicyFile(policyPath) {
  if (!policyPath) return { ...DEFAULT_POLICY };
  const content = await readFile(policyPath, 'utf8');
  const parsed = JSON.parse(content);
  return { ...DEFAULT_POLICY, ...parsed };
}
