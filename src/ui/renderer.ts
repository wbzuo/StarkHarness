// Terminal message renderer — formats AI responses like claude-code's MessageResponse.
// Uses ⎿ prefix for assistant output, renders markdown-like formatting.

import {
  bold, dim, cyan, green, yellow, red, gray, magenta,
  underline, italic, FIGURES, stripAnsi, dimGray,
  brightCyan, boldCyan, boldGreen, boldYellow, boldRed,
} from './theme.js';

// Response prefix (claude-code style ⎿)
const RESPONSE_PREFIX = `  ${dim(FIGURES.corner)} `;
const TOOL_PREFIX = `  ${dim(FIGURES.corner)} `;

export function formatResponseLine(line) {
  return `${RESPONSE_PREFIX}${line}`;
}

export function formatToolUse(toolName, inputSummary) {
  return `${TOOL_PREFIX}${cyan(toolName)} ${dim(inputSummary)}`;
}

export function formatToolResult(toolName, status, detail = '') {
  const icon = status === 'ok' ? green(FIGURES.tick) : red(FIGURES.cross);
  return `${TOOL_PREFIX}${icon} ${cyan(toolName)}${detail ? ` ${dim(detail)}` : ''}`;
}

export function formatPermissionPrompt({ toolName, capability, toolInput, gate }) {
  const lines = [];
  const title = `${yellow(FIGURES.warning)} ${bold('Permission Required')}`;
  lines.push(title);
  lines.push(`  ${dim('Tool:')}     ${boldCyan(toolName)}`);
  if (capability) lines.push(`  ${dim('Scope:')}    ${capability}`);
  if (gate?.reason ?? gate?.source) {
    lines.push(`  ${dim('Reason:')}   ${gate.reason ?? gate.source}`);
  }

  // Summarize input like claude-code's permission components
  if (toolName === 'shell' || toolName === 'bash') {
    const cmd = toolInput?.command ?? '';
    lines.push(`  ${dim('Command:')}  ${yellow(cmd)}`);
  } else if (toolInput?.path || toolInput?.file || toolInput?.file_path) {
    const p = toolInput.path ?? toolInput.file ?? toolInput.file_path;
    lines.push(`  ${dim('File:')}     ${cyan(p)}`);
  } else if (toolInput) {
    const summary = JSON.stringify(toolInput);
    const truncated = summary.length > 120 ? summary.slice(0, 117) + '...' : summary;
    lines.push(`  ${dim('Input:')}    ${gray(truncated)}`);
  }

  lines.push('');
  lines.push(`  ${dim('Allow?')} ${green('y')}${dim('/')}${red('N')} ${dim('(a=always, s=session)')}`);
  return lines.join('\n');
}

export function formatWelcome({ version = '11.0', session, cwd, model, mode = 'interactive' }) {
  const lines = [];
  lines.push('');
  lines.push(`  ${boldCyan('StarkHarness')} ${dim(`v${version}`)}`);
  lines.push(`  ${dim(FIGURES.line.repeat(40))}`);
  if (session) lines.push(`  ${dim('Session:')}  ${session}`);
  if (cwd) lines.push(`  ${dim('CWD:')}      ${cwd}`);
  if (model) lines.push(`  ${dim('Model:')}    ${model}`);
  lines.push(`  ${dim('Mode:')}     ${mode}`);
  lines.push('');
  lines.push(`  ${dim('Type')} ${cyan('/help')} ${dim('for commands,')} ${cyan('exit')} ${dim('to quit')}`);
  lines.push('');
  return lines.join('\n');
}

export function formatStatusLine({ model, tokens, cost, session, mode, cwd }) {
  const parts = [];
  if (model) parts.push(cyan(model));
  if (mode && mode !== 'interactive') parts.push(yellow(mode));
  if (tokens) {
    const { input: inp, output: out } = tokens;
    parts.push(dim(`${formatTokenCount(inp)}${FIGURES.arrowRight}${formatTokenCount(out)}`));
  }
  if (cost != null) parts.push(dim(`$${cost.toFixed(4)}`));
  if (cwd) parts.push(dimGray(shortenPath(cwd)));
  return parts.join(dim(' | '));
}

function formatTokenCount(n) {
  if (n == null) return '?';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function shortenPath(p) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && p.startsWith(home)) return `~${p.slice(home.length)}`;
  return p;
}

// Basic terminal markdown rendering (like claude-code's Markdown.tsx)
export function renderMarkdown(text) {
  return text
    .replace(/^### (.+)$/gm, (_, t) => bold(t))
    .replace(/^## (.+)$/gm, (_, t) => bold(underline(t)))
    .replace(/^# (.+)$/gm, (_, t) => bold(underline(t)))
    .replace(/\*\*(.+?)\*\*/g, (_, t) => bold(t))
    .replace(/\*(.+?)\*/g, (_, t) => italic(t))
    .replace(/`([^`]+)`/g, (_, t) => cyan(t))
    .replace(/^> (.+)$/gm, (_, t) => `${dim('│')} ${italic(dim(t))}`)
    .replace(/^[-*] (.+)$/gm, (_, t) => `  ${dim(FIGURES.bullet)} ${t}`)
    .replace(/^(\d+)\. (.+)$/gm, (_, n, t) => `  ${dim(n + '.')} ${t}`);
}

export function formatHelp() {
  const lines = [];
  lines.push('');
  lines.push(`  ${boldCyan('Commands')}`);
  lines.push(`  ${dim(FIGURES.line.repeat(40))}`);
  lines.push(`  ${cyan('/help')}          ${dim('Show this help')}`);
  lines.push(`  ${cyan('/status')}        ${dim('Runtime status')}`);
  lines.push(`  ${cyan('/doctor')}        ${dim('Diagnostics')}`);
  lines.push(`  ${cyan('/tools')}         ${dim('List available tools')}`);
  lines.push(`  ${cyan('/agents')}        ${dim('List agents')}`);
  lines.push(`  ${cyan('/sessions')}      ${dim('Session management')}`);
  lines.push(`  ${cyan('/providers')}     ${dim('Provider status')}`);
  lines.push(`  ${cyan('/compact')}       ${dim('Compact context')}`);
  lines.push(`  ${cyan('/cost')}          ${dim('Token usage & cost')}`);
  lines.push(`  ${cyan('/clear')}         ${dim('Clear screen')}`);
  lines.push('');
  lines.push(`  ${boldCyan('Shortcuts')}`);
  lines.push(`  ${dim(FIGURES.line.repeat(40))}`);
  lines.push(`  ${cyan('Ctrl+C')}         ${dim('Interrupt / Cancel')}`);
  lines.push(`  ${cyan('Ctrl+D')}         ${dim('Exit')}`);
  lines.push(`  ${cyan('Up/Down')}        ${dim('History navigation')}`);
  lines.push('');
  return lines.join('\n');
}

export function formatError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return `${red(FIGURES.cross)} ${boldRed('Error:')} ${msg}`;
}

export function formatCommandResult(commandName, result) {
  if (typeof result === 'string') return result;
  if (result?.finalText) return result.finalText;
  return JSON.stringify(result, null, 2);
}
