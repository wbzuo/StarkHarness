# StarkHarness → Claude Code Harness Alignment Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor StarkHarness to implement Claude Code's core harness patterns — hook lifecycle, system prompt builder, JSON Schema tools, agent turn loop, YAML frontmatter commands, three-level skill loading, and memory system.

**Architecture:** The kernel stays minimal. We add 5 new modules (hooks, prompt builder, memory, skill loader, command parser) and enhance 4 existing ones (loop, tools, context, agents). The hook system becomes the extensibility backbone — every tool call flows through PreToolUse/PostToolUse gates. The turn loop becomes a real agent cycle: build messages → call provider → parse tool_use → hook-gated dispatch → repeat.

**Tech Stack:** Node.js 20+, zero dependencies, node:test for testing

---

## File Structure

### New files
- `src/kernel/hooks.js` — Hook dispatcher with 9 event types, matcher patterns, command/prompt hook types
- `src/kernel/prompt.js` — System prompt builder assembling CLAUDE.md + tool schemas + memory
- `src/memory/index.js` — Static (CLAUDE.md) + dynamic (auto memory) with YAML frontmatter
- `src/skills/loader.js` — Three-level progressive skill loading (metadata → body → references)
- `src/commands/parser.js` — YAML frontmatter + Markdown body parser for command files

### Modified files
- `src/kernel/loop.js` — Real agent turn loop with hook interception at every stage
- `src/kernel/context.js` — Context envelope with message history, token tracking, compaction
- `src/kernel/runtime.js` — Wire hooks, prompt builder, memory, skills into runtime
- `src/kernel/session.js` — Add message history and hook state
- `src/tools/types.js` — Add JSON Schema parameter definitions to tool contract
- `src/tools/registry.js` — Generate tool schemas for prompt building
- `src/tools/builtins/index.js` — Add `inputSchema` to every builtin tool
- `src/agents/manager.js` — Description-driven routing, tool restrictions, model selection
- `src/kernel/events.js` — Add async emit and wildcard listeners
- `tests/runtime.test.js` — Update existing tests for new interfaces

### New test files
- `tests/hooks.test.js` — Hook lifecycle, matchers, command/prompt hooks
- `tests/prompt.test.js` — System prompt assembly
- `tests/loop.test.js` — Agent turn loop with hook interception
- `tests/memory.test.js` — CLAUDE.md loading and dynamic memory
- `tests/skills.test.js` — Three-level skill loading
- `tests/commands-parser.test.js` — YAML frontmatter parsing

---

## Task 1: Hook System

The hook system is Claude Code's extensibility backbone. Every tool call, session event, and stop decision flows through hooks.

**Files:**
- Create: `src/kernel/hooks.js`
- Create: `tests/hooks.test.js`
- Modify: `src/kernel/events.js`

- [ ] **Step 1: Write failing tests for HookDispatcher**

```javascript
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

test('PreToolUse deny short-circuits execution', async () => {
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

test('multiple hooks run in parallel, first deny wins', async () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks.test.js`
Expected: FAIL — `cannot find module '../src/kernel/hooks.js'`

- [ ] **Step 3: Implement HookDispatcher**

```javascript
// src/kernel/hooks.js
const HOOK_EVENTS = new Set([
  'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
  'UserPromptSubmit', 'SessionStart', 'SessionEnd',
  'PreCompact', 'Notification',
]);

function matchesTool(matcher, toolName) {
  if (!matcher || matcher === '*') return true;
  if (matcher.includes('|')) return matcher.split('|').some((m) => matchesTool(m.trim(), toolName));
  if (matcher.includes('.*')) return new RegExp(`^${matcher}$`).test(toolName);
  return matcher === toolName;
}

export class HookDispatcher {
  #hooks = new Map();

  constructor() {
    for (const event of HOOK_EVENTS) {
      this.#hooks.set(event, []);
    }
  }

  register(eventName, hook) {
    if (!HOOK_EVENTS.has(eventName)) throw new Error(`Unknown hook event: ${eventName}`);
    this.#hooks.get(eventName).push(hook);
  }

  async fire(eventName, context) {
    const hooks = this.#hooks.get(eventName) ?? [];
    const applicable = hooks.filter((hook) => {
      if (!hook.matcher) return true;
      return matchesTool(hook.matcher, context.toolName);
    });

    if (applicable.length === 0) return { decision: 'allow' };

    const results = await Promise.all(applicable.map((hook) => hook.handler(context)));

    // For PreToolUse/Stop: deny/block wins over allow
    const deny = results.find((r) => r.decision === 'deny' || r.decision === 'block');
    if (deny) return deny;

    // Merge all results
    return results.reduce((merged, r) => ({ ...merged, ...r }), { decision: 'allow' });
  }

  listEvents() {
    return [...HOOK_EVENTS];
  }

  snapshot() {
    const result = {};
    for (const [event, hooks] of this.#hooks) {
      if (hooks.length > 0) result[event] = hooks.length;
    }
    return result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks.test.js`
Expected: 9 tests PASS

- [ ] **Step 5: Enhance EventBus with async emit**

```javascript
// src/kernel/events.js — replace entire file
export class EventBus {
  #listeners = new Map();

  on(eventName, listener) {
    const listeners = this.#listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.#listeners.set(eventName, listeners);
    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    const listeners = this.#listeners.get(eventName) ?? [];
    this.#listeners.set(eventName, listeners.filter((item) => item !== listener));
  }

  emit(eventName, payload) {
    for (const listener of this.#listeners.get(eventName) ?? []) {
      listener(payload);
    }
    // Wildcard listeners
    for (const listener of this.#listeners.get('*') ?? []) {
      listener(eventName, payload);
    }
  }

  async emitAsync(eventName, payload) {
    const listeners = [...(this.#listeners.get(eventName) ?? []), ...(this.#listeners.get('*') ?? [])];
    await Promise.all(listeners.map((fn) => fn(eventName === '*' ? eventName : payload, payload)));
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/kernel/hooks.js src/kernel/events.js tests/hooks.test.js
git commit -m "feat: add hook system with 9 lifecycle events and matcher patterns"
```

---

## Task 2: JSON Schema Tool Definitions

Claude Code tools are defined with JSON Schema so the LLM knows what parameters to pass.

**Files:**
- Modify: `src/tools/types.js`
- Modify: `src/tools/registry.js`
- Modify: `src/tools/builtins/index.js`
- Create: `tests/tools-schema.test.js`

