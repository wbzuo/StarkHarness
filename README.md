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
- [Roadmap](./ROADMAP.md)
- [Version History](./docs/version-history.md)
- [Auto Mode](./docs/auto-mode.md)
- [Remote Control](./docs/remote-control.md)
- [Providers & Login](./docs/providers-and-login.md)
- [Web Search](./docs/web-search.md)
- [Debug](./docs/debug.md)
- [Voice Mode](./docs/voice-mode.md)

---

## 🌐 Docs Site

When bridge mode is running, open:

- `/docs`

The docs site is a dynamic, browser-based control surface. It combines:

- live runtime health
- app/env/web-access status
- blueprint and provider visibility
- quick links to the written docs
- a prompt playground backed by the active runtime

This is now the active local documentation experience on top of the bridge. It reads the current workspace docs instead of sending you to an older branch snapshot.

---

## ⚡ Quickstart

Initialize a starter app and launch it in development mode:

```bash
node --import tsx src/main.ts starter-apps
node --import tsx src/main.ts init --template=browser-research --target=./my-agent
cd my-agent
node --import tsx ../src/main.ts doctor --app=./starkharness.app.json
node --import tsx ../src/main.ts env-status --app=./starkharness.app.json
node --import tsx ../src/main.ts dev --app=./starkharness.app.json
```

The one-command path is now:

- `starter-apps`: discover built-in starter app templates
- `init`: scaffold a runnable app with config, hooks, skills, memory, and deployment files
- `env-status`: inspect the resolved `.env` / runtime feature configuration
- `dev`: load an app manifest and start the bridge using app startup defaults
- `doctor`: inspect runtime, app, and bundled `web-access` readiness

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
- **Filesystem Hooks**: Startup auto-discovers hook modules from `.starkharness/hooks/` and project-level `hooks/`.
- **Bundled Web Access Skill**: A vendored `skills/web-access` pack adds structured network strategy, Chrome CDP automation helpers, and reusable site knowledge as a first-class built-in skill.

### 🧱 4. App Scaffold + Manifest API (`src/app/`, `starter/`)
StarkHarness now includes a first-party app layer for downstream agent products:
- **App Manifest**: `starkharness.app.json` defines startup defaults and app-local paths for commands, skills, hooks, policy, providers, and plugins.
- **Scaffold Command**: `init` copies a runnable starter app plus deployment templates.
- **Starter Apps**: Browser research and workflow automation templates are bundled today.

### 📡 5. Streaming Bridge And Live Providers (`src/bridge/`, `src/providers/`)
Real-time execution is already a first-class concern:
- **Filters**: Subscribe to specific `traceId` or `agentId` to filter out background noise.
- **Topic-Based**: Group events by `runs`, `logs`, or `system`.
- **Live Providers**: Anthropic and OpenAI-compatible adapters support real tool loops and streaming responses.
- **Execution Isolation**: Local and process isolation are implemented today; Docker profiles exist but remain an early path.

### 🏢 6. Enterprise Control + Observability (`src/enterprise/`, `src/config/`)
The runtime now has a first-pass enterprise operations layer:
- **Custom Monitoring**: Post runtime events to a custom monitoring endpoint.
- **Custom Sentry**: Forward error-class events to a configured Sentry DSN.
- **GrowthBook / Feature Flags**: Pull remote flags and merge them with local env-defined flags.
- **Enterprise Commands**: Inspect observability, login/provider readiness, and merged feature flags directly from the CLI or bridge.

---

## 🔍 Deep Dive: Built-in Capabilities

