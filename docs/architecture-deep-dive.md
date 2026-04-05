# Architecture Deep Dive

StarkHarness is a zero-dependency agent runtime kernel for building Claude Code-style coding agents. It already has a real runtime assembly, a multi-turn agent loop, a bridge surface, persistence, telemetry, and a multi-agent control plane. It is best understood as an early but serious runtime core, not yet as a polished end-user product.

> [English](./architecture-deep-dive.md) | [简体中文](./architecture-deep-dive.zh-CN.md)

## Status At A Glance

| Area | Current state | Notes |
| :--- | :--- | :--- |
| CLI runtime | Ready | `src/main.ts` supports command, REPL/chat, pipe, resume, and serve modes. |
| Multi-turn agent loop | Ready | `src/kernel/runner.ts` drives provider calls, tool execution, and context compaction. |
| Multi-agent orchestration | Ready | Inbox, worker loops, task scheduling, and agent execution are implemented in `src/agents/` and `src/tasks/`. |
| HTTP/SSE/WebSocket bridge | Ready | `src/bridge/http.ts` exposes `/run`, `/stream`, command dispatch, and filtered WebSocket events. |
| MCP support | Partial | Stdio MCP clients and tool injection exist today; full MCP resources/prompts are still roadmap work. |
| Execution isolation | Partial | Local and process modes are real; Docker mode still uses a minimal placeholder bridge. |
| TUI / rich REPL | Partial | A readline REPL exists today; the richer TUI mentioned in the roadmap is still future work. |

## What The Runtime Actually Does

### 1. Boot And Runtime Composition

[`src/kernel/runtime.ts`](../src/kernel/runtime.ts) is the composition root. `createRuntime()` wires together:

- session and context
- permissions and sandbox profiles
- tasks, agents, inbox, orchestrator, and scheduler
- provider registry and tool registry
- plugins, MCP tool proxies, memory, skills, and hooks
- state storage and telemetry sinks
- bridge and REPL blueprints

This is the clearest sign that StarkHarness is more than a collection of modules. The repo has a real runtime assembly path.

### 2. Two Execution Paths Exist On Purpose

StarkHarness currently preserves both a lower-level tool turn interface and the newer multi-turn agent conversation flow.

- [`src/kernel/loop.ts`](../src/kernel/loop.ts) executes a single tool turn through permission checks and hooks.
- [`src/kernel/runner.ts`](../src/kernel/runner.ts) runs the full agent loop: build messages, call a provider, parse tool calls, execute tools, append tool results, and continue until the model stops.

That split reflects the repo's evolution. It still supports deterministic tool-turn execution while the newer `runtime.run()` path handles real provider-driven conversations.

### 3. Context, Sessions, And Compaction

[`src/kernel/context.ts`](../src/kernel/context.ts) models message history and includes token estimation plus context compaction. When the message list gets large, older history is replaced with a compact summary and the recent turns are preserved.

[`src/kernel/session.ts`](../src/kernel/session.ts) stores the minimal persisted session shape: session id, goal, mode, turns, messages, hook state, and timestamps.

### 4. Providers And Model Strategy

[`src/providers/index.ts`](../src/providers/index.ts) registers the built-in provider families and delegates provider selection to [`src/providers/strategy.ts`](../src/providers/strategy.ts).

The provider layer already includes:

- Anthropic live streaming support in [`src/providers/anthropic-live.ts`](../src/providers/anthropic-live.ts)
- OpenAI-compatible chat completions and streaming in [`src/providers/openai-live.ts`](../src/providers/openai-live.ts)
- capability-aware provider selection and retry logic

This is one of the stronger parts of the repo. It is not just a stubbed abstraction.

## Subsystem Walkthrough

### Kernel

The kernel is the runtime backbone:

- `runtime.js` composes everything
- `runner.js` drives multi-turn conversations
- `loop.js` executes single tool turns
- `hooks.js` adds lifecycle interception points such as `PreToolUse`, `PostToolUse`, `Stop`, and `PreCompact`
- `hook-loader.js` auto-discovers filesystem hooks from `.starkharness/hooks` and project `hooks/`
- `prompt.js` and `memory/` contribute prompt assembly inputs

The hook layer is intentionally simple but already useful. It behaves more like a control surface than a large plugin framework.

### Tools And MCP

Built-in tools live in [`src/tools/builtins/index.ts`](../src/tools/builtins/index.ts). The current built-in surface includes:

- workspace IO: `read_file`, `write_file`, `edit_file`
- discovery: `search`, `glob`
- execution and networking: `shell`, `fetch_url`
- delegation: `spawn_agent`, `send_message`, `tasks`

