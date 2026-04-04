# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/Dependencies-Zero-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Tests-64%20Passed-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/Architecture-Claude%20Code--Class-orange.svg" alt="Architecture">
</p>

---

### 🚀 The "Claude Code" Class Runtime Scaffold

**StarkHarness** is an atomic, high-intensity harness designed for building full-feature AI coding agents. It strips away product-shell complexity, providing a clean, testable, and dependency-free kernel that implements the core logic of world-class coding agents like Claude Code.

> [**English**] | [**简体中文](./README.zh-CN.md)

---

## 💎 Core Philosophy

| 🛡️ Security First | ⚙️ Precision Mechanics | 🧩 Absolute Modularity |
| :--- | :--- | :--- |
| **Three-tier Sandbox** (Allow/Ask/Deny) with tool-level overrides for absolute safety. | **9-stage Hook Lifecycle** allowing surgical intervention at every turn. | **Zero External Dependencies**. Runs entirely on Node.js 20+ built-ins. |

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

## 🛠 Key Mechanisms & Practical Guide

### 🔗 1. The Hook Pipeline (`src/kernel/hooks.js`)
Intercept and modify the agent's behavior at any point.
- **`PreToolUse`**: Block dangerous commands or **silently modify tool parameters** before execution.
- **`PostToolUse`**: Sanitize tool output before it reaches the LLM.
- **`Stop`**: Block exit if critical goals (like passing tests) haven't been met.

### 🛡️ 2. Hierarchical Permissions (`src/permissions/`)
- **Default Policy**: Broad capabilities (e.g., `exec: ask`).
- **Tool Override**: Specific tool rules (e.g., `tools.shell: deny`) take precedence.
- **Sandbox Profiles**: `permissive`, `safe` (default), and `locked` (read-only).

### 📚 3. Progressive Skills & Memory
- **3-Level Skills**: `Discovery` ➔ `Body` ➔ `References`. Only load what the LLM needs to save tokens.
- **Two-Layer Memory**: Static `CLAUDE.md` rules + Dynamic YAML-frontmatter learned context in `.starkharness/memory/`.

---

## 🔍 Deep Dive: Built-in Capabilities

| Tool | Category | "Secret" Features |
| :--- | :--- | :--- |
| `read_file` | `read` | **Line Slicing**: Use `offset` and `limit` to read specific parts of huge files. |
| `edit_file` | `write` | **Global Replace**: Set `replace_all: true` for codebase-wide updates. |
| `shell` | `exec` | **Safe Execution**: `/bin/sh -c` with 120s timeout and 4MB output buffer. |
| `search` | `read` | **Auto-Ignore**: Automatically skips `.git`, `node_modules`, and `.starkharness`. |
| `spawn_agent` | `delegate` | **Role-Based**: Spawn specialized sub-agents with limited toolsets. |
| `tasks` | `delegate` | **Stateful**: Integrated task manager (Create ➔ Update ➔ List). |

---

## 🚦 Getting Started (Dev Edition)

```bash
# 1. Boot the environment
git clone https://github.com/wbzuo/StarkHarness.git && cd StarkHarness

# 2. Inspect the Registry (View all tools, commands, and potential conflicts)
node src/main.js registry

# 3. Health Check
node src/main.js doctor

# 4. Smoke Test (Verify end-to-end turn loop)
node src/main.js smoke-test

# 5. Run the Test Suite (64 industrial-grade tests)
npm test
```

---

## 🗺 Roadmap & Progress

- [x] **Core Harness**: High-fidelity session/turn loop and persistence.
- [x] **Registry & Diagnostics**: Automatic conflict detection for plugins.
- [ ] **Phase 1**: Real Anthropic/OpenAI provider backends with streaming.
- [ ] **Phase 2**: MCP (Model Context Protocol) full transport support.
- [ ] **Phase 3**: TUI / REPL with syntax highlighting and auto-completion.
- [ ] **Phase 4**: Replay Engine for deterministic debugging of failed turns.

---

## 📄 License

MIT. Built for researchers and engineers exploring the boundaries of AI agent runtimes.
