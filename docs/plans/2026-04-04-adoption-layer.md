# Adoption Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform StarkHarness from a strong runtime kernel into a usable system — starter assets, unified diagnostics, auto-loading from filesystem, MCP integration, and production-grade provider config.

**Architecture:** Five independent feature tracks that can be built sequentially. Each adds a self-contained layer without breaking existing tests. Zero new dependencies.

**Tech Stack:** Node.js 20+, zero dependencies, node:test

---

## File Structure

### New files
- `starter/commands/code-review.md` — Slash command template
- `starter/commands/refactor.md` — Slash command template
- `starter/commands/security-audit.md` — Slash command template
- `starter/commands/bug-investigation.md` — Slash command template
- `starter/commands/release-checklist.md` — Slash command template
- `starter/hooks/pre-shell-guard.js` — Example PreToolUse hook
- `starter/hooks/post-log-usage.js` — Example PostToolUse hook
- `starter/skills/code-review/SKILL.md` — Skill pack
- `starter/skills/refactor/SKILL.md` — Skill pack
- `starter/plugins/browser-pack.json` — Plugin manifest
- `starter/memory/CLAUDE.md` — Starter CLAUDE.md
- `starter/memory/memory/coding-style.md` — Starter memory file
- `starter/memory/memory/MEMORY.md` — Starter memory index
- `starter/config/policy.json` — Default policy
- `starter/config/providers.json` — Provider config template
- `examples/01-first-hook.js` — Runnable example
- `examples/02-custom-command.js` — Runnable example
- `examples/03-plugin-loading.js` — Runnable example
- `examples/04-agent-run.js` — Runnable example
- `examples/05-mcp-server.js` — Runnable example (Task 4)
- `src/commands/diagnostics.js` — Registry diagnostics command
- `src/commands/loader.js` — Filesystem command auto-loader
- `src/skills/binder.js` — Skills runtime binding into agent loop
- `src/mcp/client.js` — MCP stdio transport client
- `src/mcp/config.js` — MCP config loader
- `src/mcp/tools.js` — MCP tool/resource mapper to tool registry
- `src/providers/strategy.js` — Model selection + retry + timeout
- `tests/diagnostics.test.js` — Diagnostics tests
- `tests/command-loader.test.js` — Command auto-loading tests
- `tests/skill-binder.test.js` — Skill binding tests
- `tests/mcp.test.js` — MCP tests
- `tests/provider-strategy.test.js` — Provider strategy tests

### Modified files
- `src/kernel/runtime.js` — Wire diagnostics, command loader, skill binder, MCP, provider strategy
- `src/kernel/runner.js` — Integrate skill binding into run loop
- `src/commands/registry.js` — Add registry and diagnostics commands
- `src/providers/index.js` — Integrate strategy layer

---

## Task 1: Starter Templates + Examples

Ready-to-use assets that let users understand and adopt StarkHarness immediately. No runtime changes.

**Files:**
- Create: `starter/` directory tree (all templates)
- Create: `examples/01-first-hook.js` through `examples/04-agent-run.js`

- [ ] **Step 1: Create starter command templates**

```markdown
<!-- starter/commands/code-review.md -->
---
description: Review code changes for bugs, style issues, and improvements
allowed-tools: [read_file, search, glob]
model: inherit
---

Review the code changes in the current workspace. Focus on:
1. Logic errors and potential bugs
2. Code style consistency
3. Missing error handling at system boundaries
4. Security concerns (injection, XSS, etc.)

Provide a structured report with severity levels: critical, important, suggestion.
```

```markdown
<!-- starter/commands/refactor.md -->
---
description: Refactor code for clarity and maintainability
allowed-tools: [read_file, write_file, edit_file, search, glob]
model: inherit
---

Refactor the specified code to improve clarity and maintainability while preserving all behavior.
Follow these principles:
- Extract only when duplication is real (3+ instances)
- Prefer smaller, focused files over large ones
- Don't add abstractions for hypothetical future needs
- Ensure tests still pass after every change
```

```markdown
<!-- starter/commands/security-audit.md -->
---
description: Audit workspace for common security vulnerabilities
allowed-tools: [read_file, search, glob]
model: inherit
---

Audit the workspace for OWASP Top 10 vulnerabilities and Node.js-specific security issues:
1. Command injection (child_process, exec, eval)
2. Path traversal (unsanitized user paths)
3. SQL/NoSQL injection
4. XSS in any HTML/template output
5. Sensitive data exposure (hardcoded secrets, .env in git)
6. Insecure dependencies (if package.json exists)

Report each finding with file path, line, severity, and remediation.
```