- [ ] **Step 1: Write failing tests for schema'd tools**

```javascript
// tests/tools-schema.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineTool } from '../src/tools/types.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { createBuiltinTools } from '../src/tools/builtins/index.js';

test('defineTool requires inputSchema', () => {
  assert.throws(() => defineTool({
    name: 'test', capability: 'read', description: 'test', execute: () => {},
  }), /inputSchema/);
});

test('defineTool accepts valid inputSchema', () => {
  const tool = defineTool({
    name: 'test',
    capability: 'read',
    description: 'test',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    execute: () => {},
  });
  assert.equal(tool.inputSchema.type, 'object');
});

test('all builtin tools have inputSchema', () => {
  const tools = createBuiltinTools();
  for (const tool of tools) {
    assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} schema must be object`);
  }
});

test('ToolRegistry.toSchemaList generates LLM-ready tool list', () => {
  const registry = new ToolRegistry();
  const tools = createBuiltinTools();
  tools.forEach((t) => registry.register(t));

  const schemas = registry.toSchemaList();
  assert.ok(schemas.length >= 10);
  for (const schema of schemas) {
    assert.ok(schema.name);
    assert.ok(schema.description);
    assert.ok(schema.input_schema);
    assert.equal(schema.input_schema.type, 'object');
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/tools-schema.test.js`
Expected: FAIL

- [ ] **Step 3: Update defineTool to require inputSchema**

```javascript
// src/tools/types.js — replace entire file
export function defineTool(definition) {
  const required = ['name', 'capability', 'description', 'inputSchema', 'execute'];
  for (const field of required) {
    if (!definition?.[field]) {
      throw new Error(`Tool definition missing ${field}`);
    }
  }
  if (definition.inputSchema.type !== 'object') {
    throw new Error(`Tool ${definition.name} inputSchema.type must be 'object'`);
  }
  return Object.freeze(definition);
}
```

- [ ] **Step 4: Add toSchemaList to ToolRegistry**

```javascript
// src/tools/registry.js — replace entire file
function createPluginTool(tool) {
  return {
    name: tool.name,
    capability: tool.capability ?? 'delegate',
    description: tool.description ?? `Plugin tool from ${tool.plugin}`,
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    async execute(input = {}) {
      return { ok: true, source: 'plugin', plugin: tool.plugin, tool: tool.name, input, output: tool.output ?? null };
    },
  };
}

export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    this.#tools.set(tool.name, tool);
    return tool;
  }

  registerMany(tools = []) {
    tools.forEach((tool) => this.register(tool));
  }

  registerPluginTools(pluginTools = []) {
    this.registerMany(pluginTools.map(createPluginTool));
  }

  get(name) {
    return this.#tools.get(name);
  }

  list() {
    return [...this.#tools.values()];
  }

  toSchemaList() {
    return this.list().map(({ name, description, inputSchema }) => ({
      name,
      description,
      input_schema: inputSchema,
    }));
  }
}
```

- [ ] **Step 5: Add inputSchema to all builtin tools**

```javascript
// src/tools/builtins/index.js — replace entire file
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineTool } from '../types.js';

const execFileAsync = promisify(execFile);

function resolveWorkspacePath(runtime, targetPath = '.') {
  if (!targetPath) return runtime.context.cwd;
  return path.resolve(runtime.context.cwd, targetPath);
}

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.starkharness') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) results.push(...(await walkFiles(fullPath)));
    else results.push(fullPath);
  }
  return results;
}