| Tool | Capability | Advanced Features |
| :--- | :--- | :--- |
| `read_file` | `read` | **Line Slicing**: `offset` and `limit` for surgical reading. |
| `search` | `read` | **Workspace Search**: Text search with optional glob filtering. |
| `grep` | `read` | **Regex Search**: Regex matching with before/after context lines. |
| `tool_search` | `read` | **Tool Discovery**: Find tools by name or description at runtime. |
| `web_search` | `network` | **Search Engine Results**: Query the configured Bing-style web search endpoint. |
| `edit_file` | `write` | **Global Replace**: `replace_all: true` for bulk updates. |
| `notebook_edit` | `write` | **Notebook Editing**: Insert, replace, or delete `.ipynb` cells. |
| `shell` | `exec` | **Safe Execution**: `/bin/sh -c` with 120s timeout and 4MB buffer. |
| `repl_tool` | `exec` | **Session REPL**: Run JavaScript or Python snippets in a named REPL session. |
| `ask_user_question` | `delegate` | **Interactive Prompting**: Ask the user a direct question during a run. |
| `fetch_url` | `network` | **Remote Context**: Fetch HTTP content directly into the runtime. |
| `voice_transcribe` | `network` | **Voice Input**: Transcribe an audio file through the configured voice endpoint. |
| `browser_open` | `network` | **CDP Tab Control**: Open URLs in Chrome through the bundled web-access proxy. |
| `browser_eval` | `network` | **Browser Extraction**: Evaluate JavaScript against a live browser target. |
| `web_site_context` | `read` | **Site Knowledge**: Load bundled site-pattern guidance for known domains. |
| `spawn_agent` | `delegate` | **Orchestrated**: Create sub-agents with specific role whitelists. |

MCP tools are not a single hardcoded builtin. They are loaded dynamically and exposed with names like `mcp__server__tool`.

The bundled browser/web suite currently includes:

- `browser_targets`, `browser_open`, `browser_eval`
- `browser_click`, `browser_scroll`, `browser_screenshot`, `browser_close`
- `web_site_context`

---

## 🚦 CLI Command Reference

Execute commands via `node --import tsx src/main.ts <command>`.

| Command | Purpose |
| :--- | :--- |
| `blueprint` | **Runtime Blueprint**: Print the assembled runtime surface and active capabilities. |
| `registry` | **Full Diagnostic**: Lists all tools, commands, providers, and plugin conflicts. |
| `doctor` | **Health Check**: Validates harness wiring and system surfaces. |
| `status` | **Product Status**: Show app, provider, bridge, voice, web-access, and swarm summary data. |
| `starter-apps` | **Template Discovery**: List bundled app templates for one-command scaffolding. |
| `init` | **Scaffold**: Create a runnable app skeleton with starter assets and deployment files. |
| `app-status` | **App Metadata**: Show the loaded `starkharness.app.json` metadata. |
| `env-status` | **Env Config**: Show resolved `.env` values, feature switches, and bridge config. |
| `login` / `logout` | **Provider Auth**: Persist or remove provider settings in the app/workspace env file. |
| `login-status` | **Provider Login**: Show which provider backends are configured and ready. |
| `oauth-status` / `oauth-refresh` | **OAuth Profiles**: Inspect or refresh saved OAuth login state. |
| `observability-status` | **Enterprise Telemetry**: Show monitoring and Sentry integration status. |
| `feature-flags` | **Rollout State**: Show merged local and remote feature flags. |
| `growthbook-sync` | **Remote Flags**: Refresh feature flags from GrowthBook-compatible config. |
| `web-access-status` | **Browser/Web Status**: Show bundled `web-access` availability, scripts, and proxy endpoint details. |
| `voice-status` / `voice-transcribe` | **Voice Surface**: Inspect or use the built-in voice transcription path. |
| `plugin-marketplace-list` / `plugin-install` / `plugin-uninstall` | **Plugin Marketplace**: Discover and manage app-local plugin manifests. |
| `magic-docs` | **Doc Research**: Search the web and summarize the top documentation hits. |
| `dream` | **Memory Consolidation**: Extract durable memory from the current transcript. |
| `session-transcript` | **Transcript Storage**: Load the persisted JSONL conversation log for a session. |
| `enter-plan-mode` / `exit-plan-mode` / `plan-status` | **Plan Mode**: Toggle a read-only planning posture. |
| `enter-coordinator-mode` / `exit-coordinator-mode` / `coordinator-status` | **Coordinator Mode**: Switch into delegation-first orchestration. |
| `swarm-start` / `swarm-status` | **Swarm Execution**: Launch a scoped multi-agent swarm and inspect it. |
| `cron-list` / `cron-create` / `cron-delete` | **Schedules**: Persist lightweight cron-style automation entries. |
| `auto` | **Auto Mode**: Run the app automation default prompt or command without hand-written CLI choreography. |
| `run` | **Agent Loop**: Execute a full provider-backed agent run for a prompt. |
| `repl` / `chat` | **Interactive Mode**: Start the readline-based local REPL. |
| `serve` / `dev` | **Bridge Mode**: Start the HTTP, SSE, and WebSocket bridge, with `dev` honoring app startup defaults. |
| `smoke-test` | **Quick Verification**: Runs an end-to-end `read_file` turn loop. |
| `transcript` / `playback` | **Event Log**: Replay or summarize transcript events. |
| `replay-turn` / `replay-runner` | **Replay Aids**: Reconstruct recorded turn flow and replay plans. |

