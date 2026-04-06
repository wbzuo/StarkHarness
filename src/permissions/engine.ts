import { DEFAULT_POLICY, mergePolicy } from './policy.js';
import path from 'node:path';
import { classifyBashCommand } from '../security/bashClassifier.js';

function resolveToolDecision(toolRule, capability) {
  if (!toolRule) return null;
  if (typeof toolRule === 'string') return toolRule;
  if (typeof toolRule === 'object') return toolRule[capability] ?? null;
  return null;
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern) {
  let regex = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      regex += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      regex += '[^/]*';
      continue;
    }
    if (char === '?') {
      regex += '[^/]';
      continue;
    }
    regex += escapeRegex(char);
  }
  regex += '$';
  return new RegExp(regex);
}

function normalizePath(value) {
  return String(value).split(path.sep).join('/');
}

function collectPaths(toolInput = {}) {
  return [
    toolInput.path,
    toolInput.file,
    ...(Array.isArray(toolInput.files) ? toolInput.files : []),
  ].filter(Boolean).map(normalizePath);
}

function resolvePathDecision(pathRules = [], capability, toolInput = {}, cwd = process.cwd()) {
  const paths = collectPaths(toolInput);
  if (paths.length === 0) return null;

  let matched = null;
  for (const rule of pathRules) {
    if (!rule?.pattern) continue;
    const regex = globToRegExp(normalizePath(rule.pattern));
    const hit = paths.some((candidate) => {
      const relative = normalizePath(path.relative(cwd, candidate));
      return regex.test(relative) || regex.test(candidate);
    });
    if (!hit) continue;
    const decision = rule[capability] ?? rule.decision ?? null;
    if (decision) {
      matched = {
        decision,
        source: 'path-rule',
        rule,
      };
    }
  }
  return matched;
}

function resolveBashRuleDecision(bashRules = [], command = '') {
  let matched = null;
  for (const rule of bashRules) {
    const match = rule?.pattern ?? rule?.match;
    if (!match) continue;
    if (!String(command).includes(String(match))) continue;
    matched = {
      decision: rule.decision ?? 'ask',
      source: 'bash-rule',
      rule,
      reason: rule.reason ?? `matched bash rule: ${match}`,
    };
  }
  return matched;
}

export class PermissionEngine {
  constructor(rules = {}) {
    this.rules = mergePolicy(DEFAULT_POLICY, rules);
  }

  can(capability, toolName) {
    const toolDecision = resolveToolDecision(this.rules.tools?.[toolName], capability);
    return toolDecision ?? this.rules[capability] ?? 'deny';
  }

  evaluate({ capability, toolName, toolInput = {}, cwd = process.cwd() }) {
    const toolDecision = resolveToolDecision(this.rules.tools?.[toolName], capability);
    if (toolDecision) {
      return {
        capability,
        toolName,
        decision: toolDecision,
        source: 'tool',
      };
    }

    const pathDecision = resolvePathDecision(this.rules.pathRules, capability, toolInput, cwd);
    if (pathDecision) {
      return {
        capability,
        toolName,
        decision: pathDecision.decision,
        source: pathDecision.source,
        rule: pathDecision.rule,
      };
    }

    if (toolName === 'shell') {
      const explicitBashRule = resolveBashRuleDecision(this.rules.bashRules, toolInput.command);
      if (explicitBashRule) {
        return {
          capability,
          toolName,
          decision: explicitBashRule.decision,
          source: explicitBashRule.source,
          reason: explicitBashRule.reason,
          rule: explicitBashRule.rule,
        };
      }

      const classification = classifyBashCommand(toolInput.command);
      if (classification.decision !== 'allow') {
        return {
          capability,
          toolName,
          decision: classification.decision,
          source: 'bash-classifier',
          reason: classification.reason,
          severity: classification.severity,
          matchedPattern: classification.matchedPattern,
        };
      }
    }

    return {
      capability,
      toolName,
      decision: this.rules[capability] ?? 'deny',
      source: 'capability',
    };
  }

  snapshot() {
    return mergePolicy(DEFAULT_POLICY, this.rules);
  }
}
