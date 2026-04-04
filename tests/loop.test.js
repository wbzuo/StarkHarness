import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentLoop } from '../src/kernel/loop.js';
import { HookDispatcher } from '../src/kernel/hooks.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { defineTool } from '../src/tools/types.js';

function makeTestTool(name = 'test_tool') {
  return defineTool({
    name,
    capability: 'read',
    description: 'test tool',
    inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
    async execute(input) { return { ok: true, tool: name, value: input.value }; },
  });
}

test('AgentLoop dispatches a tool turn through hooks', async () => {
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  tools.register(makeTestTool());
  const permissions = { evaluate: () => ({ decision: 'allow' }) };

  const loop = new AgentLoop({ hooks, tools, permissions });
  const result = await loop.executeTurn({ tool: 'test_tool', input: { value: 'hello' } });
  assert.equal(result.ok, true);
  assert.equal(result.value, 'hello');
});

test('PreToolUse deny blocks execution', async () => {
  const hooks = new HookDispatcher();
  hooks.register('PreToolUse', {
    matcher: 'test_tool',
    handler: async () => ({ decision: 'deny', reason: 'blocked' }),
  });
  const tools = new ToolRegistry();
  tools.register(makeTestTool());
  const permissions = { evaluate: () => ({ decision: 'allow' }) };

  const loop = new AgentLoop({ hooks, tools, permissions });
  const result = await loop.executeTurn({ tool: 'test_tool', input: {} });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'hook-denied');
});

test('PostToolUse can inject systemMessage', async () => {
  const hooks = new HookDispatcher();
  hooks.register('PostToolUse', {
    matcher: '*',
    handler: async () => ({ systemMessage: 'Remember to test' }),
  });
  const tools = new ToolRegistry();
  tools.register(makeTestTool());
  const permissions = { evaluate: () => ({ decision: 'allow' }) };

  const loop = new AgentLoop({ hooks, tools, permissions });
  const result = await loop.executeTurn({ tool: 'test_tool', input: {} });
  assert.equal(result.ok, true);
  assert.equal(result.postHook.systemMessage, 'Remember to test');
});

test('permission deny blocks before hooks', async () => {
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  tools.register(makeTestTool());
  const permissions = { evaluate: () => ({ decision: 'deny' }) };

  const loop = new AgentLoop({ hooks, tools, permissions });
  const result = await loop.executeTurn({ tool: 'test_tool', input: {} });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
});

test('Stop hook can block agent exit', async () => {
  const hooks = new HookDispatcher();
  hooks.register('Stop', {
    handler: async () => ({ decision: 'deny', reason: 'not done' }),
  });

  const loop = new AgentLoop({ hooks, tools: new ToolRegistry(), permissions: { evaluate: () => ({ decision: 'allow' }) } });
  const canStop = await loop.requestStop('task complete');
  assert.equal(canStop, false);
});

test('Stop hook approve allows exit', async () => {
  const hooks = new HookDispatcher();
  const loop = new AgentLoop({ hooks, tools: new ToolRegistry(), permissions: { evaluate: () => ({ decision: 'allow' }) } });
  const canStop = await loop.requestStop('done');
  assert.equal(canStop, true);
});