```markdown
<!-- starter/commands/bug-investigation.md -->
---
description: Investigate a bug systematically
allowed-tools: [read_file, search, glob, shell]
model: inherit
---

Investigate the described bug using this process:
1. Reproduce: identify the trigger condition
2. Isolate: narrow to the smallest failing case
3. Trace: follow the execution path from input to bug
4. Root cause: identify what is wrong and why
5. Fix: propose the minimal change that fixes the root cause
6. Verify: confirm the fix works and no regressions
```

```markdown
<!-- starter/commands/release-checklist.md -->
---
description: Validate a release candidate before shipping
allowed-tools: [read_file, search, glob, shell]
model: inherit
---

Run through the release checklist:
1. All tests pass (`npm test` or equivalent)
2. No TODO/FIXME/HACK comments in changed files
3. CHANGELOG/README updated if needed
4. No console.log/debug statements left in
5. Dependencies are locked (lockfile up to date)
6. No secrets or credentials in committed files
7. Version numbers bumped if applicable
```

- [ ] **Step 2: Create starter hooks**

```javascript
// starter/hooks/pre-shell-guard.js
// PreToolUse hook that blocks dangerous shell commands
export default {
  event: 'PreToolUse',
  matcher: 'shell',
  async handler({ toolInput }) {
    const dangerous = ['rm -rf', 'mkfs', 'dd if=', ':(){', 'chmod -R 777', '> /dev/sd'];
    const cmd = toolInput?.command ?? '';
    for (const pattern of dangerous) {
      if (cmd.includes(pattern)) {
        return { decision: 'deny', reason: `Blocked dangerous command pattern: ${pattern}` };
      }
    }
    return { decision: 'allow' };
  },
};
```

```javascript
// starter/hooks/post-log-usage.js
// PostToolUse hook that logs tool execution for observability
export default {
  event: 'PostToolUse',
  matcher: '*',
  async handler({ toolName, toolResult }) {
    const ok = toolResult?.ok ?? false;
    const ts = new Date().toISOString();
    console.error(`[${ts}] tool=${toolName} ok=${ok}`);
    return { decision: 'allow' };
  },
};
```

- [ ] **Step 3: Create starter skills**

```markdown
<!-- starter/skills/code-review/SKILL.md -->
---
name: code-review
description: Systematic code review with structured output
version: 0.1.0
---

# Code Review Skill

Review code changes systematically:

1. **Read** all changed files
2. **Categorize** findings: critical / important / suggestion
3. **Report** with file path, line number, and remediation

Focus areas:
- Correctness: logic errors, edge cases, off-by-ones
- Security: injection, path traversal, secret exposure
- Style: naming, dead code, unnecessary complexity
- Testing: uncovered paths, brittle assertions
```

```markdown
<!-- starter/skills/refactor/SKILL.md -->
---
name: refactor
description: Refactor code following DRY, YAGNI, and single-responsibility
version: 0.1.0
---

# Refactor Skill

Guide refactoring decisions:

1. **Identify** what to change and why
2. **Extract** only when duplication is real (3+ sites)
3. **Split** files that exceed ~300 lines or have multiple responsibilities
4. **Verify** tests pass after every change
5. **Commit** in small, reviewable chunks

Rules:
- Don't add abstractions for hypothetical future needs
- Three similar lines is better than a premature abstraction
- Follow existing patterns in the codebase
```

- [ ] **Step 4: Create starter config and memory**

```json
// starter/plugins/browser-pack.json
{
  "name": "browser-pack",
  "version": "0.1.0",
  "capabilities": ["browser", "dom-inspect"],
  "tools": [
    {
      "name": "browser_navigate",
      "capability": "network",
      "description": "Navigate to a URL in headless browser"
    }
  ]
}
```

```json
// starter/config/policy.json
{
  "read": "allow",
  "write": "ask",
  "exec": "ask",
  "network": "ask",
  "delegate": "allow"
}
```

```json
// starter/config/providers.json
{
  "anthropic": {
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 8192
  },
  "openai": {
    "model": "gpt-4o",
    "baseUrl": "https://api.openai.com/v1"
  }
}
```

