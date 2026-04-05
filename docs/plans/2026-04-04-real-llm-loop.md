# Real LLM Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform StarkHarness from a scaffolding into a working agent runtime that can call the Anthropic Messages API, parse tool_use responses, execute tools through the hook pipeline, and loop until the model produces a final answer.

**Architecture:** Zero new dependencies. Use Node 20+ built-in `fetch()` for HTTP. The Anthropic provider sends Messages API requests with tool definitions from `registry.toSchemaList()`. The agent run loop manages the conversation cycle: build messages → call provider → parse content blocks → dispatch tool calls → append results → repeat. The existing hook system gates every tool execution.

**Tech Stack:** Node.js 20+, zero dependencies, node:test for testing

---

## File Structure

### New files
- `src/providers/anthropic-live.js` — Real Anthropic Messages API client using fetch()
- `src/kernel/runner.js` — Agent run loop: multi-turn conversation with tool execution
- `tests/anthropic-live.test.js` — Unit tests for message formatting and response parsing (no real API calls)
- `tests/runner.test.js` — Agent run loop tests with mock provider

### Modified files
- `src/providers/anthropic.js` — Switch from stub to real provider (with stub fallback)
- `src/providers/base.js` — Add message format helpers
- `src/kernel/runtime.js` — Wire runner into runtime, add `runtime.run()` method
- `src/commands/registry.js` — Update `smoke-test` or add `run` command that uses the real loop

---

## Task 1: Anthropic Messages API Client

The raw HTTP client for Anthropic's Messages API. Handles request formatting, streaming, and response parsing. Zero dependencies — uses `fetch()`.

**Files:**
- Create: `src/providers/anthropic-live.js`
- Create: `tests/anthropic-live.test.js`

- [ ] **Step 1: Write failing tests for message formatting and response parsing**

```javascript
// tests/anthropic-live.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMessages,
  formatTools,
  parseContentBlocks,
  buildRequestBody,
} from '../src/providers/anthropic-live.js';

test('formatMessages converts context messages to Anthropic format', () => {
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
    { role: 'user', content: 'Read file foo.js' },
  ];
  const formatted = formatMessages(messages);
  assert.equal(formatted.length, 3);
  assert.equal(formatted[0].role, 'user');
  assert.equal(formatted[0].content, 'Hello');
});

test('formatMessages handles tool_result messages', () => {
  const messages = [
    { role: 'user', content: 'Read foo.js' },
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: 'foo.js' } }],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'file contents here' }],
    },
  ];
  const formatted = formatMessages(messages);
  assert.equal(formatted.length, 3);
  assert.equal(formatted[2].content[0].type, 'tool_result');
});

test('formatTools converts tool schemas to Anthropic tool format', () => {
  const schemas = [
    {
      name: 'read_file',
      description: 'Read a file',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  ];
  const tools = formatTools(schemas);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'read_file');
  assert.equal(tools[0].input_schema.type, 'object');
});

test('parseContentBlocks extracts text and tool_use from response', () => {
  const response = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me read that file.' },
      { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'foo.js' } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  };

  const parsed = parseContentBlocks(response);
  assert.equal(parsed.text, 'Let me read that file.');
  assert.equal(parsed.toolCalls.length, 1);
  assert.equal(parsed.toolCalls[0].name, 'read_file');
  assert.equal(parsed.toolCalls[0].id, 'toolu_1');
  assert.deepEqual(parsed.toolCalls[0].input, { path: 'foo.js' });
  assert.equal(parsed.stopReason, 'tool_use');
  assert.equal(parsed.usage.input_tokens, 100);
});

test('parseContentBlocks handles text-only final response', () => {
  const response = {
    id: 'msg_2',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Done! The file has been updated.' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 200, output_tokens: 30 },
  };

  const parsed = parseContentBlocks(response);
  assert.equal(parsed.text, 'Done! The file has been updated.');
  assert.equal(parsed.toolCalls.length, 0);
  assert.equal(parsed.stopReason, 'end_turn');
});

test('buildRequestBody assembles a valid API request', () => {
  const body = buildRequestBody({
    model: 'claude-sonnet-4-20250514',
    systemPrompt: 'You are a coding assistant.',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [{ name: 'read_file', description: 'Read', input_schema: { type: 'object', properties: {} } }],
    maxTokens: 4096,
  });

  assert.equal(body.model, 'claude-sonnet-4-20250514');
  assert.equal(body.system, 'You are a coding assistant.');
  assert.equal(body.messages.length, 1);
  assert.equal(body.tools.length, 1);
  assert.equal(body.max_tokens, 4096);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/anthropic-live.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Anthropic Messages API client**

```javascript
// src/providers/anthropic-live.js

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;

