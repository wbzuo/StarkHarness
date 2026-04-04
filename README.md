# StarkHarness

An atomic, zero-dependency harness scaffold for building Claude Code-class coding runtimes. Designed by reverse-engineering Claude Code's internal architecture — hook lifecycle, JSON Schema tools, system prompt composition, agent turn loop, memory stack, and skill loading — then reimplementing each mechanism as a clean, testable module.

Full feature parity is a product goal. Kernel size is aggressively minimized.

## Quick Start

```bash
git clone git@github.com:wbzuo/StarkHarness.git
cd StarkHarness
npm test                    # 64 tests, zero dependencies
node src/main.js blueprint  # Print full runtime blueprint
node src/main.js doctor     # Validate harness wiring
```

Requires **Node.js 20+**. No `npm install` needed — the entire harness runs on Node built-ins only.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Kernel                                                  │
│  session → runtime → loop → context → events → hooks    │
│                                          ↓              │
│                                    prompt builder       │
├─────────────────────────────────────────────────────────┤
│ Control Planes                                          │
│  permissions/engine  tasks/store  agents/manager        │
│  plugins/loader      plugins/diagnostics                │
├─────────────────────────────────────────────────────────┤
│ Tool Layer (JSON Schema)                                │
│  read_file  write_file  edit_file  shell  search        │
│  glob  fetch_url  spawn_agent  send_message  tasks      │
├─────────────────────────────────────────────────────────┤
│ Intelligence Layer                                      │
│  memory (CLAUDE.md + auto-memory)                       │
│  skills (3-level progressive loading)                   │
│  commands (YAML frontmatter + Markdown body)            │
├─────────────────────────────────────────────────────────┤
│ Provider Layer                                          │
│  anthropic  openai  compatible (pluggable)              │
└─────────────────────────────────────────────────────────┘
```

## Core Mechanisms

### Hook System — `src/kernel/hooks.js`

9 lifecycle events modeled after Claude Code's hook architecture. Every tool call, session event, and stop decision flows through hooks.

```javascript
const hooks = new HookDispatcher();

// Block dangerous commands
hooks.register('PreToolUse', {
  matcher: 'shell',
  handler: async (ctx) => {
    if (ctx.toolInput.command.includes('rm -rf'))
      return { decision: 'deny', reason: 'destructive command blocked' };
    return { decision: 'allow' };
  },
});

// Inject context on session start
hooks.register('SessionStart', {
  handler: async () => ({
    additionalContext: 'This project uses TDD. Always write tests first.',
  }),
});
```

**Events:** `PreToolUse` · `PostToolUse` · `Stop` · `SubagentStop` · `UserPromptSubmit` · `SessionStart` · `SessionEnd` · `PreCompact` · `Notification`

**Matchers:** exact name (`shell`), pipe-separated (`read_file|write_file`), wildcard (`*`), regex (`mcp_.*`)

### JSON Schema Tools — `src/tools/`

Every tool carries a full JSON Schema definition so LLMs know exactly what parameters to pass — matching Anthropic's `tool_use` format.

```javascript
defineTool({
  name: 'read_file',
  capability: 'read',
  description: 'Read a file from the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file' },
      offset: { type: 'number', description: 'Start line (0-based)' },
      limit: { type: 'number', description: 'Max lines to read' },
    },
    required: ['path'],
  },
  async execute(input, runtime) { /* ... */ },
});
```

`registry.toSchemaList()` generates an LLM-ready tool array for prompt injection.

### Agent Turn Loop — `src/kernel/loop.js`

The full hook-gated execution pipeline:

```
Permission Check → PreToolUse Hook → Tool Execute → PostToolUse Hook → Record Turn
       ↓                  ↓                                  ↓
   deny/ask          deny → abort                    inject systemMessage