export function createBuiltinTools() {
  return [
    defineTool({
      name: 'read_file',
      capability: 'read',
      description: 'Read a file from the workspace. Returns the file content as a string.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file to read' },
          offset: { type: 'number', description: 'Line number to start reading from (0-based)' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
        },
        required: ['path'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        let content = await readFile(filePath, 'utf8');
        if (input.offset !== undefined || input.limit !== undefined) {
          const lines = content.split('\n');
          const start = input.offset ?? 0;
          const end = input.limit ? start + input.limit : lines.length;
          content = lines.slice(start, end).join('\n');
        }
        return { ok: true, tool: 'read_file', path: filePath, content };
      },
    }),

    defineTool({
      name: 'write_file',
      capability: 'write',
      description: 'Create or overwrite a file. Creates parent directories as needed.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to write' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, input.content ?? '', 'utf8');
        return { ok: true, tool: 'write_file', path: filePath, bytes: Buffer.byteLength(input.content ?? '', 'utf8') };
      },
    }),

    defineTool({
      name: 'edit_file',
      capability: 'write',
      description: 'Perform exact string replacement in a file. old_string must be unique in the file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file' },
          old_string: { type: 'string', description: 'Exact text to find and replace' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences', default: false },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        const current = await readFile(filePath, 'utf8');
        if (!current.includes(input.old_string ?? input.oldString ?? '')) {
          return { ok: false, tool: 'edit_file', reason: 'old-string-not-found', path: filePath };
        }
        const search = input.old_string ?? input.oldString;
        const replacement = input.new_string ?? input.newString ?? '';
        const next = input.replace_all ? current.replaceAll(search, replacement) : current.replace(search, replacement);
        await writeFile(filePath, next, 'utf8');
        return { ok: true, tool: 'edit_file', path: filePath };
      },
    }),

    defineTool({
      name: 'shell',
      capability: 'exec',
      description: 'Execute a shell command in the workspace directory. Returns stdout and stderr.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 },
        },
        required: ['command'],
      },
      async execute(input = {}, runtime) {
        const command = input.command ?? 'pwd';
        const timeout = input.timeout ?? 120000;
        const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
          cwd: runtime.context.cwd,
          maxBuffer: 4 * 1024 * 1024,
          timeout,
        });
        return { ok: true, tool: 'shell', command, stdout, stderr };
      },
    }),

    defineTool({
      name: 'search',
      capability: 'read',
      description: 'Search workspace file contents for a text pattern. Returns matching file paths and lines.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text pattern to search for' },
          glob: { type: 'string', description: 'File pattern filter (e.g. "*.js")' },
        },
        required: ['query'],
      },
      async execute(input = {}, runtime) {
        const query = String(input.query ?? '');
        const files = await walkFiles(runtime.context.cwd);
        const needle = input.glob?.replaceAll('*', '') ?? '';
        const filtered = needle ? files.filter((f) => f.includes(needle)) : files;
        const matches = [];
        for (const filePath of filtered) {
          const content = await readFile(filePath, 'utf8').catch(() => null);
          if (!content || !query) continue;
          content.split('\n').forEach((line, index) => {
            if (line.includes(query)) matches.push({ path: filePath, line: index + 1, text: line.trim() });
          });
        }
        return { ok: true, tool: 'search', query, matches };
      },
    }),

    defineTool({
      name: 'glob',
      capability: 'read',
      description: 'Find files matching a pattern in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'File pattern to match (e.g. "**/*.js")' },
        },
        required: ['pattern'],
      },
      async execute(input = {}, runtime) {
        const pattern = String(input.pattern ?? '');
        const files = await walkFiles(runtime.context.cwd);
        const needle = pattern.replaceAll('*', '');
        const matches = files.filter((f) => f.includes(needle));
        return { ok: true, tool: 'glob', pattern, matches };
      },
    }),

    defineTool({
      name: 'fetch_url',
      capability: 'network',
      description: 'Fetch content from a URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
      async execute(input = {}) {
        const response = await fetch(input.url);
        const content = await response.text();
        return { ok: true, tool: 'fetch_url', url: input.url, status: response.status, content };
      },
    }),

    defineTool({
      name: 'spawn_agent',
      capability: 'delegate',
      description: 'Spawn a bounded child agent for parallel or isolated work.',
      inputSchema: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Agent role (e.g. "code-reviewer", "explorer")' },
          scope: { type: 'string', description: 'Scope restriction for the agent' },
          prompt: { type: 'string', description: 'Task description for the agent' },
          model: { type: 'string', description: 'Model override (inherit, sonnet, opus, haiku)' },
          tools: { type: 'array', items: { type: 'string' }, description: 'Tool whitelist' },
        },
        required: ['role'],
      },
      async execute(input = {}, runtime) {
        const agent = runtime.agents.spawn(input);
        await runtime.persist();
        return { ok: true, tool: 'spawn_agent', agent };
      },
    }),

    defineTool({
      name: 'send_message',
      capability: 'delegate',
      description: 'Send a message to another agent.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Sender agent ID' },
          to: { type: 'string', description: 'Recipient agent ID' },
          body: { type: 'string', description: 'Message content' },
        },
        required: ['to', 'body'],
      },
      async execute(input = {}, runtime) {
        const message = { from: input.from ?? 'runtime', to: input.to, body: input.body ?? '', sentAt: new Date().toISOString() };
        runtime.session.messages = [...(runtime.session.messages ?? []), message];
        await runtime.persist();
        return { ok: true, tool: 'send_message', message };
      },
    }),

    defineTool({
      name: 'tasks',
      capability: 'delegate',
      description: 'Create, update, or list tasks for tracking work.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'list'], description: 'Task action' },
          id: { type: 'string', description: 'Task ID (for update)' },
          task: { type: 'object', description: 'Task data (for create)' },
          patch: { type: 'object', description: 'Fields to update (for update)' },
        },
      },
      async execute(input = {}, runtime) {
        let task;
        switch (input.action) {
          case 'create': task = runtime.tasks.create(input.task ?? {}); break;
          case 'update': task = runtime.tasks.update(input.id, input.patch ?? {}); break;
          default: return { ok: true, tool: 'tasks', tasks: runtime.tasks.list() };
        }
        await runtime.persist();
        return { ok: true, tool: 'tasks', task, tasks: runtime.tasks.list() };
      },
    }),
  ];
}
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/tools-schema.test.js`
Expected: 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/tools/types.js src/tools/registry.js src/tools/builtins/index.js tests/tools-schema.test.js
git commit -m "feat: add JSON Schema to all tool definitions for LLM consumption"
```

---

## Task 3: System Prompt Builder

Assembles the system prompt from identity + tool schemas + CLAUDE.md + memory + hook context.

**Files:**
- Create: `src/kernel/prompt.js`
- Create: `tests/prompt.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/prompt.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemPromptBuilder } from '../src/kernel/prompt.js';

test('builds prompt with identity section', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: '' });
  assert.ok(prompt.includes('You are StarkHarness'));
});

test('includes tool descriptions in prompt', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({
    tools: [{ name: 'read_file', description: 'Read a file', input_schema: { type: 'object', properties: {} } }],
    claudeMd: '',
    memory: '',
  });
  assert.ok(prompt.includes('read_file'));
  assert.ok(prompt.includes('Read a file'));
});

test('includes CLAUDE.md content', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '# Rules\nAlways use TDD', memory: '' });
  assert.ok(prompt.includes('Always use TDD'));
});

test('includes memory content', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: 'User is a Go expert' });
  assert.ok(prompt.includes('Go expert'));
});

test('includes hook-injected context', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: '', hookContext: 'Learning mode enabled' });
  assert.ok(prompt.includes('Learning mode'));
});

test('includes environment info', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: '', cwd: '/projects/myapp', platform: 'darwin' });
  assert.ok(prompt.includes('/projects/myapp'));
  assert.ok(prompt.includes('darwin'));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/prompt.test.js`
Expected: FAIL

- [ ] **Step 3: Implement SystemPromptBuilder**

```javascript
// src/kernel/prompt.js
export class SystemPromptBuilder {
  build({ tools = [], claudeMd = '', memory = '', hookContext = '', cwd = process.cwd(), platform = process.platform } = {}) {
    const sections = [];

    // Identity
    sections.push(`You are StarkHarness, an agentic coding runtime that lives in your terminal.
You understand codebases, edit files, run commands, and handle workflows through natural language.`);

    // Environment
    sections.push(`# Environment
