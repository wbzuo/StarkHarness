import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnostics } from '../src/commands/diagnostics.js';

test('buildDiagnostics returns complete registry snapshot', () => {
  const mockRuntime = {
    tools: { list: () => [{ name: 'read_file', capability: 'read', description: 'Read a file' }] },
    commands: { list: () => [{ name: 'blueprint', description: 'Print blueprint' }] },
    providers: { list: () => [{ id: 'anthropic', purpose: 'Claude', modelFamily: 'claude' }] },
    plugins: {
      list: () => [{ name: 'test-pack' }],
      listCapabilities: () => [{ capability: 'test', plugin: 'test-pack' }],
    },
    hooks: {
      listEvents: () => ['PreToolUse'],
      listHandlers: () => [{ event: 'PreToolUse', matcher: '*' }],
    },
    listWorkers: () => [{ agentId: 'agent-1', status: 'running' }],
    inbox: { stats: () => ({ totalQueued: 2, pendingResponses: 1, agents: { 'agent-1': { queued: 2 } } }) },
    skills: { listDiscovered: () => [{ name: 'review', description: 'code review' }] },
    permissions: { snapshot: () => ({ read: 'allow', write: 'ask' }) },
    pluginDiagnostics: { commandConflicts: [], toolConflicts: [] },
    session: { id: 'sh-abc123' },
  };

  const diag = buildDiagnostics(mockRuntime);
  assert.equal(diag.tools.length, 1);
  assert.equal(diag.tools[0].name, 'read_file');
  assert.equal(diag.commands.length, 1);
  assert.equal(diag.providers.length, 1);
  assert.equal(diag.plugins.length, 1);
  assert.equal(diag.hooks.events.length, 1);
  assert.equal(diag.hooks.handlers.length, 1);
  assert.equal(diag.workers.length, 1);
  assert.equal(diag.mailbox.pendingResponses, 1);
  assert.equal(diag.skills.length, 1);
  assert.equal(diag.policy.read, 'allow');
  assert.equal(diag.conflicts.commands.length, 0);
});

test('buildDiagnostics handles missing optional registries gracefully', () => {
  const minRuntime = {
    tools: { list: () => [] },
    commands: { list: () => [] },
    providers: { list: () => [] },
    plugins: { list: () => [], listCapabilities: () => [] },
    hooks: { listEvents: () => [] },
    listWorkers: () => [],
    inbox: { stats: () => ({ totalQueued: 0, pendingResponses: 0, agents: {} }) },
    permissions: { snapshot: () => ({}) },
    pluginDiagnostics: { commandConflicts: [], toolConflicts: [] },
    session: { id: 'sh-min' },
  };

  const diag = buildDiagnostics(minRuntime);
  assert.equal(diag.tools.length, 0);
  assert.equal(diag.skills.length, 0);
  assert.equal(diag.mailbox.totalQueued, 0);
  assert.deepEqual(diag.hooks.handlers, []);
});
