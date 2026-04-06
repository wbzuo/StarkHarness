# StarkHarness Quick Start

## 1. Install

```bash
git clone https://github.com/wbzuo/StarkHarness.git
cd StarkHarness
npm install
```

Requires **Node.js 20+**.

## 2. Configure API Key

Create `.env` in the project root:

```bash
# At least one provider is required
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com   # Compatible with DeepSeek, etc.

# Or use Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Or any OpenAI-compatible endpoint
COMPATIBLE_API_KEY=xxx
COMPATIBLE_BASE_URL=https://your-api.com
```

## 3. Six Running Modes

```bash
# 1. Doctor — validate runtime wiring
node --import tsx src/main.ts doctor

# 2. Blueprint — print module topology
node --import tsx src/main.ts blueprint

# 3. Single command — execute any registered command
node --import tsx src/main.ts status
node --import tsx src/main.ts run --prompt="List project files"

# 4. REPL — interactive terminal chat
node --import tsx src/main.ts repl

# 5. TUI — dashboard-style terminal UI
node --import tsx src/main.ts tui

# 6. HTTP/WS server — API mode
node --import tsx src/main.ts serve --port=3000
```

## 4. Server Mode (`serve`)

After starting, the following endpoints are exposed:

```
GET  /health              — Health check
GET  /session             — Current session
GET  /providers           — Registered providers
GET  /tools               — Available tools
GET  /agents              — Agent list
GET  /tasks               — Task list
GET  /docs                — Dynamic browser docs and runtime dashboard
GET  /docs/page?name=...  — Local docs page from the active workspace

POST /run    {"prompt":"..."} — Synchronous chat
POST /stream {"prompt":"..."} — SSE streaming output
POST /command/doctor {}       — Execute a command

WS   /ws                  — WebSocket real-time subscription
```

## 5. Create Your Own App

```bash
# List available templates
node --import tsx src/main.ts starter-apps

# Scaffold a new project
node --import tsx src/main.ts init --target=my-agent --template=browser-research
```

Generated directory structure:

```
my-agent/
├── starkharness.app.json   <- App manifest (entry point)
├── .env                    <- API keys
├── commands/               <- Custom Markdown commands
├── skills/                 <- Skill definitions
├── hooks/                  <- Hook scripts
├── plugins/                <- Plugin manifests
└── config/
    ├── policy.json         <- Permission policy
    └── providers.json      <- Provider config
```

## 6. Core Concepts

| Concept | Description |
|---------|-------------|
| **Runtime** | Core runtime that assembles all subsystems |
| **Provider** | LLM backend (Anthropic / OpenAI / Compatible) |
| **Tool** | Callable capability for agents (read_file, shell, web_search, browser, voice, etc. — built into the default runtime) |
| **Command** | CLI command (doctor, status, run, serve, swarm, plugins, background jobs, etc. — all discoverable from `registry`) |
| **Agent** | Independent execution unit with role, tools, and mailbox |
| **Task** | Schedulable work unit with dependencies, retries, and dead letter queue |
| **Hook** | Interceptor (PreToolUse / PostToolUse / Stop) |
| **Skill** | Prompt augmentation that binds to agent execution |
| **Permission** | Layered authorization: capability -> tool -> path -> bash classifier |

## 7. Multi-Agent Orchestration

```bash
# Start a swarm (multi-agent parallel task execution)
node --import tsx src/main.ts swarm-start \
  --goal="Analyze project architecture" \
  --workers=3 \
  --roles=planner,executor,executor

# Launch multi-terminal swarm via tmux
node --import tsx src/main.ts swarm-launch \
  --tasks="Analyze frontend;;Analyze backend;;Analyze database"
```

## 8. Pipe Mode (CI/CD Integration)

```bash
# Read prompt from stdin
echo "Analyze security risks in this project" | node --import tsx src/main.ts pipe

# Auto mode — use app default prompt
node --import tsx src/main.ts auto
```

## 9. Coordinator Mode

```bash
# Enter coordinator mode on the current session
node --import tsx src/main.ts enter-coordinator-mode

# Resume that same session later and keep the mode
node --import tsx src/main.ts sessions
node --import tsx src/main.ts resume <session-id>

# Or use coordinator mode interactively inside REPL/TUI-backed workflows
# Tools restricted to: spawn_agent, send_message, tasks
```

## 10. Use as a Library (Programmatic)

```typescript
import { createRuntime } from './src/kernel/runtime.js';
import { loadRuntimeEnv } from './src/config/env.js';

const env = await loadRuntimeEnv({ cwd: process.cwd() });
const runtime = await createRuntime({
  session: { goal: 'my task', mode: 'interactive', cwd: process.cwd() },
  envConfig: env,
});

// Run a conversation
const result = await runtime.run('List the files in this directory');
console.log(result.finalText);

// Execute a command
const status = await runtime.dispatchCommand('status');

// Shutdown
await runtime.shutdown();
```

## 11. Common Commands Reference

```bash
# Session & state
node --import tsx src/main.ts sessions          # List sessions
node --import tsx src/main.ts resume <id>       # Resume a session

# Provider management
node --import tsx src/main.ts login --provider=openai --apiKey=sk-xxx
node --import tsx src/main.ts login-status
node --import tsx src/main.ts logout --provider=openai

# Plugin management
node --import tsx src/main.ts plugins
node --import tsx src/main.ts plugin-install --url=https://example.com/plugin.json
node --import tsx src/main.ts plugin-package-dxt --path=plugin.json

# Diagnostics
node --import tsx src/main.ts registry          # Full registry dump
node --import tsx src/main.ts traces            # Query trace spans
node --import tsx src/main.ts transcript        # Replay event log

# Background jobs
node --import tsx src/main.ts dream             # Manual memory consolidation
node --import tsx src/main.ts dream-start       # Enable background dreaming
node --import tsx src/main.ts cron-list         # List scheduled jobs
```