```markdown
<!-- starter/memory/CLAUDE.md -->
# CLAUDE.md

## Project

This project uses StarkHarness as its agent runtime.

## Conventions

- Zero dependencies — use Node.js built-ins only
- All tests use `node:test` and `node:assert/strict`
- Run `node --test` to execute the test suite
- Commit messages follow conventional commits (feat:, fix:, docs:)

## Permissions

- Read tools: always allowed
- Write/exec tools: ask before executing
- Shell commands: review before running
```

```markdown
<!-- starter/memory/memory/MEMORY.md -->
# Memory Index

## Feedback
- [Coding Style](coding-style.md) — Prefer small focused files, no premature abstractions
```

```markdown
<!-- starter/memory/memory/coding-style.md -->
---
name: Coding Style Preferences
description: Code style rules — small files, no premature abstractions, DRY at 3+
type: feedback
---

Prefer small, focused files over large monoliths.
Don't add abstractions until duplication reaches 3+ instances.
Three similar lines of code is better than a premature utility.

**Why:** Premature abstractions create coupling and reduce clarity.
**How to apply:** When tempted to extract a helper, check if there are truly 3+ call sites.
```

- [ ] **Step 5: Create runnable examples**

```javascript
// examples/01-first-hook.js
// Demonstrates registering a PreToolUse hook that guards shell commands
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'hook demo' },
  permissions: { exec: 'allow' },
  hooks: {
    PreToolUse: {
      matcher: 'shell',
      handler: async ({ toolInput }) => {
        console.log(`[hook] Shell command requested: ${toolInput.command}`);
        if (toolInput.command.includes('rm')) {
          console.log('[hook] Blocked dangerous command');
          return { decision: 'deny', reason: 'rm commands blocked' };
        }
        return { decision: 'allow' };
      },
    },
  },
});

// This will succeed
const ok = await runHarnessTurn(runtime, { tool: 'shell', input: { command: 'echo hello' } });
console.log('echo result:', ok.ok, ok.stdout?.trim());

// This will be denied by the hook
const denied = await runHarnessTurn(runtime, { tool: 'shell', input: { command: 'rm -rf /tmp/test' } });
console.log('rm result:', denied.ok, denied.reason);
```

```javascript
// examples/02-custom-command.js
// Demonstrates registering a custom command at runtime
import { createRuntime } from '../src/kernel/runtime.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'command demo' },
});

// Register a custom command
runtime.commands.register({
  name: 'greet',
  description: 'Say hello',
  async execute(rt, args) {
    return { message: `Hello from session ${rt.session.id}!`, args };
  },
});

const result = await runtime.dispatchCommand('greet', { name: 'world' });
console.log(JSON.stringify(result, null, 2));
```

```javascript
// examples/03-plugin-loading.js
// Demonstrates loading a plugin with custom tools and commands
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'plugin demo' },
  plugins: [
    {
      name: 'demo-pack',
      version: '0.1.0',
      capabilities: ['format'],
      tools: [{ name: 'format_code', capability: 'write', output: 'formatted' }],
      commands: [{ name: 'plugin:status', description: 'Plugin status', output: 'active' }],
    },
  ],
});

// Use plugin tool
const toolResult = await runHarnessTurn(runtime, { tool: 'format_code', input: { lang: 'js' } });
console.log('Plugin tool:', toolResult);

// Use plugin command
const cmdResult = await runtime.dispatchCommand('plugin:status');
console.log('Plugin command:', cmdResult);

// Show diagnostics
const plugins = await runtime.dispatchCommand('plugins');
console.log('Plugins:', JSON.stringify(plugins, null, 2));
```

```javascript
// examples/04-agent-run.js
// Demonstrates the full agent run loop (requires ANTHROPIC_API_KEY)
import { createRuntime } from '../src/kernel/runtime.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('Set ANTHROPIC_API_KEY to run this example');
  console.log('Example: ANTHROPIC_API_KEY=sk-ant-... node examples/04-agent-run.js');
  process.exit(0);
}

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'agent run demo' },
  permissions: { read: 'allow', write: 'allow' },
});

const result = await runtime.run('What files are in the src/kernel directory? List them briefly.');
console.log('Final answer:', result.finalText);
console.log('Tool turns:', result.turns.length);
console.log('Stop reason:', result.stopReason);
```

- [ ] **Step 6: Commit**

```bash
git add starter/ examples/
git commit -m "feat: add starter templates and runnable examples"
```

---

## Task 2: Registry Diagnostics Command

A single `registry` command that shows the complete state of all registries.

**Files:**
- Create: `src/commands/diagnostics.js`
- Create: `tests/diagnostics.test.js`
- Modify: `src/commands/registry.js` — add `registry` command

