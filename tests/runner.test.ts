import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRunner } from '../src/kernel/runner.js';
import { HookDispatcher } from '../src/kernel/hooks.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { defineTool } from '../src/tools/types.js';
import { PermissionEngine } from '../src/permissions/engine.js';

function makeTestTool(name, result) {
  return defineTool({
    name,
    capability: 'read',
    description: `Test tool ${name}`,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    async execute(input) { return { ok: true, tool: name, ...result, input }; },
  });
}

function makeMockProvider(responses) {
  let callIndex = 0;
  return {
    async complete({ messages, tools, systemPrompt }) {
      const response = responses[callIndex++];
      return response;
    },
  };
}

test('AgentRunner executes single text response (no tools)', async () => {
  const provider = makeMockProvider([
    { text: 'Hello! How can I help?', toolCalls: [], stopReason: 'end_turn', usage: {} },
  ]);
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({
    userMessage: 'Hi',
    systemPrompt: 'You are helpful.',
  });

  assert.equal(result.finalText, 'Hello! How can I help?');
  assert.equal(result.turns.length, 0);
  assert.equal(result.messages.length, 2);
});

test('AgentRunner streams final text through onTextChunk callback', async () => {
  const provider = makeMockProvider([
    { text: 'Hello there', toolCalls: [], stopReason: 'end_turn', usage: {} },
  ]);
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  const permissions = new PermissionEngine({ read: 'allow' });
  const chunks = [];

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({
    userMessage: 'Hi',
    systemPrompt: 'You are helpful.',
    onTextChunk: async (chunk) => {
      chunks.push(chunk);
    },
  });

  assert.equal(result.finalText, 'Hello there');
  assert.deepEqual(chunks, ['Hello', ' ', 'there']);
});

test('AgentRunner does not double-emit text when provider streams natively', async () => {
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  const permissions = new PermissionEngine({ read: 'allow' });
  const chunks = [];
  const provider = {
    async complete({ onTextChunk }) {
      await onTextChunk('Hello');
      return { text: 'Hello', toolCalls: [], stopReason: 'end_turn', usage: {}, streamed: true };
    },
  };

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({
    userMessage: 'Hi',
    systemPrompt: 'You are helpful.',
    onTextChunk: async (chunk) => {
      chunks.push(chunk);
    },
  });

  assert.equal(result.finalText, 'Hello');
  assert.deepEqual(chunks, ['Hello']);
});

test('AgentRunner executes tool call and loops back', async () => {
  const provider = makeMockProvider([
    {
      text: 'Let me read that.',
      toolCalls: [{ id: 'tu_1', name: 'read_file', input: { path: 'foo.js' } }],
      stopReason: 'tool_use',
      usage: {},
    },
    { text: 'The file contains hello world.', toolCalls: [], stopReason: 'end_turn', usage: {} },
  ]);
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  tools.register(makeTestTool('read_file', { content: 'hello world' }));
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({
    userMessage: 'Read foo.js',
    systemPrompt: 'You are helpful.',
  });

  assert.equal(result.finalText, 'The file contains hello world.');
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].toolName, 'read_file');
  assert.equal(result.turns[0].result.ok, true);
});

test('AgentRunner respects PreToolUse hook deny', async () => {
  const provider = makeMockProvider([
    {
      text: '',
      toolCalls: [{ id: 'tu_1', name: 'shell', input: { command: 'echo dangerous-looking but allowed' } }],
      stopReason: 'tool_use',
      usage: {},
    },
    { text: 'I cannot execute that command.', toolCalls: [], stopReason: 'end_turn', usage: {} },
  ]);
  const hooks = new HookDispatcher();
  hooks.register('PreToolUse', {
    matcher: 'shell',
    handler: async () => ({ decision: 'deny', reason: 'dangerous' }),
  });
  const tools = new ToolRegistry();
  tools.register(makeTestTool('shell', {}));
  const permissions = new PermissionEngine({ read: 'allow', exec: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({
    userMessage: 'Delete everything',
    systemPrompt: 'You are helpful.',
  });

  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].result.ok, false);
  assert.equal(result.turns[0].result.reason, 'hook-denied');
});

test('AgentRunner enforces max turns limit', async () => {
  const infiniteProvider = makeMockProvider(
    Array(20).fill({
      text: '',
      toolCalls: [{ id: 'tu_x', name: 'read_file', input: { path: 'x' } }],
      stopReason: 'tool_use',
      usage: {},
    }),
  );
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  tools.register(makeTestTool('read_file', { content: 'x' }));
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider: infiniteProvider, hooks, tools, permissions, maxTurns: 3 });
  const result = await runner.run({
    userMessage: 'Loop forever',
    systemPrompt: 'You are helpful.',
  });

  assert.equal(result.turns.length, 3);
  assert.equal(result.stopReason, 'max-turns');
});

