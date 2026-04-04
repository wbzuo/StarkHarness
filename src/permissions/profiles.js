import { mergePolicy, DEFAULT_POLICY } from './policy.js';

const PROFILES = {
  permissive: mergePolicy(DEFAULT_POLICY, {
    write: 'allow',
    exec: 'allow',
    network: 'allow',
  }),
  safe: mergePolicy(DEFAULT_POLICY, {}),
  locked: mergePolicy(DEFAULT_POLICY, {
    write: 'deny',
    exec: 'deny',
    network: 'deny',
    delegate: 'deny',
  }),
};

export function getSandboxProfile(name = 'safe') {
  return PROFILES[name] ?? PROFILES.safe;
}

export function listSandboxProfiles() {
  return Object.keys(PROFILES);
}