- [ ] **Step 1: Write failing tests**

```javascript
// tests/diagnostics.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnostics } from '../src/commands/diagnostics.js';

test('buildDiagnostics returns complete registry snapshot', () => {
  const mockRuntime = {
    tools: { list: () => [{ name: 'read_file', capability: 'read' }] },
    commands: { list: () => [{ name: 'blueprint' }] },
    providers: { list: () => [{ id: 'anthropic' }] },
    plugins: {
      list: () => [{ name: 'test-pack' }],
      listCapabilities: () => [{ capability: 'test', plugin: 'test-pack' }],
    },
    hooks: {
      listEvents: () => ['PreToolUse'],
      listHandlers: () => [{ event: 'PreToolUse', matcher: '*', count: 1 }],
    },
    skills: { listDiscovered: () => [{ name: 'review' }] },
    permissions: { snapshot: () => ({ read: 'allow' }) },
    pluginDiagnostics: { commandConflicts: [], toolConflicts: [] },
    session: { id: 'sh-abc123' },
  };

  const diag = buildDiagnostics(mockRuntime);
  assert.equal(diag.tools.length, 1);
  assert.equal(diag.commands.length, 1);
  assert.equal(diag.providers.length, 1);
  assert.equal(diag.plugins.length, 1);
  assert.equal(diag.hooks.events.length, 1);
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
    hooks: { listEvents: () => [], listHandlers: () => [] },
    permissions: { snapshot: () => ({}) },
    pluginDiagnostics: { commandConflicts: [], toolConflicts: [] },
    session: { id: 'sh-min' },
  };

  const diag = buildDiagnostics(minRuntime);
  assert.equal(diag.tools.length, 0);
  assert.equal(diag.skills.length, 0);
});
```

- [ ] **Step 2: Implement diagnostics**

```javascript
// src/commands/diagnostics.js

export function buildDiagnostics(runtime) {
  return {
    session: runtime.session.id,
    tools: runtime.tools.list().map(({ name, capability, description }) => ({ name, capability, description })),
    commands: runtime.commands.list(),
    providers: runtime.providers.list(),
    plugins: runtime.plugins.list(),
    pluginCapabilities: runtime.plugins.listCapabilities(),
    hooks: {
      events: runtime.hooks.listEvents(),
      handlers: runtime.hooks.listHandlers?.() ?? [],
    },
    skills: runtime.skills?.listDiscovered?.() ?? [],
    policy: runtime.permissions.snapshot(),
    conflicts: {
      commands: runtime.pluginDiagnostics.commandConflicts,
      tools: runtime.pluginDiagnostics.toolConflicts,
    },
  };
}
```

- [ ] **Step 3: Add registry command to registry.js**

Add to `createCommandRegistry()`:

```javascript
{
  name: 'registry',
  description: 'Show complete state of all registries — tools, commands, providers, plugins, hooks, skills, policy, conflicts',
  async execute(runtime) {
    const { buildDiagnostics } = await import('./diagnostics.js');
    return buildDiagnostics(runtime);
  },
},
```

- [ ] **Step 4: Add listHandlers to HookDispatcher**

The diagnostics need `hooks.listHandlers()`. Add to `src/kernel/hooks.js`:

```javascript
listHandlers() {
  const result = [];
  for (const [event, handlers] of this.#handlers) {
    for (const h of handlers) {
      result.push({ event, matcher: h.matcher ?? '*' });
    }
  }
  return result;
}
```

- [ ] **Step 5: Add listDiscovered to SkillLoader**

```javascript
listDiscovered() {
  return [...this.#metadata.values()];
}
```

- [ ] **Step 6: Run tests, commit**

```bash
node --test
git add src/commands/diagnostics.js src/commands/registry.js src/kernel/hooks.js src/skills/loader.js tests/diagnostics.test.js
git commit -m "feat: add unified registry diagnostics command"
```

---

## Task 3: Commands/Skills Filesystem Auto-Loading

Auto-discover commands from `.starkharness/commands/` and project `commands/` directories. Auto-discover skills at boot.

**Files:**
- Create: `src/commands/loader.js`
- Create: `src/skills/binder.js`
- Create: `tests/command-loader.test.js`
- Create: `tests/skill-binder.test.js`
- Modify: `src/kernel/runtime.js` — wire auto-loading at boot
- Modify: `src/kernel/runner.js` — integrate skill binding into run loop

- [ ] **Step 1: Write command loader tests**