---

## 📦 App API

An app is defined by a `starkharness.app.json` manifest at the project root.

```json
{
  "name": "browser-research-app",
  "description": "A starter app for browser-first research and live web investigation.",
  "paths": {
    "commandsDir": "commands",
    "skillsDir": "skills",
    "hooksDir": "hooks",
    "policyPath": "config/policy.json",
    "providerConfigPath": "config/providers.json",
    "pluginManifestPath": "plugins/browser-pack.json"
  },
  "startup": {
    "mode": "serve",
    "host": "127.0.0.1",
    "port": 3000
  },
  "features": {
    "webAccess": true
  }
}
```

When loaded through `--app=...`, StarkHarness resolves app-local commands, hooks, skills, provider config, and policy paths automatically.

App-local `.env` files are also recognized through `paths.envPath` or the default `.env` at the app root. The runtime now centralizes bridge, provider, web-access, feature, and telemetry settings through this env layer.

The automation block is used by `auto` mode:

```json
{
  "automation": {
    "defaultPrompt": "Research the current topic and summarize the strongest evidence.",
    "defaultCommand": "",
    "streamOutput": true
  }
}
```

Provider login can now be managed through commands instead of manual file editing:

```bash
node --import tsx src/main.ts login --provider=openai --apiKey=sk-... --model=gpt-5
node --import tsx src/main.ts login-status
node --import tsx src/main.ts logout --provider=openai
```

OAuth-backed login is also available:

```bash
node --import tsx src/main.ts login --method=oauth --provider=openai --authorizeUrl=https://example.com/oauth/authorize --tokenUrl=https://example.com/oauth/token --clientId=starkharness
node --import tsx src/main.ts oauth-status
node --import tsx src/main.ts oauth-refresh --provider=openai
```

---

## 🌉 Remote Control / Bridge

Bridge mode now exposes a broader remote-control surface beyond `/run` and `/stream`.

Key HTTP endpoints include:

- `GET /health`
- `GET /status`
- `GET /session`
- `GET /app`
- `GET /blueprint`
- `GET /doctor`
- `GET /registry`
- `GET /env`
- `GET /web-access`
- `GET /docs`
- `GET /docs/page?name=...`
- `POST /command/:name`
- `POST /run`
- `POST /stream`

WebSocket `/ws` continues to support prompt runs, command execution, subscriptions, and filtered event streaming.

---

## 📂 Project Structure

```text
src/
├── app/             # App manifest loading and starter scaffolding
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
├── web-access/      # Bundled browser/CDP integration helpers for web-access
├── state/           # Session, agent, and worker persistence
├── ui/              # REPL surface
└── telemetry/       # Event logging and distributed trace (traces.jsonl)
```

Starter app and deployment assets live under:

```text
starter/
├── apps/            # Browser research + workflow automation starter apps
├── deploy/          # Dockerfile, docker-compose, .env.example, .dockerignore
├── commands/        # Reusable starter slash commands
├── hooks/           # Reusable starter hooks
├── skills/          # Reusable starter skills
└── config/          # Starter policy and provider config
```

---

## 🧭 Current Maturity

- **Already solid**: runtime assembly, multi-turn execution, mailbox-driven multi-agent orchestration, bridge authz, persistence, telemetry, and replay-oriented diagnostics.
- **Already product-visible on the active line**: app scaffold/manifest, OAuth profiles, session transcripts, local docs pages, plugin marketplace basics, voice transcription, and swarm convenience commands.
- **Partially implemented**: MCP beyond tool loading, higher-level web strategy beyond the current browser primitives, Docker isolation, richer remote session coordination, and the fuller TUI described in the roadmap.
- **Enterprise baseline available**: observability hooks, custom Sentry, GrowthBook-compatible remote flags, and remote-control diagnostics now exist as first-pass integrations.
- **Still early**: the package is `0.1.0`, remains `private`, and the repository does not yet ship a root `LICENSE` file.

For a grounded walkthrough of these tradeoffs, start with the [Architecture Deep Dive](./docs/architecture-deep-dive.md), the [Version History](./docs/version-history.md), and the [Contributor Guide](./docs/contributor-guide.md).

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
