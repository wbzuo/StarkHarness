const DENY_PATTERNS = [
  { pattern: /rm\s+-rf\s+\/(\s|$)/i, reason: 'recursive delete of filesystem root' },
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: 'filesystem formatting command' },
  { pattern: /\bdd\s+if=/i, reason: 'raw block copy command' },
  { pattern: /:\s*\(\)\s*\{/i, reason: 'fork bomb pattern' },
  { pattern: /\b(shutdown|reboot|halt)\b/i, reason: 'system shutdown or reboot command' },
  { pattern: /\b(chmod\s+-R\s+777|chown\s+-R\s+root)\b/i, reason: 'dangerous recursive permission change' },
  { pattern: /\b(curl|wget)[^|]*(\|\s*(sh|bash|zsh))\b/i, reason: 'remote script piped directly to shell' },
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

  for (const entry of DENY_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return {
        decision: 'deny',
        severity: 'high',
        reason: entry.reason,
        matchedPattern: entry.pattern.source,
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
      };
    }
  }

  return {
    decision: 'allow',
    severity: 'low',
    reason: 'command not classified as dangerous',
    matchedPattern: null,
  };
}
