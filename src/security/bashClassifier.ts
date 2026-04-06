import { parseBashCommand } from './bashParser.js';

const DENY_PATTERNS = [
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: 'filesystem formatting command' },
  { pattern: /\bdd\s+if=/i, reason: 'raw block copy command' },
  { pattern: /:\s*\(\)\s*\{/i, reason: 'fork bomb pattern' },
  { pattern: /\b(shutdown|reboot|halt)\b/i, reason: 'system shutdown or reboot command' },
];

const ASK_PATTERNS = [
  { pattern: /\b(npm|pnpm|yarn)\s+publish\b/i, reason: 'publishes a package' },
  { pattern: /\bdocker\s+(rm|rmi|system\s+prune)\b/i, reason: 'destructive docker operation' },
];

const SENSITIVE_PATHS = [
  '/etc/passwd', '/etc/shadow', '/etc/sudoers',
  '~/.ssh', '$HOME/.ssh',
  '~/.aws/credentials', '~/.config/gcloud',
  '/etc/hosts',
];

const SENSITIVE_ENV_VARS = new Set([
  'PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
  'HOME', 'USER', 'SHELL',
]);

function hasSensitivePath(args) {
  return args.some((arg) => SENSITIVE_PATHS.some((sp) => arg.includes(sp)));
}

function classifyByAst(parsed, normalized) {
  for (const cmd of parsed.commands) {
    // rm -rf / (root wipe)
    if (cmd.name === 'rm' && cmd.args.includes('-rf') && cmd.args.includes('/')) {
      return { decision: 'deny', severity: 'high', reason: 'recursive delete of filesystem root', matchedPattern: 'rm -rf /' };
    }
    // chmod -R 777 or chown -R root
    if ((cmd.name === 'chmod' && cmd.args.includes('-R') && cmd.args.includes('777'))
      || (cmd.name === 'chown' && cmd.args.includes('-R') && cmd.args.includes('root'))) {
      return { decision: 'deny', severity: 'high', reason: 'dangerous recursive permission change', matchedPattern: cmd.name };
    }
    // export/unset of sensitive env vars
    if ((cmd.name === 'export' || cmd.name === 'unset') && cmd.args.length > 0) {
      const varName = cmd.args[0].split('=')[0];
      if (SENSITIVE_ENV_VARS.has(varName)) {
        return { decision: 'deny', severity: 'high', reason: `modifying sensitive environment variable ${varName}`, matchedPattern: `${cmd.name} ${varName}` };
      }
    }
    // Write/append redirects to sensitive files (detected via > or >> in args from tokenizer)
    if (cmd.name === 'tee' && hasSensitivePath(cmd.args)) {
      return { decision: 'deny', severity: 'high', reason: 'writing to sensitive system file', matchedPattern: `tee -> ${cmd.args.find((a) => SENSITIVE_PATHS.some((sp) => a.includes(sp)))}` };
    }
    // eval with dynamic content
    if (cmd.name === 'eval') {
      return { decision: 'deny', severity: 'high', reason: 'eval executes arbitrary code', matchedPattern: 'eval' };
    }
  }

  // curl/wget piped to shell
  const hasCurlOrWget = parsed.commands.some((cmd) => ['curl', 'wget'].includes(cmd.name));
  const hasShellAfterPipe = parsed.commands.some((cmd) => ['sh', 'bash', 'zsh', 'eval'].includes(cmd.name));
  if (normalized.includes('|') && hasCurlOrWget && hasShellAfterPipe) {
    return { decision: 'deny', severity: 'high', reason: 'remote script piped directly to shell', matchedPattern: 'curl|wget -> shell' };
  }

  // AST-based ask rules
  for (const cmd of parsed.commands) {
    if (cmd.name === 'git' && cmd.args[0] === 'push') {
      return { decision: 'ask', severity: 'medium', reason: 'git push changes a remote repository', matchedPattern: 'git push' };
    }
    if (cmd.name === 'git' && ['reset', 'clean', 'checkout'].includes(cmd.args[0]) && cmd.args.some((a) => ['--hard', '--force', '-f', '-fd'].includes(a))) {
      return { decision: 'ask', severity: 'medium', reason: 'destructive git operation', matchedPattern: `git ${cmd.args[0]}` };
    }
    if (['scp', 'ssh', 'rsync'].includes(cmd.name)) {
      return { decision: 'ask', severity: 'medium', reason: 'remote shell or file transfer operation', matchedPattern: cmd.name };
    }
    if (cmd.name === 'chmod') {
      return { decision: 'ask', severity: 'medium', reason: 'permission-changing command', matchedPattern: 'chmod' };
    }
    if (['killall', 'pkill', 'kill'].includes(cmd.name)) {
      return { decision: 'ask', severity: 'medium', reason: 'terminates running processes', matchedPattern: cmd.name };
    }
    if (cmd.name === 'rm' && cmd.args.some((a) => a.includes('r')) && cmd.args.some((a) => a.startsWith('/') || a.startsWith('~'))) {
      return { decision: 'ask', severity: 'medium', reason: 'recursive delete of absolute path', matchedPattern: `rm -r absolute` };
    }
    // Read of sensitive files
    if (['cat', 'head', 'tail', 'less', 'more'].includes(cmd.name) && hasSensitivePath(cmd.args)) {
      return { decision: 'ask', severity: 'medium', reason: 'reading sensitive system file', matchedPattern: `${cmd.name} sensitive-path` };
    }
  }

  // Background process detection — informational ask
  if (normalized.includes('&') && !normalized.includes('&&')) {
    const bgCandidate = parsed.tokens.some((t) => t.type === 'word' && t.value === '&');
    if (bgCandidate || /[^&]&\s*$/.test(normalized)) {
      return { decision: 'ask', severity: 'low', reason: 'runs process in background', matchedPattern: '&' };
    }
  }

  return null;
}

export function classifyBashCommand(command = '') {
  const normalized = String(command).trim();
  if (!normalized) {
    return { decision: 'allow', severity: 'low', reason: 'empty command', matchedPattern: null };
  }
  const parsed = parseBashCommand(normalized);

  // AST-based classification (primary)
  const astResult = classifyByAst(parsed, normalized);
  if (astResult) {
    return { ...astResult, parsed };
  }

  // Regex fallback for patterns hard to express via AST
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