- Working directory: ${cwd}
- Platform: ${platform}
- Date: ${new Date().toISOString().split('T')[0]}`);

    // CLAUDE.md
    if (claudeMd.trim()) {
      sections.push(`# Project Instructions (CLAUDE.md)\n${claudeMd.trim()}`);
    }

    // Memory
    if (memory.trim()) {
      sections.push(`# Memory\n${memory.trim()}`);
    }

    // Hook-injected context
    if (hookContext.trim()) {
      sections.push(`# Additional Context\n${hookContext.trim()}`);
    }

    // Tools
    if (tools.length > 0) {
      const toolDocs = tools.map((t) => {
        const params = t.input_schema?.properties ?? {};
        const paramLines = Object.entries(params)
          .map(([key, val]) => `    ${key}: ${val.type}${val.description ? ` — ${val.description}` : ''}`)
          .join('\n');
        return `- **${t.name}**: ${t.description}${paramLines ? '\n' + paramLines : ''}`;
      }).join('\n');
      sections.push(`# Available Tools\n${toolDocs}`);
    }

    // Behavioral rules
    sections.push(`# Rules
- Read files before editing them.
- Prefer editing existing files over creating new ones.
- Use the permission system. Do not bypass safety checks.
- Be concise. Lead with the answer, not the reasoning.`);

    return sections.join('\n\n');
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/prompt.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/kernel/prompt.js tests/prompt.test.js
git commit -m "feat: add system prompt builder assembling identity, tools, CLAUDE.md, memory"
```

---

## Task 4: Agent Turn Loop with Hook Interception

The real harness loop: user → build prompt → call provider → parse tool_use → hook-gated dispatch → repeat.

**Files:**
- Modify: `src/kernel/loop.js`
- Modify: `src/kernel/context.js`
- Modify: `src/kernel/session.js`
- Create: `tests/loop.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/loop.test.js
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
    handler: async () => ({ decision: 'block', reason: 'not done' }),
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/loop.test.js`
Expected: FAIL

- [ ] **Step 3: Implement AgentLoop**

```javascript
// src/kernel/loop.js — replace entire file
export class AgentLoop {
  constructor({ hooks, tools, permissions }) {
    this.hooks = hooks;
    this.tools = tools;
    this.permissions = permissions;
    this.turnLog = [];
  }

  async executeTurn(turn) {
    const { tool: toolName, input = {} } = turn;
    const tool = this.tools.get(toolName);
    if (!tool) return { ok: false, reason: 'unknown-tool', tool: toolName };

    // 1. Permission check
    const gate = this.permissions.evaluate({ capability: tool.capability, toolName: tool.name });
    if (gate.decision === 'deny') return { ok: false, reason: 'permission-denied', tool: toolName, gate };
    if (gate.decision === 'ask') return { ok: false, reason: 'permission-escalation-required', tool: toolName, gate };

    // 2. PreToolUse hooks
    const preResult = await this.hooks.fire('PreToolUse', { toolName, toolInput: input });
    if (preResult.decision === 'deny') {
      return { ok: false, reason: 'hook-denied', tool: toolName, hookReason: preResult.reason };
    }
    const effectiveInput = preResult.updatedInput ?? input;

    // 3. Execute tool
    const result = await tool.execute(effectiveInput, this._runtime);

    // 4. PostToolUse hooks
    const postResult = await this.hooks.fire('PostToolUse', { toolName, toolInput: effectiveInput, toolResult: result });

    // 5. Record turn
    const record = {
      turn,
      result,
      preHook: preResult,
      postHook: postResult,
      recordedAt: new Date().toISOString(),
    };
    this.turnLog.push(record);

    return { ...result, postHook: postResult };
  }

  async requestStop(reason) {
    const result = await this.hooks.fire('Stop', { reason });
    return result.decision !== 'block';
  }

  setRuntime(runtime) {
    this._runtime = runtime;
  }
}

// Backward compat
export async function runHarnessTurn(runtime, turn) {
  runtime.events.emit('turn:start', turn);
  const result = await runtime.dispatchTurn(turn);
  runtime.events.emit('turn:end', result);
  return result;
}
```

- [ ] **Step 4: Enhance context.js with message history**

```javascript
// src/kernel/context.js — replace entire file
export function createContextEnvelope({ cwd = process.cwd(), mode = 'interactive', metadata = {} } = {}) {
  return {
    cwd,
    mode,
    metadata,
    messages: [],
    systemPrompt: '',
    tokenEstimate: 0,
    createdAt: new Date().toISOString(),
  };
}

export function appendMessage(context, role, content) {
  context.messages.push({ role, content, addedAt: new Date().toISOString() });
  context.tokenEstimate += Math.ceil(content.length / 4); // rough estimate
  return context;
}

export function compactContext(context, { maxTokens = 100000 } = {}) {
  if (context.tokenEstimate < maxTokens) return { compacted: false, context };

  // Keep system prompt + last N messages
  const keep = Math.max(4, Math.floor(context.messages.length * 0.3));
  const removed = context.messages.slice(0, -keep);
  const summary = `[Compacted ${removed.length} earlier messages]`;

  const compacted = {
    ...context,
    messages: [{ role: 'system', content: summary, addedAt: new Date().toISOString() }, ...context.messages.slice(-keep)],
    tokenEstimate: Math.ceil(context.tokenEstimate * 0.4),
  };
  return { compacted: true, context: compacted, removedCount: removed.length };
}
```

- [ ] **Step 5: Enhance session.js with message history**

```javascript
// src/kernel/session.js — replace entire file
import { randomBytes } from 'node:crypto';