```javascript
// tests/command-loader.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { discoverCommands } from '../src/commands/loader.js';

test('discoverCommands loads .md files from multiple directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cmd-loader-'));
  const userDir = path.join(root, 'user-commands');
  const projectDir = path.join(root, 'project-commands');
  await mkdir(userDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(path.join(userDir, 'review.md'), '---\ndescription: Review code\n---\nReview the code.', 'utf8');
  await writeFile(path.join(projectDir, 'deploy.md'), '---\ndescription: Deploy\n---\nDeploy to prod.', 'utf8');

  const commands = await discoverCommands([userDir, projectDir]);
  assert.equal(commands.length, 2);
  assert.ok(commands.some((c) => c.name === 'review'));
  assert.ok(commands.some((c) => c.name === 'deploy'));
});

test('discoverCommands project-level overrides user-level', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cmd-override-'));
  const userDir = path.join(root, 'user');
  const projectDir = path.join(root, 'project');
  await mkdir(userDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(path.join(userDir, 'review.md'), '---\ndescription: User review\n---\nUser version.', 'utf8');
  await writeFile(path.join(projectDir, 'review.md'), '---\ndescription: Project review\n---\nProject version.', 'utf8');

  const commands = await discoverCommands([userDir, projectDir]);
  const review = commands.find((c) => c.name === 'review');
  assert.equal(review.description, 'Project review');
});

test('discoverCommands handles missing directories gracefully', async () => {
  const commands = await discoverCommands(['/nonexistent/path']);
  assert.equal(commands.length, 0);
});
```

- [ ] **Step 2: Implement command loader**

```javascript
// src/commands/loader.js
import { loadCommandsFromDir, parseCommandFile } from './parser.js';

// Load commands from multiple directories. Later directories override earlier ones (project > user).
export async function discoverCommands(dirs = []) {
  const commandMap = new Map();
  for (const dir of dirs) {
    const commands = await loadCommandsFromDir(dir);
    for (const cmd of commands) {
      commandMap.set(cmd.name, cmd);
    }
  }
  return [...commandMap.values()];
}

// Wrap a parsed command file into a registry-compatible command definition
export function wrapFileCommand(parsed) {
  return {
    name: parsed.name,
    description: parsed.description,
    source: 'filesystem',
    async execute(runtime, args = {}) {
      // File-based commands produce their prompt for the runner to execute
      return {
        ok: true,
        source: 'filesystem',
        name: parsed.name,
        prompt: parsed.prompt,
        allowedTools: parsed.allowedTools,
        model: parsed.model,
        args,
      };
    },
  };
}
```

- [ ] **Step 3: Write skill binder tests**

```javascript
// tests/skill-binder.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAndBind } from '../src/skills/binder.js';

test('matchAndBind returns null when no skill matches', () => {
  const skills = new Map();
  const result = matchAndBind('hello world', skills);
  assert.equal(result, null);
});

test('matchAndBind returns skill body when query matches', () => {
  const skills = new Map([
    ['review', { name: 'review', description: 'code review with structured output', body: 'Review instructions here' }],
  ]);
  const result = matchAndBind('do a code review of src/', skills);
  assert.ok(result);
  assert.equal(result.name, 'review');
  assert.equal(result.body, 'Review instructions here');
});

test('matchAndBind enriches system prompt with skill body', () => {
  const skills = new Map([
    ['refactor', { name: 'refactor', description: 'refactor code following DRY YAGNI', body: 'Refactor guidelines' }],
  ]);
  const result = matchAndBind('refactor the auth module', skills);
  assert.ok(result);
  assert.ok(result.promptAddendum.includes('Refactor guidelines'));
});
```

- [ ] **Step 4: Implement skill binder**

```javascript
// src/skills/binder.js

// Match a user query against loaded skills and return the binding for the agent loop
export function matchAndBind(query, skillsMap) {
  const lower = query.toLowerCase();
  for (const [, skill] of skillsMap) {
    const descWords = (skill.description ?? '').toLowerCase().split(/\s+/);
    const queryWords = lower.split(/\s+/);
    const overlap = queryWords.filter((w) => descWords.includes(w) && w.length > 3).length;
    if (overlap >= 2) {
      return {
        name: skill.name,
        body: skill.body ?? '',
        promptAddendum: `\n\n# Active Skill: ${skill.name}\n\n${skill.body ?? ''}`,
      };
    }
  }
  return null;
}
```

- [ ] **Step 5: Wire auto-loading into runtime**

In `src/kernel/runtime.js`, after skill discovery and before command registry creation:

```javascript
// Auto-discover filesystem commands (user-level → project-level, later overrides earlier)
const { discoverCommands, wrapFileCommand } = await import('../commands/loader.js');
const commandDirs = [
  path.join(stateDir, 'commands'),
  path.join(cwd, 'commands'),
];
const fileCommands = await discoverCommands(commandDirs);

