# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/Dependencies-Zero-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Tests-145%20Passed-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Security-Token%20Gated-blue.svg" alt="Security">
</p>

---

### 🚀 The "Claude Code" Class Agent Operating System

**StarkHarness** is an atomic, high-intensity harness designed for building full-feature AI coding agents. Unlike simple wrappers, it provides a clean, dependency-free **Agent Operating System (AOS)** that implements the core orchestration logic found in world-class tools like Claude Code.

> [**English**] | [**简体中文](./README.zh-CN.md)

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

## 💎 Advanced Key Features

### 🤖 1. Multi-Agent Orchestration (`src/agents/`)
Built-in support for hierarchical agent swarms:
- **`Orchestrator`**: Manages the lifecycle and routing of specialized child agents.
- **`Inbox`**: Implements an asynchronous message bus for inter-agent communication.
- **`Executor`**: Runs dangerous or specialized turns in isolated sub-runtimes.

### 🔌 2. Secure Bridge & WebSocket (`src/bridge/`)
Production-ready communication layer:
- **Auth Token Gate**: Optional security via `Authorization: Bearer` (HTTP) or `?token=` (WS).
- **WS Subscription Model**: Topic-based (e.g., `runs`) pub/sub system for real-time agent monitoring.
- **Streaming Context**: Full support for Server-Sent Events (SSE) and WebSocket streams.

### 🛡️ 3. Execution Sandbox (`src/runtime/sandbox.js`)
Move beyond simple permission checks:
- **Physical Isolation**: Optional environment isolation for `shell` and `exec` commands.
- **Tool-Level Sandboxing**: Configurable resource limits (CPU, Memory, Time) per tool call.

### 📡 4. CLI Power Modes (`src/main.js`)
- **Pipe Mode**: Optimized for non-blocking CI/CD and script automation.
- **JSON REPL**: Machine-readable interactive mode (`--json=true`) for IDE integration.

---

## 🔍 Deep Dive: Built-in Capabilities

| Tool | Capability | Advanced Features |
| :--- | :--- | :--- |
| `read_file` | `read` | **Line Slicing**: `offset` and `limit` for surgical reading. |
| `edit_file` | `write` | **Global Replace**: `replace_all: true` for bulk updates. |
| `shell` | `exec` | **Safe Execution**: `/bin/sh -c` with 120s timeout and 4MB buffer. |
| `mcp` | `protocol` | **Bridge**: Unified interface for protocol-based tool extension. |
| `spawn_agent` | `delegate` | **Orchestrated**: Create sub-agents with specific role whitelists. |

---

## 🚦 CLI Command Reference

Execute commands via `node src/main.js <command>`.

| Command | Purpose |
| :--- | :--- |
| `registry` | **Full Diagnostic**: Lists all tools, commands, providers, and plugin conflicts. |
| `doctor` | **Health Check**: Validates harness wiring and system surfaces. |
| `smoke-test` | **Quick Verification**: Runs an end-to-end `read_file` turn loop. |
| `transcript` | **Event Log**: Replays the full harness event log with optional filters. |
| `playback` | **Summary**: Summarizes transcript events for quick status checks. |
| `replay-runner` | **Execution Plan**: Deterministically re-runs recorded agent turns. |

---

## 📂 Project Structure

```text
src/
├── kernel/          # Turn loop, session, hooks, and prompt builder
├── permissions/     # Permission engine and sandbox profiles
├── tools/           # JSON Schema tool definitions (Built-in + MCP)
├── providers/       # Live adapters for Anthropic & OpenAI (Streaming)
├── agents/          # Orchestrator, Inbox, and specialized Executors
├── bridge/          # Secure HTTP/WS communication with Auth & Subscriptions
├── runtime/         # Execution sandbox and isolation logic
├── tasks/           # Scheduler and task state machine
├── memory/          # CLAUDE.md + Dynamic learned context
└── telemetry/       # Event logging and distributed trace (traces.jsonl)
```

---

## 🗺 Roadmap

- [x] **Live Providers**: Native streaming for Anthropic & OpenAI.
- [x] **Secure Bridge**: Auth Token Gate and WebSocket Subscription model.
- [x] **Multi-Agent**: Orchestration and inter-agent message bus.
- [ ] **Phase 1**: Full MCP 1.0 specification (Resources & Prompts).
- [ ] **Phase 2**: TUI / REPL with syntax highlighting and multi-session tabs.
- [ ] **Phase 3**: Distributed Trace Visualization for multi-agent debugging.

---

## 📄 License

MIT. Designed for researchers and engineers building the next generation of AI agents.
