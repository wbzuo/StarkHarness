import { parseBashCommand } from './bashParser.js';

const DENY_PATTERNS = [
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: 'filesystem formatting command' },
  { pattern: /\bdd\s+if=/i, reason: 'raw block copy command' },
  { pattern: /:\s*\(\)\s*\{/i, reason: 'fork bomb pattern' },
  { pattern: /\b(shutdown|reboot|halt)\b/i, reason: 'system shutdown or reboot command' },
];

const ASK_PATTERNS = [
  { pattern: /\bgit\s+push\b/i, reason: 'git push changes a remote repository' },
  { pattern: /\b(npm|pnpm|yarn)\s+publish\b/i, reason: 'publishes a package' },
  { pattern: /\bdocker\s+(rm|rmi|system\s+prune)\b/i, reason: 'destructive docker operation' },
  { pattern: /\b(killall|pkill)\b/i, reason: 'terminates running processes' },
  { pattern: /\b(scp|ssh)\b/i, reason: 'remote shell or file transfer operation' },
  { pattern: /\bchmod\b/i, reason: 'permission-changing command' },
];

export function classifyBashCommand(command = '') {
  const normalized = String(command).trim();
  if (!normalized) {
    return { decision: 'allow', severity: 'low', reason: 'empty command', matchedPattern: null };
  }
  const parsed = parseBashCommand(normalized);

  for (const cmd of parsed.commands) {
    if (cmd.name === 'rm' && cmd.args.includes('-rf') && cmd.args.includes('/')) {
      return {
        decision: 'deny',
        severity: 'high',
        reason: 'recursive delete of filesystem root',
        matchedPattern: 'rm -rf /',
        parsed,
      };
    }
    if ((cmd.name === 'chmod' && cmd.args.includes('-R') && cmd.args.includes('777'))
      || (cmd.name === 'chown' && cmd.args.includes('-R') && cmd.args.includes('root'))) {
      return {
        decision: 'deny',
        severity: 'high',
        reason: 'dangerous recursive permission change',
        matchedPattern: cmd.name,
        parsed,
      };
    }
  }

  const hasCurlOrWget = parsed.commands.some((cmd) => ['curl', 'wget'].includes(cmd.name));
  const hasShellAfterPipe = parsed.commands.some((cmd) => ['sh', 'bash', 'zsh'].includes(cmd.name));
  if (normalized.includes('|') && hasCurlOrWget && hasShellAfterPipe) {
    return {
      decision: 'deny',
      severity: 'high',
      reason: 'remote script piped directly to shell',
      matchedPattern: 'curl|wget -> shell',
      parsed,
    };
  }

  for (const entry of DENY_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return {
        decision: 'deny',
        severity: 'high',
        reason: entry.reason,
        matchedPattern: entry.pattern.source,
        parsed,
      };
    }
  }

  for (const cmd of parsed.commands) {
    if (cmd.name === 'git' && cmd.args[0] === 'push') {
      return {
        decision: 'ask',
        severity: 'medium',
        reason: 'git push changes a remote repository',
        matchedPattern: 'git push',
        parsed,
      };
    }
    if (['scp', 'ssh'].includes(cmd.name)) {
      return {
        decision: 'ask',
        severity: 'medium',
        reason: 'remote shell or file transfer operation',
        matchedPattern: cmd.name,
        parsed,
      };
    }
    if (cmd.name === 'chmod') {
      return {
        decision: 'ask',
        severity: 'medium',
        reason: 'permission-changing command',
        matchedPattern: 'chmod',
        parsed,
      };
    }
  }

  for (const entry of ASK_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return {
        decision: 'ask',
        severity: 'medium',
        reason: entry.reason,
        matchedPattern: entry.pattern.source,
        parsed,
      };
    }
  }

  return {
    decision: 'allow',
    severity: 'low',
    reason: 'command not classified as dangerous',
    matchedPattern: null,
    parsed,
  };
}