export function createSession({ goal = 'boot', mode = 'interactive', cwd = process.cwd() } = {}) {
  return {
    id: `sh-${randomBytes(6).toString('hex')}`,
    goal,
    mode,
    cwd,
    status: 'idle',
    turns: [],
    messages: [],
    hookState: {},
    createdAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/loop.test.js`
Expected: 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/kernel/loop.js src/kernel/context.js src/kernel/session.js tests/loop.test.js
git commit -m "feat: implement agent turn loop with hook-gated PreToolUse/PostToolUse/Stop"
```

---

## Task 5: Memory System

Static CLAUDE.md + dynamic auto-memory with YAML frontmatter files.

**Files:**
- Create: `src/memory/index.js`
- Create: `tests/memory.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/memory.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MemoryManager } from '../src/memory/index.js';

test('loads CLAUDE.md from project root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  await writeFile(path.join(root, 'CLAUDE.md'), '# Rules\nAlways test first');
  const mem = new MemoryManager({ projectDir: root });
  const claudeMd = await mem.loadClaudeMd();
  assert.ok(claudeMd.includes('Always test first'));
});

test('returns empty string when CLAUDE.md missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  const mem = new MemoryManager({ projectDir: root });
  const claudeMd = await mem.loadClaudeMd();
  assert.equal(claudeMd, '');
});

test('loads dynamic memory files with frontmatter', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  const memDir = path.join(root, '.starkharness', 'memory');
  await mkdir(memDir, { recursive: true });
  await writeFile(path.join(memDir, 'user_role.md'), `---
name: user-role
type: user
description: User is a Go expert
---
Senior Go engineer, new to React.`);

  const mem = new MemoryManager({ projectDir: root });
  const memories = await mem.loadDynamicMemory();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].name, 'user-role');
  assert.equal(memories[0].type, 'user');
  assert.ok(memories[0].content.includes('Go engineer'));
});

test('toPromptString combines CLAUDE.md and memories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  await writeFile(path.join(root, 'CLAUDE.md'), 'Use TDD');
  const memDir = path.join(root, '.starkharness', 'memory');
  await mkdir(memDir, { recursive: true });
  await writeFile(path.join(memDir, 'feedback.md'), `---
name: feedback-terse
type: feedback
description: User wants terse output
---
No trailing summaries.`);

  const mem = new MemoryManager({ projectDir: root });
  const { claudeMd, memoryString } = await mem.toPromptStrings();
  assert.ok(claudeMd.includes('TDD'));
  assert.ok(memoryString.includes('trailing summaries'));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/memory.test.js`
Expected: FAIL

- [ ] **Step 3: Implement MemoryManager**

```javascript
// src/memory/index.js
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key.trim()) meta[key.trim()] = rest.join(':').trim();
  }
  return { meta, body: match[2].trim() };
}

export class MemoryManager {
  constructor({ projectDir, userDir }) {
    this.projectDir = projectDir;
    this.userDir = userDir;
    this.memoryDir = path.join(projectDir, '.starkharness', 'memory');
  }

  async loadClaudeMd() {
    const paths = [
      path.join(this.projectDir, 'CLAUDE.md'),
      ...(this.userDir ? [path.join(this.userDir, 'CLAUDE.md')] : []),
    ];
    const sections = [];
    for (const p of paths) {
      const content = await readFile(p, 'utf8').catch(() => '');
      if (content.trim()) sections.push(content.trim());
    }
    return sections.join('\n\n');
  }

  async loadDynamicMemory() {
    await mkdir(this.memoryDir, { recursive: true }).catch(() => {});
    const files = await readdir(this.memoryDir).catch(() => []);
    const memories = [];
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      const content = await readFile(path.join(this.memoryDir, file), 'utf8');
      const { meta, body } = parseFrontmatter(content);
      memories.push({
        file,
        name: meta.name ?? file.replace('.md', ''),
        type: meta.type ?? 'unknown',
        description: meta.description ?? '',
        content: body,
      });
    }
    return memories;
  }

  async toPromptStrings() {
    const claudeMd = await this.loadClaudeMd();
    const memories = await this.loadDynamicMemory();
    const memoryString = memories.map((m) => `[${m.type}:${m.name}] ${m.content}`).join('\n');
    return { claudeMd, memoryString, memories };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/memory.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/index.js tests/memory.test.js
git commit -m "feat: add memory system with CLAUDE.md loading and YAML frontmatter dynamic memory"
```

---

## Task 6: YAML Frontmatter Command Parser

Parse Claude Code-style command files: YAML frontmatter metadata + Markdown body prompt.

**Files:**
- Create: `src/commands/parser.js`
- Create: `tests/commands-parser.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/commands-parser.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseCommandFile, loadCommandsFromDir } from '../src/commands/parser.js';

test('parses YAML frontmatter + markdown body', () => {
  const raw = `---
description: Review code changes
allowed-tools: Read, Bash(git:*)
model: sonnet
---

Review each file for quality issues.
Provide line numbers and severity.`;

  const cmd = parseCommandFile('review', raw);
  assert.equal(cmd.name, 'review');
  assert.equal(cmd.description, 'Review code changes');
  assert.deepEqual(cmd.allowedTools, ['Read', 'Bash(git:*)']);
  assert.equal(cmd.model, 'sonnet');
  assert.ok(cmd.prompt.includes('Review each file'));
});

test('handles missing frontmatter as pure prompt', () => {
  const cmd = parseCommandFile('simple', 'Just do the thing.');
  assert.equal(cmd.name, 'simple');
  assert.equal(cmd.prompt, 'Just do the thing.');
});

test('parses argument-hint field', () => {
  const raw = `---
description: Fix an issue
argument-hint: [issue-number]
---
Fix issue #$ARGUMENTS.`;
  const cmd = parseCommandFile('fix', raw);
  assert.equal(cmd.argumentHint, '[issue-number]');
  assert.ok(cmd.prompt.includes('$ARGUMENTS'));
});

test('loadCommandsFromDir reads .md files from directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-cmd-'));
  const cmdDir = path.join(root, 'commands');
  await mkdir(cmdDir, { recursive: true });
  await writeFile(path.join(cmdDir, 'deploy.md'), `---
description: Deploy to production
allowed-tools: Bash(git push:*)
---
Push to main and deploy.`);

  const commands = await loadCommandsFromDir(cmdDir);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, 'deploy');
  assert.equal(commands[0].description, 'Deploy to production');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/commands-parser.test.js`
Expected: FAIL

- [ ] **Step 3: Implement command parser**

```javascript
// src/commands/parser.js
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function parseAllowedTools(raw) {
  if (!raw) return [];
  // Handle both "Read, Write" and "[Read, Write]" formats
  const cleaned = raw.replace(/^\[/, '').replace(/\]$/, '');
  return cleaned.split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

export function parseCommandFile(name, content) {
  const { meta, body } = parseFrontmatter(content);
  return {
    name,
    description: meta.description ?? '',
    allowedTools: parseAllowedTools(meta['allowed-tools']),
    model: meta.model ?? 'inherit',
    argumentHint: meta['argument-hint'] ?? '',
    disableModelInvocation: meta['disable-model-invocation'] === 'true',
    prompt: body,
  };
}

export async function loadCommandsFromDir(dirPath) {
  const files = await readdir(dirPath).catch(() => []);
  const commands = [];
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const content = await readFile(path.join(dirPath, file), 'utf8');
    const name = file.replace(/\.md$/, '');
    commands.push(parseCommandFile(name, content));
  }
  return commands;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/commands-parser.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/parser.js tests/commands-parser.test.js
git commit -m "feat: add YAML frontmatter command parser for Claude Code-style .md commands"
```

---

## Task 7: Three-Level Skill Loading

Skills load progressively: metadata always → SKILL.md on demand → references when deep.

**Files:**
- Create: `src/skills/loader.js`
- Create: `tests/skills.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/skills.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SkillLoader } from '../src/skills/loader.js';