MCP is not a hardcoded builtin tool. Instead:

- [`src/mcp/client.ts`](../src/mcp/client.ts) implements a stdio JSON-RPC client
- [`src/mcp/config.ts`](../src/mcp/config.ts) parses MCP server config
- [`src/mcp/tools.ts`](../src/mcp/tools.ts) maps remote MCP tools into namespaced StarkHarness tools such as `mcp__server__tool`

That distinction matters when documenting the system. MCP exists today, but as dynamically injected tools rather than a single builtin command.

### Agents, Tasks, And Mailbox

The multi-agent layer is real and already worth reading:

- [`src/agents/manager.ts`](../src/agents/manager.ts) stores agent definitions and status
- [`src/agents/inbox.ts`](../src/agents/inbox.ts) implements event/request/response mailboxes with correlation ids and awaitable replies
- [`src/agents/executor.ts`](../src/agents/executor.ts) runs agent work with scoped tool registries
- [`src/agents/orchestrator.ts`](../src/agents/orchestrator.ts) assigns tasks, supervises workers, handles retries/timeouts/cancellation, and processes inbox work
- [`src/tasks/store.ts`](../src/tasks/store.ts) and [`src/tasks/scheduler.ts`](../src/tasks/scheduler.ts) support task persistence and dispatch

This is one of the repo's clearest differentiators. It is not just `spawn_agent`; it also has inbox workers and task orchestration.

### Bridge And UI

[`src/bridge/http.ts`](../src/bridge/http.ts) is the runtime's remote surface today. It already exposes:

- `POST /run`
- `POST /stream` for SSE
- `POST /command/:name`
- `GET /health`, `/session`, `/providers`, `/tools`, `/agents`, `/tasks`, `/workers`, `/traces`
- WebSocket broadcasting with topic, `traceId`, and `agentId` filters

[`src/bridge/index.ts`](../src/bridge/index.ts) is explicit that the bridge status is:

- `web: ready`
- `ide: planned`
- `remote: planned`
- `mobile: planned`

[`src/ui/repl.ts`](../src/ui/repl.ts) provides a simple readline-based REPL. It is functional, but it is not yet the richer multi-session TUI described in the roadmap.

### Memory, Skills, State, And Telemetry

These four pieces give StarkHarness its "runtime" feel:

- [`src/memory/index.ts`](../src/memory/index.ts) loads project `CLAUDE.md` plus dynamic memory files under `.starkharness/memory`
- [`src/skills/loader.ts`](../src/skills/loader.ts) discovers skill packs from the filesystem
- [`src/skills/binder.ts`](../src/skills/binder.ts) turns a matched skill into extra system prompt context
- [`src/state/store.ts`](../src/state/store.ts) persists sessions, runtime snapshots, agent state, transcripts, and worker status
- [`src/telemetry/index.ts`](../src/telemetry/index.ts) records JSONL transcripts and trace spans

The repo now also ships a bundled [`skills/web-access`](../skills/web-access/SKILL.md) pack. Combined with `CLAUDE_SKILL_DIR` propagation inside the shell tool, this gives the default runtime a built-in path for network/search/browser workflows without requiring a separate skill install step.

None of these systems are overbuilt yet, but all of them are integrated into the actual runtime path.

## What Looks Stable Today

- Runtime assembly and subsystem boundaries
- Provider-driven multi-turn execution
- Mailbox and worker orchestration
- Telemetry and replay-oriented diagnostics
- Bridge auth/profile mapping and filtered WebSocket subscriptions

## What Still Looks Early

- Docker isolation remains only partially implemented
- MCP currently focuses on stdio tool loading, not the full 1.0 resources/prompts story
- The REPL is real but still minimal
- The repo is versioned as `0.1.0` and the package remains `private`
- The repository currently does not ship a root `LICENSE` file, so README claims about MIT need to be treated cautiously until a license file is added

## Suggested Read Order

If you want to understand the codebase quickly, read in this order:

1. [`src/main.ts`](../src/main.ts)
2. [`src/kernel/runtime.ts`](../src/kernel/runtime.ts)
3. [`src/kernel/runner.ts`](../src/kernel/runner.ts)
4. [`src/tools/builtins/index.ts`](../src/tools/builtins/index.ts)
5. [`src/agents/orchestrator.ts`](../src/agents/orchestrator.ts)
6. [`src/bridge/http.ts`](../src/bridge/http.ts)
7. [`src/state/store.ts`](../src/state/store.ts)

That path gives you the runtime shell, the agent loop, the tool surface, the multi-agent control plane, the remote API, and persistence in the smallest number of files.