// ... after CommandRegistry creation:
commands.registerMany(fileCommands.map(wrapFileCommand));
```

Auto-discover skills at boot:

```javascript
// Auto-discover skills
await skills.discoverSkills();
```

- [ ] **Step 6: Run all tests, commit**

```bash
node --test
git add src/commands/loader.js src/skills/binder.js src/kernel/runtime.js tests/command-loader.test.js tests/skill-binder.test.js
git commit -m "feat: auto-load commands and skills from filesystem at boot"
```

---

## Task 4: MCP Minimal Integration

Minimal MCP (Model Context Protocol) support: config loading, stdio transport, tool/resource mapping into the tool registry.

**Files:**
- Create: `src/mcp/config.js`
- Create: `src/mcp/client.js`
- Create: `src/mcp/tools.js`
- Create: `tests/mcp.test.js`
- Create: `examples/05-mcp-server.js`
- Modify: `src/kernel/runtime.js` — wire MCP loading

- [ ] **Step 1: Write MCP tests**

```javascript
// tests/mcp.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMcpConfig, validateMcpServer } from '../src/mcp/config.js';
import { mapMcpTools } from '../src/mcp/tools.js';

test('parseMcpConfig reads server definitions', () => {
  const config = {
    mcpServers: {
      'context7': {
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        env: { API_KEY: 'test' },
      },
      'filesystem': {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
    },
  };
  const servers = parseMcpConfig(config);
  assert.equal(servers.length, 2);
  assert.equal(servers[0].name, 'context7');
  assert.equal(servers[0].command, 'npx');
  assert.deepEqual(servers[0].args, ['-y', '@upstash/context7-mcp']);
});

test('validateMcpServer rejects invalid configs', () => {
  assert.equal(validateMcpServer({}).valid, false);
  assert.equal(validateMcpServer({ command: 'npx' }).valid, true);
  assert.equal(validateMcpServer({ command: '' }).valid, false);
});

test('mapMcpTools converts MCP tool list to tool registry format', () => {
  const mcpTools = [
    {
      name: 'query-docs',
      description: 'Query documentation',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    },
  ];
  const mapped = mapMcpTools('context7', mcpTools);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].name, 'mcp__context7__query-docs');
  assert.equal(mapped[0].capability, 'network');
  assert.equal(mapped[0].source, 'mcp');
});

test('mapMcpTools preserves input schemas', () => {
  const mcpTools = [
    {
      name: 'read',
      description: 'Read resource',
      inputSchema: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'] },
    },
  ];
  const mapped = mapMcpTools('fs', mcpTools);
  assert.deepEqual(mapped[0].inputSchema.required, ['uri']);
});
```

- [ ] **Step 2: Implement MCP config loader**

```javascript
// src/mcp/config.js

export function parseMcpConfig(config = {}) {
  const servers = config.mcpServers ?? {};
  return Object.entries(servers).map(([name, def]) => ({
    name,
    command: def.command,
    args: def.args ?? [],
    env: def.env ?? {},
    disabled: def.disabled ?? false,
  }));
}

export function validateMcpServer(server) {
  if (!server.command || typeof server.command !== 'string') {
    return { valid: false, reason: 'command is required and must be a non-empty string' };
  }
  return { valid: true };
}
```

- [ ] **Step 3: Implement MCP stdio client**

```javascript
// src/mcp/client.js
import { spawn } from 'node:child_process';

// Minimal JSON-RPC over stdio MCP client
export class McpStdioClient {
  #process = null;
  #requestId = 0;
  #pending = new Map();
  #buffer = '';
  #serverName;

  constructor(serverName, { command, args = [], env = {} }) {
    this.#serverName = serverName;
    this.command = command;
    this.args = args;
    this.env = env;
  }

