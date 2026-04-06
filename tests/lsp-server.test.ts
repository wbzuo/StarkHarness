import test from 'node:test';
import assert from 'node:assert/strict';
import { LanguageServer } from '../src/lsp/server.js';

test('LanguageServer initializes with default state', () => {
  const server = new LanguageServer();
  assert.equal(server.state, 'stopped');
  assert.equal(server.capabilities, null);
  assert.equal(server.serverInfo, null);
});

test('LanguageServer.status() returns complete snapshot', () => {
  const server = new LanguageServer({ command: 'tsserver', cwd: '/tmp' });
  const status = server.status();
  assert.equal(status.state, 'stopped');
  assert.equal(status.command, 'tsserver');
  assert.equal(status.cwd, '/tmp');
  assert.equal(status.rootUri, null);
  assert.equal(status.startedAt, null);
  assert.equal(status.stoppedAt, null);
  assert.equal(status.lastError, null);
  assert.equal(status.pendingRequests, 0);
});

test('LanguageServer accepts custom command and args', () => {
  const server = new LanguageServer({
    command: 'custom-lsp',
    args: ['--mode', 'stdio'],
    cwd: '/workspace',
  });
  assert.equal(server.command, 'custom-lsp');
  assert.deepEqual(server.args, ['--mode', 'stdio']);
  assert.equal(server.cwd, '/workspace');
});

test('LanguageServer stop() on stopped server is a no-op', async () => {
  const server = new LanguageServer();
  const status = await server.stop();
  assert.equal(status.state, 'stopped');
});

test('LanguageServer restart() on stopped server starts it', async () => {
  // We can't easily test actual start without a running LSP server,
  // but we can verify restart calls start internally
  const server = new LanguageServer({ command: 'nonexistent-lsp-binary' });
  // restart on stopped will call stop (no-op) then start (which will fail)
  const errorPromise = new Promise((resolve) => {
    server.on('error', resolve);
  });
  server.restart().catch(() => {});
  const err = await errorPromise;
  assert.ok(err instanceof Error);
  assert.equal(server.state, 'error');
});

test('LanguageServer emits events on EventEmitter', () => {
  const server = new LanguageServer();
  const events = [];
  server.on('ready', (status) => events.push({ type: 'ready', status }));
  server.on('exit', (info) => events.push({ type: 'exit', info }));
  server.on('diagnostics', (params) => events.push({ type: 'diagnostics', params }));
  // Just verify the listeners are registered without errors
  assert.equal(server.listenerCount('ready'), 1);
  assert.equal(server.listenerCount('exit'), 1);
  assert.equal(server.listenerCount('diagnostics'), 1);
});
