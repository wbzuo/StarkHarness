// src/kernel/hooks.js
const HOOK_EVENTS = new Set([
  'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
  'UserPromptSubmit', 'SessionStart', 'SessionEnd',
  'PreCompact', 'Notification',
]);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesTool(matcher, toolName) {
  if (!matcher || matcher === '*') return true;
  if (matcher.includes('|')) return matcher.split('|').some((m) => matchesTool(m.trim(), toolName));
  if (matcher.includes('.*')) {
    const pattern = matcher.split('.*').map(escapeRegex).join('.*');
    return new RegExp(`^${pattern}$`).test(toolName);
  }
  return matcher === toolName;
}

export class HookDispatcher {
  #hooks = new Map();

  constructor() {
    for (const event of HOOK_EVENTS) {
      this.#hooks.set(event, []);
    }
  }

  register(eventName, hook) {
    this.#assertValidEvent(eventName);
    this.#hooks.get(eventName).push(hook);
  }

  #assertValidEvent(eventName) {
    if (!HOOK_EVENTS.has(eventName)) throw new Error(`Unknown hook event: ${eventName}`);
  }

  async fire(eventName, context) {
    this.#assertValidEvent(eventName);
    const hooks = this.#hooks.get(eventName) ?? [];
    const applicable = hooks.filter((hook) => {
      if (!hook.matcher) return true;
      return matchesTool(hook.matcher, context.toolName);
    });

    if (applicable.length === 0) return { decision: 'allow' };

    const results = await Promise.all(applicable.map((hook) => hook.handler(context)));

    // Any deny/block result wins over allow
    const deny = results.find((r) => r.decision === 'deny' || r.decision === 'block');
    if (deny) return deny;

    // Merge all results
    return results.reduce((merged, r) => ({ ...merged, ...r }), { decision: 'allow' });
  }

  listEvents() {
    return [...HOOK_EVENTS];
  }

  snapshot() {
    const result = {};
    for (const [event, hooks] of this.#hooks) {
      if (hooks.length > 0) result[event] = hooks.length;
    }
    return result;
  }
}
