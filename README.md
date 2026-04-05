# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/Dependencies-Zero-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Tests-node%3Atest-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Security-Multi--Tenant%20Authz-blue.svg" alt="Security">
</p>

---

### 🚀 The "Claude Code" Class Agent Operating System

**StarkHarness** is an atomic, high-intensity harness designed for building full-feature AI coding agents. Unlike simple wrappers, it provides a clean, dependency-free **Agent Operating System (AOS)** that implements the core orchestration logic found in world-class tools like Claude Code.

> [**English**] | [**简体中文](./README.zh-CN.md)

---

## 📚 Read This Next

- [Architecture Deep Dive](./docs/architecture-deep-dive.md)
- [Contributor Guide](./docs/contributor-guide.md)

---

## 🏗 System Architecture (Panoramic View)

StarkHarness orchestrates a complex flow of data across five specialized planes, ensuring strict separation between intelligence and execution.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧠 KERNEL (Orchestration Layer)                                             │
│    session ➔ runtime ➔ loop ➔ context ➔ events ➔ hooks ➔ prompt builder     │
│    ───────────────────────────────────────────────────────────────────      │
│    [Identity] + [Env] + [CLAUDE.md] + [Memory] + [Tool Schemas] = Prompt    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ CONTROL PLANES (Safety & Governance)                                     │
│    permissions/engine (Policy Merge)  •  tasks/store (State Machine)         │
│    agents/orchestrator (Multi-Agent)  •  plugins/diagnostics (Conflicts)     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ CAPABILITY SURFACE (Execution Layer)                                      │
│    Tools (JSON Schema)  •  MCP (Protocol Bridge)  •  Commands (Markdown)     │
│    ───────────────────────────────────────────────────────────────────      │
│    runtime/sandbox (Physical Isolation) • skills/loader (Progressive)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🤖 INTELLIGENCE LAYER (Provider Strategy)                                   │
│    Anthropic-Live (Streaming) • OpenAI-Live • Strategy/Model Router         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💎 Pro-Grade Features

### 🤖 1. Multi-Agent Orchestration (`src/agents/`)
Built-in support for hierarchical agent swarms:
- **`Orchestrator`**: Manages the lifecycle and routing of specialized child agents.
- **`Inbox`**: Implements an asynchronous message bus for inter-agent communication.
- **`Executor`**: Runs dangerous or specialized turns in isolated sub-runtimes.

### 🛡️ 2. Bridge + Authz Profiles (`src/bridge/`, `src/permissions/`)
Beyond simple authentication, StarkHarness already implements **Token-to-Profile** mapping:
- **`tokenProfiles`**: Map different API keys to specific sandbox profiles.
- **Contextual Isolation**: Each request uses its own `PermissionEngine` instance, ensuring that a "Viewer" token cannot escalate to "Admin" capabilities.
- **Secure Bridge**: Auth via `Authorization: Bearer` (HTTP) or `?token=` (WS), plus HTTP, SSE, and WebSocket runtime surfaces.

### 🔌 3. MCP + Dynamic Tool Surface (`src/mcp/`, `src/tools/`)
The runtime combines built-in tools with protocol-driven extension points:
- **Built-in Workspace Tools**: File IO, search, shell, delegation, and task primitives ship by default.
- **MCP Tool Injection**: Remote MCP tools are registered dynamically as namespaced StarkHarness tools.
- **JSON Schema Registry**: The tool surface is exported in schema form for the agent loop and external clients.

### 📡 4. Streaming Bridge And Live Providers (`src/bridge/`, `src/providers/`)
Real-time execution is already a first-class concern:
- **Filters**: Subscribe to specific `traceId` or `agentId` to filter out background noise.
- **Topic-Based**: Group events by `runs`, `logs`, or `system`.
- **Live Providers**: Anthropic and OpenAI-compatible adapters support real tool loops and streaming responses.
- **Execution Isolation**: Local and process isolation are implemented today; Docker profiles exist but remain an early path.

---

## 🔍 Deep Dive: Built-in Capabilities