async function makeSkillDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-skill-'));
  const skillDir = path.join(root, 'skills', 'hook-dev');
  await mkdir(skillDir, { recursive: true });
  await mkdir(path.join(skillDir, 'references'), { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `---
name: hook-development
description: This skill should be used when the user asks to "create a hook" or "add a PreToolUse hook".
version: 0.1.0
---

# Hook Development

Create hooks by defining event types and matchers.

## Quick Reference
| Event | When |
|-------|------|
| PreToolUse | Before tool runs |`);
  await writeFile(path.join(skillDir, 'references', 'patterns.md'), `# Hook Patterns\n\nDetailed pattern documentation here.`);
  return { root, skillsDir: path.join(root, 'skills') };
}

test('Level 1: loads skill metadata without body', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  const skills = await loader.discoverSkills();
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'hook-development');
  assert.ok(skills[0].description.includes('create a hook'));
  assert.equal(skills[0].body, undefined);
});

test('Level 2: loads skill body on demand', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  const skill = await loader.loadSkill('hook-dev');
  assert.ok(skill.body.includes('Hook Development'));
  assert.ok(skill.body.includes('Quick Reference'));
});

test('Level 3: loads references on deep request', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  const refs = await loader.loadReferences('hook-dev');
  assert.equal(refs.length, 1);
  assert.ok(refs[0].content.includes('Hook Patterns'));
});

test('matchSkill finds skill by trigger phrases', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  await loader.discoverSkills();
  const match = loader.matchSkill('I want to create a hook');
  assert.equal(match.name, 'hook-development');
});

test('matchSkill returns null for no match', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  await loader.discoverSkills();
  const match = loader.matchSkill('deploy to production');
  assert.equal(match, null);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/skills.test.js`
Expected: FAIL

- [ ] **Step 3: Implement SkillLoader**

```javascript
// src/skills/loader.js
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
  }
  return { meta, body: match[2].trim() };
}

export class SkillLoader {
  #skillsDir;
  #metadata = new Map();

  constructor(skillsDir) {
    this.#skillsDir = skillsDir;
  }

