// tests/hooks.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { HookDispatcher } from '../src/kernel/hooks.js';

test('HookDispatcher registers and fires PreToolUse hooks', async () => {
  const dispatcher = new HookDispatcher();
  const calls = [];
  dispatcher.register('PreToolUse', {
    matcher: 'shell',
    handler: async (ctx) => { calls.push(ctx.toolName); return { decision: 'allow' }; },
  });
  const result = await dispatcher.fire('PreToolUse', { toolName: 'shell', toolInput: {} });
  assert.equal(calls.length, 1);
  assert.equal(result.decision, 'allow');
});

test('matcher supports pipe-separated tool names', async () => {
  const dispatcher = new HookDispatcher();
  const calls = [];
  dispatcher.register('PreToolUse', {
    matcher: 'read_file|write_file',
    handler: async (ctx) => { calls.push(ctx.toolName); return { decision: 'allow' }; },
  });
  await dispatcher.fire('PreToolUse', { toolName: 'read_file', toolInput: {} });
  await dispatcher.fire('PreToolUse', { toolName: 'shell', toolInput: {} });
  assert.equal(calls.length, 1);
});

test('matcher wildcard matches all tools', async () => {
  const dispatcher = new HookDispatcher();
  let called = false;
  dispatcher.register('PreToolUse', {
    matcher: '*',
    handler: async () => { called = true; return { decision: 'allow' }; },
  });
  await dispatcher.fire('PreToolUse', { toolName: 'anything', toolInput: {} });
  assert.equal(called, true);
});

test('PreToolUse deny result is returned when hook denies', async () => {
  const dispatcher = new HookDispatcher();
  dispatcher.register('PreToolUse', {
    matcher: 'shell',
    handler: async () => ({ decision: 'deny', reason: 'blocked by policy' }),
  });
  const result = await dispatcher.fire('PreToolUse', { toolName: 'shell', toolInput: {} });
  assert.equal(result.decision, 'deny');
  assert.equal(result.reason, 'blocked by policy');
});

test('Stop hook can block agent exit', async () => {
  const dispatcher = new HookDispatcher();
  dispatcher.register('Stop', {
    handler: async () => ({ decision: 'block', reason: 'tests not passing' }),
  });
  const result = await dispatcher.fire('Stop', { reason: 'task complete' });
  assert.equal(result.decision, 'block');
});

test('SessionStart hook returns additionalContext', async () => {
  const dispatcher = new HookDispatcher();
  dispatcher.register('SessionStart', {
    handler: async () => ({ additionalContext: 'Learning mode enabled' }),
  });
  const result = await dispatcher.fire('SessionStart', {});
  assert.equal(result.additionalContext, 'Learning mode enabled');
});

test('hooks with no matching matcher are skipped', async () => {
  const dispatcher = new HookDispatcher();
  let called = false;
  dispatcher.register('PreToolUse', {
    matcher: 'write_file',
    handler: async () => { called = true; return { decision: 'allow' }; },
  });
  await dispatcher.fire('PreToolUse', { toolName: 'read_file', toolInput: {} });
  assert.equal(called, false);
});

test('multiple hooks run in parallel, any deny wins', async () => {
  const dispatcher = new HookDispatcher();
  dispatcher.register('PreToolUse', {
    matcher: '*',
    handler: async () => ({ decision: 'allow' }),
  });
  dispatcher.register('PreToolUse', {
    matcher: 'shell',
    handler: async () => ({ decision: 'deny', reason: 'security' }),
  });
  const result = await dispatcher.fire('PreToolUse', { toolName: 'shell', toolInput: {} });
  assert.equal(result.decision, 'deny');
});

test('all 9 event types are valid', () => {
  const dispatcher = new HookDispatcher();
  const events = [
    'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
    'UserPromptSubmit', 'SessionStart', 'SessionEnd',
    'PreCompact', 'Notification',
  ];
  for (const event of events) {
    dispatcher.register(event, { handler: async () => ({}) });
  }
  assert.equal(dispatcher.listEvents().length, 9);
});