| Tool | Capability | Advanced Features |
| :--- | :--- | :--- |
| `read_file` | `read` | **Line Slicing**: `offset` and `limit` for surgical reading. |
| `search` | `read` | **Workspace Search**: Text search with optional glob filtering. |
| `edit_file` | `write` | **Global Replace**: `replace_all: true` for bulk updates. |
| `shell` | `exec` | **Safe Execution**: `/bin/sh -c` with 120s timeout and 4MB buffer. |
| `fetch_url` | `network` | **Remote Context**: Fetch HTTP content directly into the runtime. |
| `spawn_agent` | `delegate` | **Orchestrated**: Create sub-agents with specific role whitelists. |

MCP tools are not a single hardcoded builtin. They are loaded dynamically and exposed with names like `mcp__server__tool`.

---

## 🚦 CLI Command Reference

Execute commands via `node src/main.js <command>`.

| Command | Purpose |
| :--- | :--- |
| `blueprint` | **Runtime Blueprint**: Print the assembled runtime surface and active capabilities. |
| `registry` | **Full Diagnostic**: Lists all tools, commands, providers, and plugin conflicts. |
| `doctor` | **Health Check**: Validates harness wiring and system surfaces. |
| `run` | **Agent Loop**: Execute a full provider-backed agent run for a prompt. |
| `repl` / `chat` | **Interactive Mode**: Start the readline-based local REPL. |
| `serve` | **Bridge Mode**: Start the HTTP, SSE, and WebSocket bridge. |
| `smoke-test` | **Quick Verification**: Runs an end-to-end `read_file` turn loop. |
| `transcript` / `playback` | **Event Log**: Replay or summarize transcript events. |
| `replay-turn` / `replay-runner` | **Replay Aids**: Reconstruct recorded turn flow and replay plans. |

---

## 📂 Project Structure

```text
src/
├── kernel/          # Runtime composition, turn loop, session, hooks, and prompts
├── permissions/     # Permission engine and sandbox profiles
├── tools/           # JSON Schema tool definitions (Built-in + MCP)
├── providers/       # Anthropic/OpenAI-compatible providers and strategy layer
├── agents/          # Orchestrator, Inbox, Manager, and Executors
├── commands/        # Built-in command registry and diagnostics
├── bridge/          # HTTP/SSE/WebSocket runtime bridge with authz profiles
├── mcp/             # MCP stdio client, config parsing, and tool mapping
├── runtime/         # Execution sandbox and isolation logic
├── tasks/           # Scheduler and task state machine
├── memory/          # CLAUDE.md + Dynamic learned context
├── skills/          # Skill discovery and runtime prompt binding
├── state/           # Session, agent, and worker persistence
├── ui/              # REPL surface
└── telemetry/       # Event logging and distributed trace (traces.jsonl)
```

---

## 🧭 Current Maturity

- **Already solid**: runtime assembly, multi-turn execution, mailbox-driven multi-agent orchestration, bridge authz, persistence, telemetry, and replay-oriented diagnostics.
- **Partially implemented**: MCP beyond tool loading, Docker isolation, and the richer TUI described in the roadmap.
- **Still early**: the package is `0.1.0`, remains `private`, and the repository does not yet ship a root `LICENSE` file.

For a grounded walkthrough of these tradeoffs, start with the [Architecture Deep Dive](./docs/architecture-deep-dive.md) and the [Contributor Guide](./docs/contributor-guide.md).

---

## 🗺 Roadmap

- [x] **Live Providers**: Native streaming for Anthropic & OpenAI.
- [x] **Secure Bridge**: Authz Profiles and WebSocket Subscription filters.
- [x] **Multi-Agent**: Orchestration and inter-agent message bus.
- [ ] **Phase 1**: Full MCP 1.0 specification (Resources & Prompts).
- [ ] **Phase 2**: TUI / REPL with syntax highlighting and multi-session tabs.
- [ ] **Phase 3**: Distributed Trace Visualization for multi-agent debugging.

---

## 📄 License

The repository currently does not ship a root `LICENSE` file. If MIT is the intended license, add a `LICENSE` file before treating the project as MIT-licensed in downstream use.