  // Level 1: Discover all skills, load only metadata
  async discoverSkills() {
    const entries = await readdir(this.#skillsDir, { withFileTypes: true }).catch(() => []);
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(this.#skillsDir, entry.name, 'SKILL.md');
      const content = await readFile(skillPath, 'utf8').catch(() => null);
      if (!content) continue;
      const { meta } = parseFrontmatter(content);
      const metadata = {
        dir: entry.name,
        name: meta.name ?? entry.name,
        description: meta.description ?? '',
        version: meta.version ?? '0.0.0',
      };
      this.#metadata.set(entry.name, metadata);
      skills.push(metadata);
    }
    return skills;
  }

  // Level 2: Load full SKILL.md body
  async loadSkill(dirName) {
    const skillPath = path.join(this.#skillsDir, dirName, 'SKILL.md');
    const content = await readFile(skillPath, 'utf8');
    const { meta, body } = parseFrontmatter(content);
    return {
      dir: dirName,
      name: meta.name ?? dirName,
      description: meta.description ?? '',
      version: meta.version ?? '0.0.0',
      body,
    };
  }

  // Level 3: Load reference files
  async loadReferences(dirName) {
    const refDir = path.join(this.#skillsDir, dirName, 'references');
    const files = await readdir(refDir).catch(() => []);
    const refs = [];
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      const content = await readFile(path.join(refDir, file), 'utf8');
      refs.push({ file, content });
    }
    return refs;
  }

  // Match a user query to a skill by checking description keywords
  matchSkill(query) {
    const lower = query.toLowerCase();
    for (const [, meta] of this.#metadata) {
      // Extract quoted trigger phrases from description
      const triggers = [...meta.description.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
      if (triggers.some((t) => lower.includes(t))) return meta;
      // Fallback: word overlap
      const descWords = meta.description.toLowerCase().split(/\s+/);
      const queryWords = lower.split(/\s+/);
      const overlap = queryWords.filter((w) => descWords.includes(w) && w.length > 3).length;
      if (overlap >= 2) return meta;
    }
    return null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/skills.test.js`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/loader.js tests/skills.test.js
git commit -m "feat: add three-level progressive skill loading system"
```

---

## Task 8: Enhanced Agent Manager

Add description-driven routing, tool restrictions, and model selection — matching Claude Code's agent definition pattern.

**Files:**
- Modify: `src/agents/manager.js`

- [ ] **Step 1: Update AgentManager with enhanced spawn**

```javascript
// src/agents/manager.js — replace entire file
export class AgentManager {
  #agents = new Map();

  constructor(initialAgents = []) {
    initialAgents.forEach((agent) => this.#agents.set(agent.id, agent));
  }

  spawn({
    role = 'executor',
    scope = 'default',
    status = 'idle',
    id,
    prompt = '',
    model = 'inherit',
    tools = [],
    description = '',
    color = 'blue',
  } = {}) {
    const agentId = id ?? `agent-${this.#agents.size + 1}`;
    const agent = {
      id: agentId,
      role,
      scope,
      status,
      prompt,
      model,
      tools,
      description,
      color,
      createdAt: new Date().toISOString(),
    };
    this.#agents.set(agent.id, agent);
    return agent;
  }

  update(id, patch) {
    const current = this.#agents.get(id);
    if (!current) throw new Error(`Unknown agent: ${id}`);
    const next = { ...current, ...patch };
    this.#agents.set(id, next);
    return next;
  }

  get(id) {
    return this.#agents.get(id);
  }

  // Description-driven routing: find best agent for a task
  matchAgent(query) {
    const lower = query.toLowerCase();
    let best = null;
    let bestScore = 0;
    for (const agent of this.#agents.values()) {
      const desc = (agent.description + ' ' + agent.role).toLowerCase();
      const words = lower.split(/\s+/);
      const score = words.filter((w) => desc.includes(w) && w.length > 2).length;
      if (score > bestScore) { best = agent; bestScore = score; }
    }
    return best;
  }

  list() {
    return [...this.#agents.values()];
  }

  snapshot() {
    return this.list();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/agents/manager.js
git commit -m "feat: enhance AgentManager with model/tools/description fields and routing"
```

---

## Task 9: Wire Everything into Runtime

Connect hooks, prompt builder, memory, skills, command parser, and enhanced loop into runtime.js.

**Files:**
- Modify: `src/kernel/runtime.js`
- Modify: `tests/runtime.test.js`

- [ ] **Step 1: Update runtime.js to wire all new systems**

```javascript
// src/kernel/runtime.js — replace entire file
import path from 'node:path';
import { EventBus } from './events.js';
import { HookDispatcher } from './hooks.js';
import { AgentLoop } from './loop.js';
import { SystemPromptBuilder } from './prompt.js';
import { createContextEnvelope } from './context.js';
import { createSession } from './session.js';
import { PermissionEngine } from '../permissions/engine.js';
import { TaskStore } from '../tasks/store.js';
import { AgentManager } from '../agents/manager.js';
import { PluginLoader } from '../plugins/loader.js';
import { ProviderRegistry, createProviderBlueprint } from '../providers/index.js';
import { loadProviderConfig } from '../providers/config.js';
import { ToolRegistry } from '../tools/registry.js';
import { createBuiltinTools } from '../tools/builtins/index.js';
import { createCapabilityMap } from '../capabilities/index.js';
import { createCommandRegistry, CommandRegistry } from '../commands/registry.js';
import { createWorkspaceBlueprint } from '../workspace/index.js';
import { createBridgeBlueprint } from '../bridge/index.js';
import { createReplBlueprint } from '../ui/repl.js';
import { createTelemetrySink } from '../telemetry/index.js';
import { StateStore } from '../state/store.js';
import { loadPolicyFile, mergePolicy } from '../permissions/policy.js';
import { getSandboxProfile } from '../permissions/profiles.js';
import { diagnosePluginConflicts } from '../plugins/diagnostics.js';
import { MemoryManager } from '../memory/index.js';
import { SkillLoader } from '../skills/loader.js';

function createSnapshot(runtime) {
  return {
    session: runtime.session,
    tasks: runtime.tasks.snapshot(),
    agents: runtime.agents.snapshot(),
    permissions: runtime.permissions.snapshot(),
    plugins: runtime.plugins.snapshot(),
    hooks: runtime.hooks.snapshot(),
  };
}

export async function createRuntime(options = {}) {
  const stateDir = options.stateDir ?? path.join(options.session?.cwd ?? process.cwd(), '.starkharness');
  const state = new StateStore({ rootDir: stateDir });
  await state.init();

  const resumed = options.resumeSessionId
    ? await state.loadSession(options.resumeSessionId)
    : null;
  const runtimeSnapshot = options.resumeSessionId
    ? await state.loadRuntimeSnapshot().catch(() => ({ tasks: [], agents: [], permissions: {}, plugins: [] }))
    : { tasks: [], agents: [], permissions: {}, plugins: [] };
  const filePolicy = await loadPolicyFile(options.policyPath, { includeDefaults: false });
  const providerConfig = await loadProviderConfig(options.providerConfigPath);
  const profilePolicy = getSandboxProfile(options.sandboxProfile);
  const policy = mergePolicy(profilePolicy, filePolicy);

  const events = new EventBus();
  const hooks = new HookDispatcher();
  const permissions = new PermissionEngine({ ...runtimeSnapshot.permissions, ...policy, ...options.permissions });
  const tasks = new TaskStore(runtimeSnapshot.tasks ?? []);
  const agents = new AgentManager(runtimeSnapshot.agents ?? []);
  const plugins = new PluginLoader(runtimeSnapshot.plugins ?? []);
  const providers = new ProviderRegistry(providerConfig);
  const tools = new ToolRegistry();
  const promptBuilder = new SystemPromptBuilder();

  // Memory
  const cwd = options.session?.cwd ?? process.cwd();
  const memory = new MemoryManager({ projectDir: cwd });

  // Skills
  const skillsDir = path.join(cwd, 'skills');
  const skills = new SkillLoader(skillsDir);

  for (const provider of createProviderBlueprint()) {
    providers.register(provider);
  }
  for (const tool of createBuiltinTools()) {
    tools.register(tool);
  }

  const telemetry = createTelemetrySink({ rootDir: stateDir });
  await telemetry.init();

  const session = resumed ?? createSession(options.session);
  const context = createContextEnvelope({ cwd: session.cwd, mode: session.mode });

  if (options.pluginManifestPath) {
    await plugins.loadManifestFile(options.pluginManifestPath);
  }
  for (const plugin of options.plugins ?? []) {
    plugins.register(plugin);
  }
  tools.registerPluginTools(plugins.listTools());
  const pluginDiagnostics = diagnosePluginConflicts(plugins);

  const commands = new CommandRegistry(createCommandRegistry());
  commands.registerPluginCommands(plugins.listCommands());

  // Register hook handlers from options
  for (const [eventName, hookList] of Object.entries(options.hooks ?? {})) {
    for (const hook of Array.isArray(hookList) ? hookList : [hookList]) {
      hooks.register(eventName, hook);
    }
  }

  // Fire SessionStart hooks
  const sessionStartResult = await hooks.fire('SessionStart', { sessionId: session.id, cwd: session.cwd });

  // Build system prompt
  const { claudeMd, memoryString } = await memory.toPromptStrings();
  const systemPrompt = promptBuilder.build({
    tools: tools.toSchemaList(),
    claudeMd,
    memory: memoryString,
    hookContext: sessionStartResult.additionalContext ?? '',
    cwd: session.cwd,
  });
  context.systemPrompt = systemPrompt;

  // Agent loop
  const loop = new AgentLoop({ hooks, tools, permissions });

  const runtime = {
    session,
    context,
    events,
    hooks,
    loop,
    permissions,
    tasks,
    agents,
    plugins,
    providers,
    pluginDiagnostics,
    tools,
    telemetry,
    state,
    commands,
    memory,
    skills,
    promptBuilder,
    capabilities: createCapabilityMap(),
    workspace: createWorkspaceBlueprint(),
    bridge: createBridgeBlueprint(),
    ui: createReplBlueprint(),
    async persist() {
      await this.state.saveSession(this.session);
      await this.state.saveRuntimeSnapshot(createSnapshot(this));
    },
    async log(eventName, payload) {
      return this.telemetry.emit(eventName, payload);
    },
    async dispatchTurn(turn) {
      await this.log('turn:start', turn);
      const tool = this.tools.get(turn.tool);
      if (!tool) throw new Error(`Unknown tool: ${turn.tool}`);

      const gate = this.permissions.evaluate({ capability: tool.capability, toolName: tool.name });
      if (gate.decision === 'deny') {
        const denied = { ok: false, reason: 'permission-denied', tool: tool.name, gate };
        await this.log('turn:denied', denied);
        return denied;
      }
      if (gate.decision === 'ask') {
        const gated = { ok: false, reason: 'permission-escalation-required', tool: tool.name, gate };
        await this.log('turn:gated', gated);
        return gated;
      }

      // PreToolUse hook
      const preResult = await this.hooks.fire('PreToolUse', { toolName: tool.name, toolInput: turn.input });
      if (preResult.decision === 'deny') {
        const denied = { ok: false, reason: 'hook-denied', tool: tool.name, hookReason: preResult.reason };
        await this.log('turn:hook-denied', denied);
        return denied;
      }

      const result = await tool.execute(preResult.updatedInput ?? turn.input, this);

      // PostToolUse hook
      await this.hooks.fire('PostToolUse', { toolName: tool.name, toolInput: turn.input, toolResult: result });

      this.session.turns.push({ turn, result, recordedAt: new Date().toISOString() });
      await this.persist();
      await this.log('turn:complete', { turn, result });
      return result;
    },
    async dispatchCommand(name, args = {}) {
      await this.log('command:start', { name, args });
      const result = await this.commands.dispatch(name, this, args);
      await this.log('command:complete', { name, args, result });
      return result;
    },
  };

  loop.setRuntime(runtime);
  await runtime.persist();
  await runtime.log('runtime:boot', { sessionId: runtime.session.id, stateDir, resumed: Boolean(options.resumeSessionId) });
  return runtime;
}

export function createBlueprintDocument(runtime) {
  return {
    name: 'StarkHarness',
    session: runtime.session,
    kernel: ['session', 'runtime', 'loop', 'context', 'events', 'hooks', 'prompt'],
    commands: runtime.commands.list(),
    providers: runtime.providers.list(),
    tools: runtime.tools.list().map(({ name, capability, description }) => ({ name, capability, description })),
    capabilities: runtime.capabilities,
    workspace: runtime.workspace,
    bridge: runtime.bridge,
    ui: runtime.ui,
    orchestration: {
      taskCount: runtime.tasks.list().length,
      agentCount: runtime.agents.list().length,
      pluginCount: runtime.plugins.list().length,
      commandCount: runtime.commands.list().length,
      toolCount: runtime.tools.list().length,
      hookEventCount: runtime.hooks.listEvents().length,
      pluginConflictCount: runtime.pluginDiagnostics.commandConflicts.length + runtime.pluginDiagnostics.toolConflicts.length,
    },
    policy: runtime.permissions.snapshot(),
    plugins: {
      count: runtime.plugins.list().length,
      capabilities: runtime.plugins.listCapabilities(),
      commands: runtime.plugins.listCommands(),
      tools: runtime.plugins.listTools(),
      diagnostics: runtime.pluginDiagnostics,
    },
    persistence: {
      rootDir: runtime.state.rootDir,
      sessionPath: runtime.state.getSessionPath(runtime.session.id),
      runtimePath: runtime.state.runtimePath,
      transcriptPath: runtime.telemetry.transcriptPath,
    },
  };
}
```

- [ ] **Step 2: Update existing tests for new session ID format**

The `createSession` now uses `randomBytes` so session IDs are `sh-<hex>` instead of `sh-<counter>`. The existing tests use `runtime.session.id` dynamically so they should still work, but run them to verify.

Run: `node --test tests/runtime.test.js`

Fix any failures caused by the refactored imports or changed interfaces.

- [ ] **Step 3: Run all tests**

Run: `node --test`
Expected: All tests pass (hooks, tools-schema, prompt, loop, memory, skills, commands-parser, runtime)

- [ ] **Step 4: Commit**

```bash
git add src/kernel/runtime.js
git commit -m "feat: wire hooks, prompt builder, memory, skills into unified runtime"
```

---

## Task 10: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README to reflect new architecture**

```markdown
# StarkHarness

An atomic, high-intensity harness scaffold for building Claude Code-class coding runtimes. Full feature parity is a product goal. Kernel size is aggressively minimized.

## Architecture

```
Kernel:    session → runtime → loop → context → events → hooks → prompt
Control:   permissions/engine → tasks/store → agents/manager → plugins/loader
Tools:     types (JSON Schema) → registry → builtins (10 tools)
Memory:    CLAUDE.md (static) → auto-memory (dynamic, YAML frontmatter)
Skills:    3-level progressive loading (metadata → body → references)
Commands:  YAML frontmatter + Markdown body parser
Providers: anthropic → openai → compatible (pluggable)
```

## Claude Code Harness Alignment

| Mechanism | Claude Code | StarkHarness |
|-----------|-------------|-------------|
| Hook System | 9 lifecycle events, command/prompt types | `HookDispatcher` with 9 events + matchers |
| Tool Schema | JSON Schema per tool for LLM | `inputSchema` on every `defineTool` |
| System Prompt | CLAUDE.md + tools + memory + hooks | `SystemPromptBuilder` composing all sources |
| Turn Loop | PreToolUse → Execute → PostToolUse | `AgentLoop.executeTurn()` with full hook chain |
| Permissions | allow/ask/deny + tool-level override | `PermissionEngine` with policy files + profiles |
| Memory | CLAUDE.md + auto-memory frontmatter | `MemoryManager` with identical pattern |
| Skills | 3-level progressive disclosure | `SkillLoader` with discover → load → references |
| Commands | YAML frontmatter + MD prompt | `parseCommandFile` with allowed-tools whitelist |
| Agents | description routing, model/tools fields | `AgentManager.matchAgent()` + spawn options |
| Plugins | folder manifest + conflict detection | `PluginLoader` with diagnostics |

## Running

```bash
npm test                              # Run all tests
node src/main.js blueprint            # Print module blueprint
node src/main.js doctor               # Validate harness wiring
```

## What comes next

1. Real LLM provider integration (Anthropic Messages API with tool_use).
2. MCP protocol bridge (stdio, SSE, HTTP, WebSocket).
3. REPL with interactive permission prompts.
4. Transcript replay execution engine.
5. Plugin auto-discovery from folder conventions.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README to reflect Claude Code harness alignment"
```

---

## Task 11: Final Integration Test

Run all tests, fix any breakage, verify the full harness boots.

- [ ] **Step 1: Run full test suite**

Run: `node --test`

- [ ] **Step 2: Run blueprint command**

Run: `node src/main.js blueprint`
Expected: JSON output showing hooks, prompt builder, memory, skills in the blueprint

- [ ] **Step 3: Run doctor command**

Run: `node src/main.js doctor`
Expected: Shows hookEventCount: 9 and all new surfaces

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration fixes for full harness alignment"
```

- [ ] **Step 5: Push to GitHub**

```bash
git push origin main
```