  async connect() {
    this.#process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    this.#process.stdout.on('data', (chunk) => {
      this.#buffer += chunk.toString();
      this.#processBuffer();
    });

    this.#process.on('error', (err) => {
      for (const [, { reject }] of this.#pending) {
        reject(err);
      }
      this.#pending.clear();
    });

    // Initialize with JSON-RPC
    const initResult = await this.#send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'starkharness', version: '0.1.0' },
    });

    await this.#notify('notifications/initialized', {});
    return initResult;
  }

  async listTools() {
    const result = await this.#send('tools/list', {});
    return result.tools ?? [];
  }

  async callTool(name, args = {}) {
    return this.#send('tools/call', { name, arguments: args });
  }

  async disconnect() {
    if (this.#process) {
      this.#process.stdin.end();
      this.#process.kill();
      this.#process = null;
    }
  }

  #send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.#requestId;
      this.#pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.#process.stdin.write(msg);
    });
  }

  #notify(method, params) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.#process.stdin.write(msg);
    return Promise.resolve();
  }

  #processBuffer() {
    const lines = this.#buffer.split('\n');
    this.#buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && this.#pending.has(msg.id)) {
          const { resolve, reject } = this.#pending.get(msg.id);
          this.#pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message ?? 'MCP error'));
          else resolve(msg.result);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  get serverName() { return this.#serverName; }
}
```

- [ ] **Step 4: Implement MCP tool mapper**

```javascript
// src/mcp/tools.js
import { defineTool } from '../tools/types.js';

// Map MCP tools into the StarkHarness tool registry format
// Tool names are namespaced: mcp__{server}__{tool}
export function mapMcpTools(serverName, mcpTools = []) {
  return mcpTools.map((t) => ({
    name: `mcp__${serverName}__${t.name}`,
    capability: 'network',
    description: t.description ?? `MCP tool from ${serverName}`,
    inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    source: 'mcp',
    server: serverName,
    originalName: t.name,
  }));
}

// Create a tool definition that proxies calls to the MCP client
export function createMcpToolProxy(serverName, mcpTool, client) {
  const mapped = mapMcpTools(serverName, [mcpTool])[0];
  return defineTool({
    ...mapped,
    async execute(input = {}) {
      const result = await client.callTool(mcpTool.name, input);
      return { ok: true, tool: mapped.name, source: 'mcp', server: serverName, result };
    },
  });
}
```

- [ ] **Step 5: Wire MCP into runtime**

In `src/kernel/runtime.js`, add optional MCP loading:

```javascript
// MCP server loading (optional)
const mcpClients = new Map();
if (options.mcpConfig) {
  const { parseMcpConfig, validateMcpServer } = await import('../mcp/config.js');
  const { McpStdioClient } = await import('../mcp/client.js');
  const { createMcpToolProxy } = await import('../mcp/tools.js');
  const servers = parseMcpConfig(options.mcpConfig);
  for (const server of servers.filter((s) => !s.disabled)) {
    if (!validateMcpServer(server).valid) continue;
    try {
      const client = new McpStdioClient(server.name, server);
      await client.connect();
      const mcpTools = await client.listTools();
      for (const t of mcpTools) {
        tools.register(createMcpToolProxy(server.name, t, client));
      }
      mcpClients.set(server.name, client);
    } catch (err) {
      await telemetry.emit('mcp:error', { server: server.name, error: err.message });
    }
  }
}

// Add to runtime object:
runtime.mcpClients = mcpClients;
```

- [ ] **Step 6: Create MCP example**

```javascript
// examples/05-mcp-server.js
// Demonstrates MCP server integration (requires an MCP server binary)
import { createRuntime } from '../src/kernel/runtime.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'mcp demo' },
  mcpConfig: {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
    },
  },
});

console.log('Registered tools:', runtime.tools.list().map((t) => t.name));
console.log('MCP clients:', [...runtime.mcpClients.keys()]);

// Cleanup
for (const client of runtime.mcpClients.values()) {
  await client.disconnect();
}
```

- [ ] **Step 7: Run tests, commit**

```bash
node --test
git add src/mcp/ tests/mcp.test.js examples/05-mcp-server.js
git commit -m "feat: add minimal MCP integration — config, stdio client, tool mapping"
```

---

## Task 5: Provider Config + Model Strategy

Complete provider configuration with model selection, retry, timeout, and capability flags.

**Files:**
- Create: `src/providers/strategy.js`
- Create: `tests/provider-strategy.test.js`
- Modify: `src/providers/index.js` — integrate strategy
- Modify: `src/kernel/runtime.js` — wire strategy

- [ ] **Step 1: Write strategy tests**

```javascript
// tests/provider-strategy.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelStrategy, selectProvider, withRetry } from '../src/providers/strategy.js';