```

```javascript
const loop = new AgentLoop({ hooks, tools, permissions });
const result = await loop.executeTurn({
  tool: 'edit_file',
  input: { path: 'src/app.js', old_string: 'foo', new_string: 'bar' },
});
// result.ok === true | false (with reason)
```

`loop.requestStop(reason)` fires the `Stop` hook — hooks can block exit (e.g., "tests not passing").

### System Prompt Builder — `src/kernel/prompt.js`

Composes the system prompt from multiple sources, exactly like Claude Code:

```
Identity → Environment → CLAUDE.md → Memory → Hook Context → Tool Schemas → Rules
```

```javascript
const prompt = promptBuilder.build({
  tools: registry.toSchemaList(),
  claudeMd: '# Rules\nAlways use TDD',
  memory: '[user:profile] Senior Go engineer',
  hookContext: 'Learning mode enabled',
  cwd: '/projects/myapp',
  platform: 'darwin',
});
```

### Memory System — `src/memory/index.js`

Two-layer memory matching Claude Code's pattern:

- **Static:** `CLAUDE.md` at project root (+ optional user-level)
- **Dynamic:** YAML frontmatter `.md` files under `.starkharness/memory/`

```markdown
---
name: user-role
type: user
description: User is a senior Go engineer
---
Deep Go expertise. New to React and frontend tooling.
Frame frontend explanations in terms of backend analogues.
```

Types: `user` · `feedback` · `project` · `reference`

### Skill Loading — `src/skills/loader.js`

Three-level progressive disclosure — metadata is always cheap, body loads on demand, references load when deep context is needed:

| Level | Method | Loads |
|-------|--------|-------|
| 1 | `discoverSkills()` | Frontmatter only (name, description, version) |
| 2 | `loadSkill(dir)` | Full SKILL.md body |
| 3 | `loadReferences(dir)` | `references/*.md` files |

`matchSkill(query)` routes user queries to skills by matching quoted trigger phrases in descriptions, with word-overlap fallback.

### Command Parser — `src/commands/parser.js`

Claude Code-style commands: YAML frontmatter metadata + Markdown body prompt.

```markdown
---
description: Review code changes
allowed-tools: Read, Bash(git:*)
model: sonnet
argument-hint: [file-or-directory]
---

Review each changed file for:
- Security vulnerabilities
- Performance issues
- Test coverage gaps
```

`loadCommandsFromDir(path)` bulk-loads all `.md` command files from a directory.

### Permission Engine — `src/permissions/`

Three-tier permission model: `allow` / `ask` / `deny`, with capability-level defaults and per-tool overrides.

```javascript
// Default policy
{ read: 'allow', write: 'ask', exec: 'ask', network: 'ask', delegate: 'allow' }

// Tool-level override
{ exec: 'allow', tools: { shell: 'deny' } }  // allow exec, but block shell specifically
```

**Sandbox profiles:** `permissive` (all allow) · `safe` (default) · `locked` (deny write/exec/network/delegate)

**Policy files:** JSON files merged at boot — supports workspace and user-level policies.

## CLI Commands

```bash
node src/main.js <command> [options]
```

| Command | Description |
|---------|-------------|
| `blueprint` | Full runtime structure as JSON |
| `doctor` | Validate harness wiring and surface counts |
| `providers` | List registered model providers |
| `provider-config` | Show provider configuration keys |
| `sessions` | List persisted sessions |
| `session-summary` | Current session state (agents, tasks, turns) |
| `resume <id>` | Resume a persisted session |
| `tasks` | List tracked tasks |
| `agents` | List spawned agents |
| `plugins` | Plugin manifests, capabilities, diagnostics |
| `profiles` | List sandbox profiles |
| `transcript` | Replay event log |
| `playback` | Summarize transcript events |
| `replay-turn` | Deterministic turn replay skeleton |
| `replay-runner` | Replay execution plan |
| `complete` | Stub provider completion (`--provider=openai --prompt=...`) |

## Plugin System

Plugins register manifests with commands, tools, and capabilities. Conflict detection catches duplicate names across plugins.

```javascript
const runtime = await createRuntime({
  plugins: [{
    name: 'browser-pack',
    version: '0.1.0',
    capabilities: ['browser', 'dom-inspect'],
    commands: [{ name: 'screenshot', description: 'Capture page' }],
    tools: [{ name: 'click', capability: 'browser', output: 'clicked' }],
  }],
});
```

## Agent Orchestration

Bounded child agents with description-driven routing, model selection, and tool whitelists.

```javascript
// Spawn a specialist
await runtime.dispatchTurn({
  tool: 'spawn_agent',
  input: {
    role: 'code-reviewer',
    description: 'Reviews code for security and performance issues',
    model: 'sonnet',
    tools: ['read_file', 'search', 'glob'],
  },
});

// Route by description
const agent = runtime.agents.matchAgent('review this code for security');
```

## Project Structure

```
src/
├── kernel/          # Core runtime (session, loop, context, events, hooks, prompt)
├── permissions/     # Permission engine, policy files, sandbox profiles
├── tools/           # Tool types (JSON Schema), registry, 10 builtins
├── commands/        # Command registry (17 built-in) + YAML frontmatter parser
├── memory/          # CLAUDE.md + dynamic auto-memory
├── skills/          # Three-level progressive skill loader
├── agents/          # Agent manager with description-driven routing
├── plugins/         # Plugin loader + conflict diagnostics
├── providers/       # Model provider registry (anthropic, openai, compatible)
├── tasks/           # Task ownership and tracking
├── state/           # JSON file persistence under .starkharness/
├── telemetry/       # Event logging to transcript.jsonl
├── capabilities/    # Feature module map
├── workspace/       # Git/worktree surface (placeholder)
├── bridge/          # IDE/remote bridge (placeholder)
├── ui/              # REPL surface (placeholder)
└── main.js          # CLI entry point

tests/               # 64 tests across 8 test files, node:test, zero deps
docs/plans/          # Implementation plans
```

## Claude Code Alignment

| Mechanism | Claude Code | StarkHarness |
|-----------|-------------|-------------|
| Hook System | 9 lifecycle events, command/prompt types | `HookDispatcher` — 9 events, matchers, deny-wins |
| Tool Schema | JSON Schema per tool for LLM consumption | `inputSchema` on every `defineTool` |
| System Prompt | CLAUDE.md + tools + memory + hooks | `SystemPromptBuilder` composing all sources |
| Turn Loop | PreToolUse → Execute → PostToolUse | `AgentLoop.executeTurn()` with full hook chain |
| Permissions | allow/ask/deny + tool-level override | `PermissionEngine` with policy files + profiles |
| Memory | CLAUDE.md + auto-memory YAML frontmatter | `MemoryManager` with identical two-layer pattern |
| Skills | 3-level progressive disclosure | `SkillLoader` — discover → load → references |
| Commands | YAML frontmatter + Markdown prompt body | `parseCommandFile` with allowed-tools whitelist |
| Agents | description routing, model/tools fields | `AgentManager.matchAgent()` + spawn options |
| Plugins | folder manifest + conflict detection | `PluginLoader` with diagnostics |

## What Comes Next

1. **Real LLM integration** — Anthropic Messages API with streaming `tool_use` blocks
2. **MCP protocol bridge** — stdio, SSE, HTTP, WebSocket transports
3. **Interactive REPL** — permission prompts, session management, slash commands
4. **Transcript replay engine** — deterministic re-execution from event logs
5. **Plugin auto-discovery** — folder conventions and npm-based loading

## License

MIT
