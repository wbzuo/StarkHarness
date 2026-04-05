import { DEFAULT_POLICY, mergePolicy } from './policy.js';

function resolveToolDecision(toolRule, capability) {
  if (!toolRule) return null;
  if (typeof toolRule === 'string') return toolRule;
  if (typeof toolRule === 'object') return toolRule[capability] ?? null;
  return null;
}

export class PermissionEngine {
  constructor(rules = {}) {
    this.rules = mergePolicy(DEFAULT_POLICY, rules);
  }

  can(capability, toolName) {
    const toolDecision = resolveToolDecision(this.rules.tools?.[toolName], capability);
    return toolDecision ?? this.rules[capability] ?? 'deny';
  }

  evaluate({ capability, toolName }) {
    const toolDecision = resolveToolDecision(this.rules.tools?.[toolName], capability);
    return {
      capability,
      toolName,
      decision: toolDecision ?? this.rules[capability] ?? 'deny',
      source: toolDecision ? 'tool' : 'capability',
    };
  }

  snapshot() {
    return mergePolicy(DEFAULT_POLICY, this.rules);
  }
}
