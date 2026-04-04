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

StarkHarness orchestrates a complex flow of data across four specialized planes:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧠 KERNEL (Orchestration Layer)                                             │
│    session ➔ runtime ➔ loop ➔ context ➔ events ➔ hooks ➔ prompt builder     │
│    ───────────────────────────────────────────────────────────────────      │
│    [Identity] + [Env] + [CLAUDE.md] + [Memory] + [Tool Schemas] = Prompt    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ CONTROL PLANES (Safety & Governance)                                     │
│    permissions/engine (Policy Merge) • tasks/store (State Machine)          │
│    agents/manager (Sub-agents)       • plugins/diagnostics (Conflicts)      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ CAPABILITY SURFACE (Execution)                                           │
│    Tools (JSON Schema) • Skills (3-level Progressive) • Commands (Markdown) │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🤖 PROVIDER LAYER (Intelligence)                                            │
│    Anthropic (Native) • OpenAI • Custom Model Adapters • MCP Bridge         │
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
    // Access the runtime's CWD or context
    const { stdout } = await runtime.shell('git status --short');
    return { ok: true, status: stdout };
  }
});
```

### 2. Register a Lifecycle Hook (`src/kernel/hooks.js`)
Hooks allow you to inject logic into the Agent's turn loop.

```javascript
// Registering a PreToolUse hook to enforce security
runtime.hooks.register('PreToolUse', {
  matcher: 'shell',
  handler: async (ctx) => {
    if (ctx.toolInput.command.includes('sudo')) {
      return { decision: 'deny', reason: 'Sudo commands are restricted.' };
    }
    return { decision: 'allow' };
  }
});
```

---

## 🔍 Deep Dive: Built-in Capabilities

| Tool | Category | Key Features |
| :--- | :--- | :--- |
| `read_file` | `read` | **Line Slicing**: Use `offset` and `limit` to read specific parts of huge files. |
| `edit_file` | `write` | **Global Replace**: Set `replace_all: true` for codebase-wide updates. |
| `shell` | `exec` | **Safe Execution**: `/bin/sh -c` with 120s timeout and 4MB output buffer. |
| `spawn_agent` | `delegate` | **Role-Based**: Spawn specialized sub-agents with limited toolsets. |
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
| `replay-turn` | **Deterministic Replay**: Generates a replay skeleton from recorded turns. |
| `replay-runner` | **Execution Plan**: Evaluates a plan for re-running recorded agent turns. |
| `plugins` | **Plugin Registry**: Shows loaded capabilities and diagnostic warnings. |

---

## 🗺 Roadmap & Progress

- [x] **Core Harness**: High-fidelity session/turn loop and persistence.
- [x] **Registry & Diagnostics**: Automatic conflict detection for plugins.
- [ ] **Phase 1**: Real Anthropic/OpenAI provider backends with streaming.
- [ ] **Phase 2**: MCP (Model Context Protocol) full transport support.
- [ ] **Phase 3**: Rich TUI / REPL with syntax highlighting.

---

## 📄 License

MIT. Built for researchers and engineers exploring the boundaries of AI agent runtimes.
