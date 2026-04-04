const DEFAULT_RULES = {
  read: 'allow',
  write: 'ask',
  exec: 'ask',
  network: 'ask',
  delegate: 'allow',
};

export class PermissionEngine {
  constructor(rules = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
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
}