test('ModelStrategy selects provider by capability', () => {
  const strategy = new ModelStrategy({
    providers: [
      { id: 'anthropic', capabilities: ['chat', 'tools'], priority: 1 },
      { id: 'openai', capabilities: ['chat'], priority: 2 },
    ],
  });

  assert.equal(strategy.select({ require: 'tools' }), 'anthropic');
  assert.equal(strategy.select({ require: 'chat' }), 'anthropic'); // higher priority
});

test('ModelStrategy falls back when primary unavailable', () => {
  const strategy = new ModelStrategy({
    providers: [
      { id: 'anthropic', capabilities: ['chat', 'tools'], priority: 1 },
      { id: 'openai', capabilities: ['chat', 'tools'], priority: 2 },
    ],
    unavailable: new Set(['anthropic']),
  });

  assert.equal(strategy.select({ require: 'tools' }), 'openai');
});

test('selectProvider returns first capable provider id', () => {
  const providers = [
    { id: 'a', capabilities: ['chat'] },
    { id: 'b', capabilities: ['chat', 'tools'] },
  ];
  assert.equal(selectProvider(providers, 'tools'), 'b');
  assert.equal(selectProvider(providers, 'chat'), 'a');
  assert.equal(selectProvider(providers, 'vision'), null);
});

test('withRetry retries on failure', async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    if (attempts < 3) throw new Error('transient');
    return 'ok';
  };

  const result = await withRetry(fn, { maxRetries: 3, baseDelay: 1 });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('withRetry throws after max retries', async () => {
  const fn = async () => { throw new Error('always fail'); };
  await assert.rejects(
    () => withRetry(fn, { maxRetries: 2, baseDelay: 1 }),
    /always fail/,
  );
});

test('withRetry respects timeout', async () => {
  const fn = async () => new Promise((resolve) => setTimeout(resolve, 5000));
  await assert.rejects(
    () => withRetry(fn, { maxRetries: 1, baseDelay: 1, timeout: 50 }),
    /timed out/i,
  );
});
```

- [ ] **Step 2: Implement provider strategy**

```javascript
// src/providers/strategy.js

export function selectProvider(providers, requiredCapability) {
  for (const p of providers) {
    if (p.capabilities?.includes(requiredCapability)) return p.id;
  }
  return null;
}

export class ModelStrategy {
  #providers;
  #unavailable;

  constructor({ providers = [], unavailable = new Set() } = {}) {
    this.#providers = providers.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    this.#unavailable = unavailable;
  }

  select({ require: cap = 'chat', prefer } = {}) {
    if (prefer && !this.#unavailable.has(prefer)) {
      const pref = this.#providers.find((p) => p.id === prefer);
      if (pref?.capabilities?.includes(cap)) return prefer;
    }
    for (const p of this.#providers) {
      if (this.#unavailable.has(p.id)) continue;
      if (p.capabilities?.includes(cap)) return p.id;
    }
    return null;
  }

  markUnavailable(id) {
    this.#unavailable.add(id);
  }

  markAvailable(id) {
    this.#unavailable.delete(id);
  }
}

export async function withRetry(fn, { maxRetries = 3, baseDelay = 1000, timeout = 120000 } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), timeout),
        ),
      ]);
      return result;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

- [ ] **Step 3: Integrate strategy into ProviderRegistry**

Add to `src/providers/index.js`:

```javascript
import { ModelStrategy, withRetry } from './strategy.js';

// In ProviderRegistry class, add:
async completeWithStrategy({ capability = 'chat', prefer, request, retryOptions } = {}) {
  const strategy = new ModelStrategy({
    providers: this.list().map((p) => ({ ...p, capabilities: p.capabilities ?? ['chat'] })),
  });
  const providerId = strategy.select({ require: capability, prefer });
  if (!providerId) throw new Error(`No provider available for capability: ${capability}`);
  return withRetry(
    () => this.complete(providerId, request),
    retryOptions,
  );
}
```

- [ ] **Step 4: Wire provider capabilities**

Update provider creation to include capability flags. In `src/providers/anthropic.js`:

```javascript
// Add capabilities to the returned provider object:
capabilities: ['chat', 'tools', 'vision'],
```

- [ ] **Step 5: Run tests, commit**

```bash
node --test
git add src/providers/strategy.js src/providers/index.js src/providers/anthropic.js tests/provider-strategy.test.js
git commit -m "feat: add provider model strategy with selection, retry, and timeout"
```