export function formatMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export function formatTools(schemas) {
  return schemas.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

export function parseContentBlocks(response) {
  const content = response.content ?? [];
  const textBlocks = content.filter((b) => b.type === 'text');
  const toolBlocks = content.filter((b) => b.type === 'tool_use');

  return {
    text: textBlocks.map((b) => b.text).join('\n'),
    toolCalls: toolBlocks.map((b) => ({
      id: b.id,
      name: b.name,
      input: b.input,
    })),
    stopReason: response.stop_reason,
    usage: response.usage ?? {},
    raw: response,
  };
}

export function buildRequestBody({
  model = DEFAULT_MODEL,
  systemPrompt = '',
  messages = [],
  tools = [],
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (tools.length > 0) body.tools = tools;
  return body;
}

export async function callMessagesAPI({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  systemPrompt = '',
  messages = [],
  tools = [],
  maxTokens = DEFAULT_MAX_TOKENS,
} = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const body = buildRequestBody({ model, systemPrompt, messages, tools, maxTokens });

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return parseContentBlocks(data);
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/anthropic-live.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/anthropic-live.js tests/anthropic-live.test.js
git commit -m "feat: add Anthropic Messages API client with zero dependencies"
```

---

## Task 2: Agent Run Loop

The multi-turn agent loop: user prompt → build messages → call provider → parse tool_use → execute tools through hooks → append results → repeat until end_turn.

**Files:**
- Create: `src/kernel/runner.js`
- Create: `tests/runner.test.js`

- [ ] **Step 1: Write failing tests with mock provider**

```javascript
// tests/runner.test.js
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
      toolCalls: [{ id: 'tu_1', name: 'shell', input: { command: 'rm -rf /' } }],
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/runner.test.js`
Expected: FAIL

- [ ] **Step 3: Implement AgentRunner**

```javascript
// src/kernel/runner.js

const DEFAULT_MAX_TURNS = 25;

export class AgentRunner {
  constructor({ provider, hooks, tools, permissions, maxTurns = DEFAULT_MAX_TURNS }) {
    this.provider = provider;
    this.hooks = hooks;
    this.tools = tools;
    this.permissions = permissions;
    this.maxTurns = maxTurns;
  }

  async run({ userMessage, systemPrompt, toolSchemas }) {
    const messages = [{ role: 'user', content: userMessage }];
    const schemas = toolSchemas ?? this.tools.toSchemaList();
    const turns = [];
    let finalText = '';
    let stopReason = 'end_turn';
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    for (let i = 0; i < this.maxTurns; i++) {
      const response = await this.provider.complete({
        systemPrompt,
        messages,
        tools: schemas,
      });

      totalUsage.input_tokens += response.usage?.input_tokens ?? 0;
      totalUsage.output_tokens += response.usage?.output_tokens ?? 0;

      // Build assistant message content
      const assistantContent = [];
      if (response.text) assistantContent.push({ type: 'text', text: response.text });
      for (const tc of response.toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      messages.push({
        role: 'assistant',
        content: assistantContent.length === 1 && assistantContent[0].type === 'text'
          ? response.text
          : assistantContent,
      });

      // No tool calls — we're done
      if (response.toolCalls.length === 0) {
        finalText = response.text;
        stopReason = response.stopReason ?? 'end_turn';
        break;
      }

      // Execute each tool call through the hook pipeline
      const toolResults = [];
      for (const tc of response.toolCalls) {
        const turnResult = await this.#executeTool(tc);
        turns.push({ toolName: tc.name, toolId: tc.id, input: tc.input, result: turnResult });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: JSON.stringify(turnResult),
        });
      }
      messages.push({ role: 'user', content: toolResults });

      // Check max turns
      if (turns.length >= this.maxTurns) {
        stopReason = 'max-turns';
        break;
      }
    }

    // Fire Stop hook
    await this.hooks.fire('Stop', { reason: stopReason, turns: turns.length });

    return { finalText, turns, messages, stopReason, usage: totalUsage };
  }

  async #executeTool(toolCall) {
    const tool = this.tools.get(toolCall.name);
    if (!tool) return { ok: false, reason: 'unknown-tool', tool: toolCall.name };

    // Permission check
    const gate = this.permissions.evaluate({ capability: tool.capability, toolName: tool.name });
    if (gate.decision === 'deny') return { ok: false, reason: 'permission-denied', tool: toolCall.name, gate };
    if (gate.decision === 'ask') return { ok: false, reason: 'permission-escalation-required', tool: toolCall.name, gate };

    // PreToolUse hook
    const preResult = await this.hooks.fire('PreToolUse', { toolName: toolCall.name, toolInput: toolCall.input });
    if (preResult.decision === 'deny') {
      return { ok: false, reason: 'hook-denied', tool: toolCall.name, hookReason: preResult.reason };
    }

    // Execute
    const result = await tool.execute(preResult.updatedInput ?? toolCall.input, this._runtime);

    // PostToolUse hook
    await this.hooks.fire('PostToolUse', { toolName: toolCall.name, toolInput: toolCall.input, toolResult: result });

    return result;
  }

  setRuntime(runtime) {
    this._runtime = runtime;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/runner.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/kernel/runner.js tests/runner.test.js
git commit -m "feat: add AgentRunner — multi-turn agent loop with tool execution and hook pipeline"
```

---

## Task 3: Wire Real Anthropic Provider

Replace the stub anthropic provider with the real one (with stub fallback when no API key).

**Files:**
- Modify: `src/providers/anthropic.js`
- Modify: `src/kernel/runtime.js` — wire AgentRunner, add `runtime.run()` method

- [ ] **Step 1: Update Anthropic provider**

```javascript
// src/providers/anthropic.js — replace entire file
import { createStubProvider } from './base.js';
import { callMessagesAPI, formatTools, formatMessages } from './anthropic-live.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export function createAnthropicProvider(config = {}) {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;

  // Fall back to stub if no API key
  if (!apiKey) {
    return createStubProvider({
      id: 'anthropic',
      purpose: 'Claude-class provider adapter (stub — set ANTHROPIC_API_KEY to enable)',
      modelFamily: 'claude',
    });
  }

  return {
    id: 'anthropic',
    purpose: 'Claude-class provider adapter',
    modelFamily: 'claude',
    async complete({ systemPrompt, messages, tools, prompt, ...rest }) {
      // Support both old (prompt-based) and new (messages-based) calling conventions
      const effectiveMessages = messages ?? (prompt ? [{ role: 'user', content: prompt }] : []);
      const formattedTools = tools ? formatTools(tools) : [];
      const result = await callMessagesAPI({
        apiKey,
        baseUrl: config.baseUrl,
        model: config.model ?? DEFAULT_MODEL,
        systemPrompt: systemPrompt ?? '',
        messages: formatMessages(effectiveMessages),
        tools: formattedTools,
        maxTokens: config.maxTokens ?? 8192,
      });
      return result;
    },
  };
}
```

- [ ] **Step 2: Wire AgentRunner into runtime**

Add to `src/kernel/runtime.js`:
- Import `AgentRunner` from `./runner.js`
- Create runner instance after loop
- Add `runtime.run(userMessage)` convenience method
- Runner uses the anthropic provider for completions

```javascript
// In createRuntime(), after loop creation:
const runner = new AgentRunner({
  provider: {
    async complete({ systemPrompt, messages, tools }) {
      return providers.complete('anthropic', { systemPrompt, messages, tools });
    },
  },
  hooks,
  tools,
  permissions,
});
runner.setRuntime(runtime);

// Add to runtime object:
runtime.runner = runner;
runtime.run = async function(userMessage) {
  return this.runner.run({
    userMessage,
    systemPrompt: this.context.systemPrompt,
  });
};
```

- [ ] **Step 3: Run all tests**

Run: `node --test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/providers/anthropic.js src/kernel/runtime.js
git commit -m "feat: wire real Anthropic provider and AgentRunner into runtime"
```

---

## Task 4: Add `run` Command and Integration

Add a proper `run` command that takes user input and executes the full agent loop.

**Files:**
- Modify: `src/commands/registry.js` — add `run` command
- Modify: `src/main.js` — support `--prompt` flag for run command

- [ ] **Step 1: Add run command**

```javascript
// Add to createCommandRegistry() array:
{
  name: 'run',
  description: 'Execute a full agent turn loop with the given prompt',
  async execute(runtime, args = {}) {
    const prompt = args.prompt ?? 'What files are in this project?';
    const result = await runtime.run(prompt);
    return {
      finalText: result.finalText,
      turns: result.turns.length,
      stopReason: result.stopReason,
      usage: result.usage,
    };
  },
},
```

- [ ] **Step 2: Run all tests**

Run: `node --test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/commands/registry.js
git commit -m "feat: add run command for full agent loop execution"
```

- [ ] **Step 4: Manual test with real API key**

```bash
ANTHROPIC_API_KEY=sk-ant-... node src/main.js run --prompt="List the files in the src/kernel directory"
```

Expected: The model calls `read_file` or `glob`, gets results, and produces a final text answer.
