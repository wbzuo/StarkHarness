import { DEFAULT_POLICY } from './policy.js';

export class PermissionEngine {
  constructor(rules = {}) {
    this.rules = { ...DEFAULT_POLICY, ...rules };
  }

  can(capability) {
    return this.rules[capability] ?? 'deny';
  }

  evaluate({ capability }) {
    return {
      capability,
      decision: this.can(capability),
    };
  }

  snapshot() {
    return { ...this.rules };
  }
}
