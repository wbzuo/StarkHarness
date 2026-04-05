# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/Dependencies-Zero-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Tests-64%20Passed-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Architecture-Claude%20Code--Class-orange.svg" alt="Architecture">
</p>

---

### 🚀 The "Claude Code" Class Runtime Scaffold

**StarkHarness** is an atomic, high-intensity harness designed for building full-feature AI coding agents. It strips away product-shell complexity, providing a clean, testable, and dependency-free kernel that implements the core logic of world-class coding agents.

> [**English**] | [**简体中文](./README.zh-CN.md)

---

## 🏗 System Architecture (Panoramic View)

StarkHarness orchestrates a complex flow of data across five specialized planes:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧠 KERNEL (Orchestration Layer)                                             │
│    session ➔ runtime ➔ loop ➔ context ➔ events ➔ hooks ➔ prompt builder     │
│    ───────────────────────────────────────────────────────────────────      │
│    [Identity] + [Env] + [CLAUDE.md] + [Memory] + [Tool Schemas] = Prompt    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ CONTROL PLANES (Safety & Governance)                                     │
│    permissions/engine (Policy Merge) • tasks/store (State Machine)          │
│    agents/orchestrator (Multi-Agent) • plugins/diagnostics (Conflicts)      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ CAPABILITY SURFACE (Execution)                                           │
│    Tools (JSON Schema) • MCP (Protocol Support) • Commands (Markdown)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🤖 PROVIDER LAYER (Intelligence)                                            │
│    Anthropic-Live • OpenAI-Live • Custom Model Adapters • Strategy Engine   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 Developer Guide: Extending the Harness

StarkHarness is designed to be highly extensible. Here is how you can build upon it:

### 1. Define a New Tool (`src/tools/`)
Tools must strictly follow the JSON Schema contract for LLM compatibility.

```javascript
import { defineTool } from './types.js';

export const myTool = defineTool({
  name: 'git_status',
  capability: 'read',
  description: 'Get the current status of the git repository.',
  inputSchema: {
    type: 'object',
    properties: {
      include_untracked: { type: 'boolean', default: true }
    }
  },
  async execute(input, runtime) {
    const { stdout } = await runtime.shell('git status --short');
    return { ok: true, status: stdout };
  }
});
```

### 2. Multi-Agent Orchestration (`src/agents/`)
StarkHarness natively supports spawning and coordinating child agents.
- **`Orchestrator`**: Manages the life cycle of sub-agents.
- **`Inbox`**: Handles cross-agent communication.
- **`Executor`**: Runs specialized tasks in isolated runtimes.

---

## 🔍 Deep Dive: Built-in Capabilities

| Tool | Category | Key Features |
| :--- | :--- | :--- |
| `read_file` | `read` | **Line Slicing**: Use `offset` and `limit` to read specific parts of huge files. |
| `edit_file` | `write` | **Global Replace**: Set `replace_all: true` for codebase-wide updates. |
| `shell` | `exec` | **Safe Execution**: `/bin/sh -c` with 120s timeout and 4MB output buffer. |
| `mcp` | `protocol` | **MCP Bridge**: Connect to any Model Context Protocol compliant server. |
| `tasks` | `delegate` | **Stateful**: Integrated task manager (Create ➔ Update ➔ List). |

---

## 🚦 CLI Command Reference

Execute commands via `node src/main.js <command>`.

| Command | Purpose |
| :--- | :--- |
| `registry` | **Full Diagnostic**: Lists all tools, commands, providers, and plugin conflicts. |
| `doctor` | **Health Check**: Validates harness wiring and system surfaces. |
| `smoke-test` | **Quick Verification**: Runs an end-to-end `read_file` turn loop. |
| `transcript` | **Event Log**: Replays the full harness event log with optional filters. |
| `replay-runner` | **Execution Plan**: Evaluates a plan for re-running recorded agent turns. |

---

## 🏗 Project Structure

```text
src/
├── kernel/          # Turn loop, session management, and prompt assembly
├── permissions/     # Three-tier permission model and sandbox profiles
├── tools/           # Built-in tools and JSON Schema definitions
├── providers/       # Live adapters for Anthropic, OpenAI, and custom backends
├── agents/          # Multi-agent orchestration and specialized executors
├── mcp/             # Model Context Protocol implementation
├── plugins/         # Manifest loading and conflict diagnostics
└── telemetry/       # Transcript logging and event sinks
```

---

## 🗺 Roadmap & Progress

- [x] **Core Harness**: High-fidelity session/turn loop and persistence.
- [x] **Live Providers**: Native support for Anthropic and OpenAI.
- [x] **Multi-Agent**: Orchestration and inter-agent communication.
- [ ] **Phase 1**: Full MCP 1.0 specification support.
- [ ] **Phase 2**: TUI / REPL with syntax highlighting and auto-completion.
- [ ] **Phase 3**: Deterministic Replay Engine for agent failure analysis.

---

## 📄 License

MIT. Built for researchers and engineers exploring the boundaries of AI agent runtimes.