test('AgentRunner handles multiple tool calls in single response', async () => {
  const provider = makeMockProvider([
    {
      text: 'Reading both files.',
      toolCalls: [
        { id: 'tu_1', name: 'read_file', input: { path: 'a.js' } },
        { id: 'tu_2', name: 'read_file', input: { path: 'b.js' } },
      ],
      stopReason: 'tool_use',
      usage: {},
    },
    { text: 'Both files read.', toolCalls: [], stopReason: 'end_turn', usage: {} },
  ]);
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  tools.register(makeTestTool('read_file', { content: 'data' }));
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({
    userMessage: 'Read a.js and b.js',
    systemPrompt: 'You are helpful.',
  });

  assert.equal(result.turns.length, 2);
  assert.equal(result.finalText, 'Both files read.');
});

test('AgentRunner enforces max turns consistently across multi-tool responses', async () => {
  const provider = makeMockProvider([
    {
      text: 'Reading several files.',
      toolCalls: [
        { id: 'tu_1', name: 'read_file', input: { path: 'a.js' } },
        { id: 'tu_2', name: 'read_file', input: { path: 'b.js' } },
      ],
      stopReason: 'tool_use',
      usage: {},
    },
  ]);
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  tools.register(makeTestTool('read_file', { content: 'data' }));
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions, maxTurns: 1 });
  const result = await runner.run({
    userMessage: 'Read two files',
    systemPrompt: 'You are helpful.',
  });

  assert.equal(result.turns.length, 1);
  assert.equal(result.stopReason, 'max-turns');
});

test('AgentRunner fires Stop hook before finishing', async () => {
  const provider = makeMockProvider([
    { text: 'Done.', toolCalls: [], stopReason: 'end_turn', usage: {} },
  ]);
  const hooks = new HookDispatcher();
  let stopFired = false;
  hooks.register('Stop', {
    handler: async () => { stopFired = true; return { decision: 'allow' }; },
  });
  const tools = new ToolRegistry();
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  await runner.run({ userMessage: 'Hi', systemPrompt: 'test' });

  assert.equal(stopFired, true);
});

test('AgentRunner returns unknown-tool for unregistered tools', async () => {
  const provider = makeMockProvider([
    {
      text: '',
      toolCalls: [{ id: 'tu_1', name: 'nonexistent', input: {} }],
      stopReason: 'tool_use',
      usage: {},
    },
    { text: 'Tool not found.', toolCalls: [], stopReason: 'end_turn', usage: {} },
  ]);
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({ userMessage: 'Use magic', systemPrompt: 'test' });

  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].result.ok, false);
  assert.equal(result.turns[0].result.reason, 'unknown-tool');
});

test('AgentRunner uses LLM-based compact summaries when context grows large', async () => {
  let callIndex = 0;
  const provider = {
    async complete() {
      callIndex += 1;
      if (callIndex === 1) {
        return {
          text: 'First long answer '.repeat(20),
          toolCalls: [{ id: 'tu_1', name: 'read_file', input: { path: 'a.txt' } }],
          stopReason: 'tool_use',
          usage: {},
        };
      }
      if (callIndex === 2) {
        return {
          text: 'Second long answer '.repeat(20),
          toolCalls: [{ id: 'tu_2', name: 'read_file', input: { path: 'b.txt' } }],
          stopReason: 'tool_use',
          usage: {},
        };
      }
      if (callIndex === 3) {
        return {
          text: 'LLM summary of earlier conversation',
          toolCalls: [],
          stopReason: 'end_turn',
          usage: {},
        };
      }
      return {
        text: 'Final answer after compaction.',
        toolCalls: [],
        stopReason: 'end_turn',
        usage: {},
      };
    },
  };
  const hooks = new HookDispatcher();
  const tools = new ToolRegistry();
  tools.register(makeTestTool('read_file', { content: 'data' }));
  const permissions = new PermissionEngine({ read: 'allow' });

  const runner = new AgentRunner({ provider, hooks, tools, permissions });
  const result = await runner.run({
    userMessage: 'Read several files and continue',
    systemPrompt: 'You are helpful.',
    compactThreshold: 20,
  });

  assert.equal(result.compactions, 1);
  assert.equal(result.finalText, 'Final answer after compaction.');
  assert.ok(result.messages.some((message) => typeof message.content === 'string' && message.content.includes('LLM summary of earlier conversation')));
});
