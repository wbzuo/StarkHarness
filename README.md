# StarkHarness ⚡️ (Codex Edition)

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0+-blue.svg" alt="TypeScript Version">
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020%2B%20%2F%20tsx-green.svg" alt="Runtime">
  <img src="https://img.shields.io/badge/Security-Bash%20Parser%20%2B%20OAuth-red.svg" alt="Security">
  <img src="https://img.shields.io/badge/Architecture-Enterprise%20Grade-orange.svg" alt="Architecture">
</p>

---

### 🚀 Enterprise-Ready Agent Operating System Kernel

**StarkHarness Codex** is the advanced TypeScript implementation of the StarkHarness core. Designed for high-reliability enterprise environments, it combines the orchestration logic of Claude Code with deep security analysis, multi-modal capabilities (Voice/Web), and professional observability.

> [**English**] | [**简体中文](./README.zh-CN.md)

---

## 🏗 Enterprise Architecture (Panoramic View)

StarkHarness Codex operates across specialized domains, providing a robust substrate for complex agentic workflows.

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ 🧠 CORE KERNEL (TypeScript / ESM)                                              │
│    session ➔ loop ➔ context ➔ prompt builder ➔ runner ➔ hooks ➔ events         │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ SECURITY & GOVERNANCE                                                       │
│    Permission Engine (Profiles) • Bash Parser/Classifier • OAuth/PKCE          │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ CAPABILITY SURFACE (Multi-Modal)                                             │
│    Tools (JSON Schema) • MCP Protocol • Web Access • Voice Interface • LSP     │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🤖 INTELLIGENCE LAYER                                                          │
│    Anthropic-Live • OpenAI-Live • Model Routing Strategy • Enterprise Obv      │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🔗 CONNECTIVITY & SWARM                                                        │
│    Secure HTTP/WS Bridge • Multi-Agent Orchestrator • Swarm (Tmux/LSP)         │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 💎 Codex-Exclusive Features

### 🛡️ 1. Advanced Security Layer (`src/security/`)
Move beyond simple string matching. StarkHarness Codex includes:
- **Bash Parser & Classifier**: Semantically analyzes shell commands before execution to detect destructive patterns.
- **OAuth & PKCE**: Integrated identity management for enterprise-grade tool access.

### 🎙️ 2. Multi-Modal Expansion (`src/voice/`, `src/web-access/`)
Built for the future of UI:
- **Voice Interface**: Native stubs for voice-to-agent and agent-to-voice loops.
- **Web Access**: Specialized capabilities for browsing and interacting with web resources.

### 📊 3. Enterprise Observability (`src/enterprise/`)
- **GrowthBook Integration**: Built-in support for feature flags and A/B testing of agent behaviors.
- **Observability**: Industrial-grade tracing and metrics for tracking agent performance at scale.

### 🛠️ 4. Developer Tools Integration (`src/lsp/`, `src/ui/`)
- **LSP Support**: Language Server Protocol integration for rich codebase diagnostics.
- **Pro TUI**: A full-featured terminal UI implementation for a high-intensity developer experience.
- **Web Inspector**: Real-time visual dashboard at `http://127.0.0.1:3000/inspect` for tracing hooks, tokens, and multi-agent loops.

---

## 🚦 Developer Quick Start

Requires **Node.js 20+** and **TypeScript 6.0**.

```bash
# 1. Setup environment
git clone https://github.com/wbzuo/StarkHarness.git
cd StarkHarness/Codex

# 2. Install dependencies (if you run locally without pre-built bundles)
npm install

# 3. Setup CLI globally
cd packages/cli && npm link && cd ../..

# 4. Scaffolding your first agent
stark init

# 5. Start the Web Inspector and Bridge
stark inspect
```

---

## 🔍 Capability Matrix

| Feature | Standard Edition | Codex Edition |
| :--- | :---: | :---: |
| **Language** | JavaScript | **TypeScript 6.0** |
| **Security** | Permission Gating | **Bash Semantic Analysis** |
| **Auth** | Token-based | **OAuth 2.0 + PKCE** |
| **Connectivity** | Local / HTTP | **Tmux Swarm / LSP** |
| **Multi-Modal** | Text only | **Voice & Web Access** |

---

## 📂 Project Structure

```text
src/
├── agents/          # Multi-agent orchestrator & specialized executors
├── bridge/          # Secure HTTP/WS communication layer
├── enterprise/      # GrowthBook & industrial observability
├── kernel/          # Turn loop, session, and prompt assembly
├── mcp/             # Model Context Protocol bridge
├── security/        # Bash parsers and security classifiers
├── providers/       # Live adapters for Anthropic & OpenAI
└── ui/              # TUI and REPL implementations
```

---

## 📄 License

MIT. Designed for engineers building the next generation of industrial-grade AI agents.
