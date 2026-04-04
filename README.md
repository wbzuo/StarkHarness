# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/Dependencies-Zero-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  <img src="https://img.shields.io/badge/Architecture-Claude%20Code--Class-orange.svg" alt="Architecture">
</p>

---

### 🚀 The "Claude Code" Class Runtime Scaffold

**StarkHarness** is an atomic, high-intensity harness designed for building full-feature AI coding agents. It strips away product-shell complexity, providing a clean, testable, and dependency-free kernel that implements the core logic of world-class coding agents.

> [**English**] | [**简体中文](./README.zh-CN.md)

---

## 💎 Core Philosophy

| 🛡️ Security | ⚙️ Mechanics | 🧩 Modularity |
| :--- | :--- | :--- |
| **Three-tier permissions** (Allow/Ask/Deny) ensuring absolute safety at the kernel level. | **9-stage hook lifecycle** controlling every turn of the agent's thought process. | **Explicit & Detachable** capabilities. No hidden magic, just clean contracts. |

---

## 🏗 System Architecture

StarkHarness is built on four distinct "Planes" of operation:

```text
┌───────────────────────────────────────────────────────────────────────┐
│ 🧠 KERNEL (Orchestration Layer)                                       │
│    session ➔ runtime ➔ loop ➔ context ➔ events ➔ hooks ➔ prompt       │
├───────────────────────────────────────────────────────────────────────┤
│ 🛡️ CONTROL PLANES (Safety & Management)                               │
│    permissions/engine  •  tasks/store  •  agents/manager               │
│    plugins/loader      •  plugins/diagnostics                          │
├───────────────────────────────────────────────────────────────────────┤
│ 🛠️ CAPABILITY SURFACE (Execution Layer)                               │
│    Tools (JSON Schema)  •  Skills (3-level)  •  Commands (Markdown)    │
├───────────────────────────────────────────────────────────────────────┤
│ 🤖 PROVIDER LAYER (Intelligence Layer)                                │
│    Anthropic (Native)  •  OpenAI  •  Custom Model Adapters             │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 Key Mechanisms

### 🔗 1. Hook Dispatcher (`src/kernel/hooks.js`)
Modeled after the internal architecture of top-tier agents, the Hook system allows you to intercept any action:
- `PreToolUse`: Validate or block tools before they run.
- `PostToolUse`: Process tool output before the agent sees it.
- `Stop`: Hooks can block exit if tests are failing or goals aren't met.

### 🛡️ 2. Permission Engine (`src/permissions/`)
A robust sandbox with three predefined profiles:
- 🔓 **Permissive**: Developer mode, all tools allowed.
- 🛡️ **Safe**: Default mode, dangerous tools require confirmation.
- 🔒 **Locked**: Read-only mode, no write/exec/network access.

### 📚 3. Memory & Skills
- **Static Memory**: Follows the `CLAUDE.md` standard for project rules.
- **Dynamic Memory**: Learned context stored in `.starkharness/memory/` with YAML frontmatter.
- **Progressive Skills**: 3-level loading (Discovery ➔ Body ➔ References) to save tokens.

---

## 📊 Feature Comparison

| Feature | Claude Code | StarkHarness |
| :--- | :---: | :---: |
| **Zero Dependencies** | ❌ | ✅ **Yes** |
| **Hook Lifecycle** | 9 stages | 9 stages |
| **Permissions** | Interactive | Policy + Interactive |
| **Memory Standard** | `CLAUDE.md` | `CLAUDE.md` |
| **Skill Loading** | Progressive | Progressive |
| **Extensibility** | Plugin-based | Plugin-based |

---

## 🚦 Quick Start

```bash
# 1. Clone the harness
git clone https://github.com/wbzuo/StarkHarness.git

# 2. Enter the cockpit
cd StarkHarness

# 3. Check the blueprint (Full runtime structure)
node src/main.js blueprint

# 4. Run the health check
node src/main.js doctor

# 5. Execute tests (Built-in Node runner)
npm test
```

---

## 🗺 Roadmap

- [x] **Core Harness**: High-fidelity session and turn loop.
- [ ] **Phase 1**: Real Anthropic/OpenAI provider backends.
- [ ] **Phase 2**: MCP (Model Context Protocol) integration.
- [ ] **Phase 3**: Rich REPL with slash commands and syntax highlighting.
- [ ] **Phase 4**: Deterministic Replay Engine for agent debugging.

---

## 📄 License

MIT. Designed for researchers and engineers building the next generation of AI agents.
