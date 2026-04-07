import test from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi } from '../src/ui/theme.js';
import {
  formatResponseLine, formatToolUse, formatToolResult,
  formatPermissionPrompt, formatWelcome, formatStatusLine,
  formatHelp, formatError, renderMarkdown,
} from '../src/ui/renderer.js';

test('formatResponseLine prefixes with ⎿ indicator', () => {
  const line = formatResponseLine('hello world');
  const plain = stripAnsi(line);
  assert.ok(plain.includes('⎿'));
  assert.ok(plain.includes('hello world'));
});

test('formatToolUse shows tool name and summary', () => {
  const line = formatToolUse('shell', 'ls -la');
  const plain = stripAnsi(line);
  assert.ok(plain.includes('shell'));
  assert.ok(plain.includes('ls -la'));
});

test('formatToolResult shows tick for ok, cross for error', () => {
  const ok = formatToolResult('read', 'ok', '42 lines');
  const fail = formatToolResult('write', 'error', 'ENOENT');
  const plainOk = stripAnsi(ok);
  const plainFail = stripAnsi(fail);
  assert.ok(plainOk.includes('✔'));
  assert.ok(plainFail.includes('✘'));
});

test('formatPermissionPrompt shows structured permission info', () => {
  const prompt = formatPermissionPrompt({
    toolName: 'shell',
    capability: 'execute',
    toolInput: { command: 'rm -rf /tmp/test' },
    gate: { reason: 'policy' },
  });
  const plain = stripAnsi(prompt);
  assert.ok(plain.includes('Permission Required'));
  assert.ok(plain.includes('shell'));
  assert.ok(plain.includes('rm -rf /tmp/test'));
  assert.ok(plain.includes('Allow?'));
});

test('formatPermissionPrompt handles file-based tools', () => {
  const prompt = formatPermissionPrompt({
    toolName: 'write',
    capability: 'filesystem',
    toolInput: { path: '/etc/hosts' },
    gate: { source: 'deny-list' },
  });
  const plain = stripAnsi(prompt);
  assert.ok(plain.includes('write'));
  assert.ok(plain.includes('/etc/hosts'));
});

test('formatWelcome shows banner with session info', () => {
  const banner = formatWelcome({
    version: '11.0',
    session: 'abc123',
    cwd: '/home/user/project',
    model: 'claude-3-opus',
    mode: 'interactive',
  });
  const plain = stripAnsi(banner);
  assert.ok(plain.includes('StarkHarness'));
  assert.ok(plain.includes('v11.0'));
  assert.ok(plain.includes('abc123'));
  assert.ok(plain.includes('interactive'));
  assert.ok(plain.includes('/help'));
});

test('formatStatusLine combines token and cost info', () => {
  const line = formatStatusLine({
    model: 'opus',
    tokens: { input: 1500, output: 800 },
    cost: 0.0234,
  });
  const plain = stripAnsi(line);
  assert.ok(plain.includes('opus'));
  assert.ok(plain.includes('1.5k'));
  assert.ok(plain.includes('0.0234'));
});

test('formatStatusLine handles large token counts', () => {
  const line = formatStatusLine({
    tokens: { input: 2_500_000, output: 150_000 },
  });
  const plain = stripAnsi(line);
  assert.ok(plain.includes('2.5M'));
  assert.ok(plain.includes('150.0k'));
});

test('formatHelp lists commands and shortcuts', () => {
  const help = formatHelp();
  const plain = stripAnsi(help);
  assert.ok(plain.includes('/help'));
  assert.ok(plain.includes('/status'));
  assert.ok(plain.includes('/doctor'));
  assert.ok(plain.includes('Ctrl+C'));
});

test('formatError formats error with cross icon', () => {
  const msg = formatError(new Error('something broke'));
  const plain = stripAnsi(msg);
  assert.ok(plain.includes('✘'));
  assert.ok(plain.includes('Error'));
  assert.ok(plain.includes('something broke'));
});

test('formatError handles string errors', () => {
  const msg = formatError('plain string error');
  const plain = stripAnsi(msg);
  assert.ok(plain.includes('plain string error'));
});

test('renderMarkdown converts bold, italic, code', () => {
  const md = renderMarkdown('**bold** and *italic* and `code`');
  // bold should have ANSI bold
  assert.ok(md.includes('\x1b[1m'));
  // code should have cyan
  assert.ok(md.includes('\x1b[36m'));
});

test('renderMarkdown converts headers', () => {
  const md = renderMarkdown('# Header 1\n## Header 2\n### Header 3');
  // Headers should be bold
  assert.ok(md.includes('\x1b[1m'));
  const plain = stripAnsi(md);
  assert.ok(plain.includes('Header 1'));
  assert.ok(plain.includes('Header 2'));
  assert.ok(plain.includes('Header 3'));
});

test('renderMarkdown converts lists', () => {
  const md = renderMarkdown('- item one\n- item two');
  const plain = stripAnsi(md);
  assert.ok(plain.includes('●'));
  assert.ok(plain.includes('item one'));
});

test('renderMarkdown converts blockquotes', () => {
  const md = renderMarkdown('> quoted text');
  const plain = stripAnsi(md);
  assert.ok(plain.includes('│'));
  assert.ok(plain.includes('quoted text'));
});
