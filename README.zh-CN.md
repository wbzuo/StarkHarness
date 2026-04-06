# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E9%9B%B6%E4%BE%9D%E8%B5%96-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/%E6%B5%8B%E8%AF%95-node%3Atest-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/%E5%AE%89%E5%85%A8-%E5%A4%9A%E7%A7%9F%E6%88%B7%20Authz-blue.svg" alt="Security">
</p>

---

### 🚀 "Claude Code" 级别的 AI Agent 操作系统内核

**StarkHarness** 是一个原子化、高强度的运行框架，专为构建全功能 AI 编程助手而设计。与简单的包装器不同，它提供了一个干净、零依赖的 **Agent 操作系统 (AOS) 内核**，实现了 Claude Code 等世界级工具中核心的编排逻辑。

> [**English**](./README.md) | [**简体中文**]

---

## 📚 推荐先读

- [架构深潜](./docs/architecture-deep-dive.zh-CN.md)
- [贡献者指南](./docs/contributor-guide.zh-CN.md)
- [Roadmap](./ROADMAP.md)
- [版本历史](./docs/version-history.zh-CN.md)
- [Auto Mode](./docs/auto-mode.md)
- [Remote Control](./docs/remote-control.md)
- [Providers & Login](./docs/providers-and-login.md)
- [Web Search](./docs/web-search.md)
- [Debug](./docs/debug.md)
- [Voice Mode](./docs/voice-mode.zh-CN.md)

---

## 🌐 Docs Site

当 bridge 模式运行时，直接打开：

- `/docs`

这个 docs site 是一个动态可视化控制台，会把这些内容放到同一个浏览器页面里：

- live runtime 健康状态
- app / env / web-access 状态
- blueprint 与 provider 可视化信息
- 文档入口链接
- 基于当前 runtime 的 prompt playground

这已经变成当前活跃线上的本地文档体验层，会直接读取当前工作区文档，而不是把你丢到旧分支快照里。

---

## ⚡ 快速开始

初始化一个 starter app 并进入开发模式：

```bash
node --import tsx src/main.ts starter-apps
node --import tsx src/main.ts init --template=browser-research --target=./my-agent
cd my-agent
node --import tsx ../src/main.ts doctor --app=./starkharness.app.json
node --import tsx ../src/main.ts env-status --app=./starkharness.app.json
node --import tsx ../src/main.ts dev --app=./starkharness.app.json
```

当前这条一键链路是：

- `starter-apps`：发现内置 starter app 模板
- `init`：生成一个带配置、hooks、skills、记忆和部署文件的可运行 app
- `env-status`：检查解析后的 `.env` 与运行时 feature 配置
- `dev`：加载 app manifest，并按 app 启动默认值启动 bridge
- `doctor`：检查 runtime、app 和内置 `web-access` 的就绪情况

---

## 🏗 系统架构（全景图）

StarkHarness 在五个专业平面之间编排复杂的数据流，确保智能决策与能力执行之间的严格分离。

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧠 内核平面 (内核编排层)                                                     │
│    session ➔ runtime ➔ loop ➔ context ➔ events ➔ hooks ➔ prompt builder     │
│    ───────────────────────────────────────────────────────────────────      │
│    [身份定义] + [环境] + [CLAUDE.md] + [内存] + [工具 Schema] = 系统提示词     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ 控制平面 (安全与治理层)                                                   │
│    permissions/engine (策略合并)    • tasks/store (任务状态机)                │
│    agents/orchestrator (多 Agent 编排) • plugins/diagnostics (冲突检测)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ 能力平面 (能力执行层)                                                     │
│    工具 (JSON Schema) • MCP (协议桥接) • 命令 (Markdown 驱动)                │
│    ───────────────────────────────────────────────────────────────────      │
│    runtime/sandbox (物理隔离环境) • skills/loader (渐进式技能加载)           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🤖 智能平面 (供应策略层)                                                     │
│    Anthropic-Live (原生流式) • OpenAI-Live • 供应策略/模型路由引擎           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💎 专业级核心特性

### 🤖 1. 多代理编排 (Multi-Agent Orchestration) (`src/agents/`)
原生支持分层代理集群：
- **`Orchestrator`**: 管理专业化子代理的全生命周期和任务路由。
- **`Inbox`**: 为跨代理通信实现异步消息总线。
- **`Executor`**: 在隔离的子运行时中执行危险或特定的任务。

### 🛡️ 2. Bridge 与 Authz Profiles (`src/bridge/`, `src/permissions/`)
超越简单的身份验证，StarkHarness 已经实现了 **Token 到 Profile** 的动态映射：
- **`tokenProfiles`**: 将不同的 API Key 映射到特定的沙箱配置（如 `locked` 或 `permissive`）。
- **上下文隔离**: 每个请求使用独立的 `PermissionEngine` 实例，确保“观察者”Token 无法越权执行管理级操作。
- **安全访问**: 支持 `Authorization: Bearer` (HTTP) 和 `?token=` (WS) 两种鉴权方式，并暴露 HTTP、SSE 与 WebSocket 运行时接口。

### 🔌 3. MCP 与动态工具面 (`src/mcp/`, `src/tools/`)
运行时会把内置工具与协议驱动扩展组合在一起：
- **内置工作区工具**: 默认提供文件 IO、搜索、shell、委派与任务原语。
- **MCP 工具注入**: 远程 MCP tools 会被动态注册为带命名空间的 StarkHarness 工具。
- **JSON Schema Registry**: 整个工具面会以 schema 形式输出给 agent loop 和外部客户端。
- **文件系统 Hooks**: 启动时会自动发现 `.starkharness/hooks/` 和项目根 `hooks/` 下的 hook 模块。
- **内置 Web Access Skill**: 仓库内置了 `skills/web-access`，把联网策略、Chrome CDP 自动化辅助能力和站点经验积累作为基础 skill 提供出来。

### 🧱 4. App 脚手架与 Manifest API (`src/app/`, `starter/`)
StarkHarness 现在已经提供一层正式的 app 产品化接口：
- **App Manifest**: 用 `starkharness.app.json` 定义启动默认值，以及 commands、skills、hooks、policy、providers、plugins 的 app 本地路径。
- **脚手架命令**: `init` 会直接生成一个可运行 starter app 和部署模板。
- **Starter Apps**: 当前内置了浏览器研究型和工作流自动化型两个模板。

### 📡 5. 流式 Bridge 与 Live Providers (`src/bridge/`, `src/providers/`)
实时执行已经是系统的一等能力：
- **过滤器 (Filters)**: 订阅特定的 `traceId` 或 `agentId`，过滤掉背景噪音，专注关键链路。
- **基于 Topic**: 支持按 `runs`、`logs` 或 `system` 进行事件分组。
- **Live Providers**: Anthropic 与 OpenAI-compatible adapters 已支持真实工具循环和流式响应。
- **执行隔离**: 当前 `local` 和 `process` 路径已可用；Docker profiles 已存在，但仍属于较早期路径。

### 🏢 6. 企业级控制与可观测层 (`src/enterprise/`, `src/config/`)
运行时现在已经具备第一阶段的企业能力：
- **自定义监控上报**: 可将运行时事件上报到自定义监控端点。
- **自定义 Sentry**: 可将错误类事件转发到配置好的 Sentry DSN。
- **GrowthBook / Feature Flags**: 支持拉取远程 flags，并与本地 env flags 合并。
- **企业命令面**: 可以直接通过 CLI 或 bridge 查看 observability、provider/login、feature flags 状态。

---

## 🔍 深度解析：内置能力特性

| 工具 | 所属能力 | 高级特性 |
| :--- | :--- | :--- |
| `read_file` | `read` | **行切片**: 支持 `offset` 和 `limit`，实现对大文件的外科手术式读取。 |
| `search` | `read` | **工作区搜索**: 支持文本搜索，并可选配合 glob 过滤。 |
| `grep` | `read` | **正则搜索**: 支持 regex 匹配及前后文 context lines。 |
| `tool_search` | `read` | **工具发现**: 按名称或描述搜索当前 runtime 中可用工具。 |
| `web_search` | `network` | **搜索引擎结果**: 查询配置好的 Bing 风格 web search 端点。 |
| `edit_file` | `write` | **全局替换**: 设置 `replace_all: true` 实现全代码库范围的批量更新。 |
| `notebook_edit` | `write` | **Notebook 编辑**: 插入、替换或删除 `.ipynb` 单元格。 |
| `shell` | `exec` | **受控执行**: 通过 `/bin/sh -c` 运行，默认 120s 超时及 4MB 输出缓冲。 |
| `repl_tool` | `exec` | **会话内 REPL**: 在具名 JS/Python REPL 会话中执行代码片段。 |
| `ask_user_question` | `delegate` | **交互式提问**: 运行时可以直接向用户发出问题并拿到回答。 |
| `fetch_url` | `network` | **远程上下文**: 直接把 HTTP 内容拉入运行时。 |
| `voice_transcribe` | `network` | **语音输入**: 通过配置好的 voice 端点转写音频文件。 |
| `browser_open` | `network` | **CDP 标签页控制**: 通过内置 web-access proxy 在 Chrome 中打开页面。 |
| `browser_eval` | `network` | **浏览器内容提取**: 在真实浏览器目标页中执行 JavaScript。 |
| `web_site_context` | `read` | **站点知识读取**: 加载内置站点经验与模式说明。 |
| `spawn_agent` | `delegate` | **编排化**: 创建具备特定角色和工具白名单的子代理。 |

MCP tools 并不是一个单独硬编码的 builtin，而是以 `mcp__server__tool` 这样的形式动态注入。

当前内置的浏览器 / Web 工具套件包括：

- `browser_targets`、`browser_open`、`browser_eval`
- `browser_click`、`browser_scroll`、`browser_screenshot`、`browser_close`
- `web_site_context`

---

## 🚦 CLI 命令参考

通过 `node --import tsx src/main.ts <command>` 执行指令。

| 命令 | 用途 |
| :--- | :--- |
| `blueprint` | **运行时蓝图**: 打印当前组装出的 runtime surface 与能力面。 |
| `registry` | **全量诊断**: 列出所有工具、命令、供应商及插件冲突。 |
| `doctor` | **健康检查**: 验证内核连通性及各平面状态。 |
| `status` | **产品状态总览**: 汇总 app、provider、bridge、voice、web-access 和 swarm 状态。 |
| `starter-apps` | **模板发现**: 列出内置 starter app 模板。 |
| `init` | **脚手架**: 生成一个可运行 app 骨架及部署模板。 |
| `app-status` | **App 元信息**: 查看当前加载的 `starkharness.app.json`。 |
| `env-status` | **环境配置**: 查看解析后的 `.env`、feature 开关和 bridge 配置。 |
| `login` / `logout` | **Provider 认证**: 将 provider 配置写入或移出 app/workspace 的 env 文件。 |
| `login-status` | **Provider 登录状态**: 查看哪些模型后端已经配置完成。 |
| `oauth-status` / `oauth-refresh` | **OAuth 状态**: 查看或刷新已保存的 OAuth 登录信息。 |
| `observability-status` | **企业可观测状态**: 查看监控与 Sentry 集成配置。 |
| `feature-flags` | **Rollout 状态**: 查看合并后的本地与远程 feature flags。 |
| `growthbook-sync` | **远程 Flags**: 从 GrowthBook 兼容配置源刷新 flags。 |
| `web-access-status` | **浏览器/Web 状态**: 查看内置 `web-access` 是否可用、脚本是否齐全、代理地址是什么。 |
| `voice-status` / `voice-transcribe` | **Voice 能力面**: 查看或使用内置语音转写路径。 |
| `plugin-marketplace-list` / `plugin-install` / `plugin-uninstall` | **插件市场**: 发现并管理 app 本地插件清单。 |
| `magic-docs` | **文档研究**: 搜索并汇总相关技术文档。 |
| `dream` | **记忆整理**: 从当前 transcript 中提取更持久的 memory。 |
| `session-transcript` | **会话转录**: 读取 session 持久化下来的 JSONL 对话流。 |
| `enter-plan-mode` / `exit-plan-mode` / `plan-status` | **Plan Mode**: 切换到只读规划姿态。 |
| `enter-coordinator-mode` / `exit-coordinator-mode` / `coordinator-status` | **Coordinator Mode**: 切换到委派优先的编排模式。 |
| `swarm-start` / `swarm-status` | **Swarm 执行**: 启动一个受限的多 Agent swarm 并查看状态。 |
| `cron-list` / `cron-create` / `cron-delete` | **计划任务**: 持久化轻量 cron 风格计划定义。 |
| `auto` | **Auto Mode**: 直接运行 app automation 默认 prompt 或 command。 |
| `run` | **Agent 循环**: 对给定 prompt 执行完整的 provider-backed agent run。 |
| `repl` / `chat` | **交互模式**: 启动基于 readline 的本地 REPL。 |
| `serve` / `dev` | **Bridge 模式**: 启动 HTTP、SSE 与 WebSocket bridge，其中 `dev` 会采用 app 启动默认值。 |
| `smoke-test` | **快速验证**: 执行端到端的 `read_file` Turn 循环。 |
| `transcript` / `playback` | **事件日志**: 回放或汇总 transcript 事件。 |
| `replay-turn` / `replay-runner` | **回放辅助**: 重建已记录 turn 流程并生成 replay plan。 |

---

## 📦 App API

一个 app 由项目根目录下的 `starkharness.app.json` 定义。

```json
{
  "name": "browser-research-app",
  "description": "一个面向浏览器研究与实时网页调研的 starter app",
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

当你通过 `--app=...` 加载后，StarkHarness 会自动解析 app 本地的 commands、hooks、skills、provider config 和 policy 路径。

app 本地的 `.env` 现在也会被识别：默认读取 app 根目录 `.env`，或者使用 `paths.envPath` 指定。bridge、provider、web-access、feature 开关和 telemetry 配置都通过这层环境变量体系统一收口。

`auto` 模式会使用 app manifest 中的 automation 配置：

```json
{
  "automation": {
    "defaultPrompt": "自动调研当前主题并给出证据摘要",
    "defaultCommand": "",
    "streamOutput": true
  }
}
```

现在 provider 登录配置也可以通过命令管理，而不是手改文件：

```bash
node --import tsx src/main.ts login --provider=openai --apiKey=sk-... --model=gpt-5
node --import tsx src/main.ts login-status
node --import tsx src/main.ts logout --provider=openai
```

现在也支持 OAuth 登录链路：

```bash
node --import tsx src/main.ts login --method=oauth --provider=openai --authorizeUrl=https://example.com/oauth/authorize --tokenUrl=https://example.com/oauth/token --clientId=starkharness
node --import tsx src/main.ts oauth-status
node --import tsx src/main.ts oauth-refresh --provider=openai
```

---

## 🌉 Remote Control / Bridge

Bridge 模式现在已经不仅仅是 `/run` 和 `/stream`，还提供了更完整的远程控制面。

核心 HTTP 端点包括：

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

WebSocket `/ws` 继续支持 prompt 运行、命令执行、订阅控制和过滤式事件流。

---

## 📂 项目结构

```text
src/
├── app/             # App manifest 加载与 starter 脚手架
├── kernel/          # 运行时装配、Turn 循环、会话、钩子与提示词
├── permissions/     # 权限引擎与沙箱 Profile
├── tools/           # JSON Schema 工具定义 (内置 + MCP)
├── providers/       # Anthropic/OpenAI-compatible providers 与策略层
├── agents/          # Orchestrator、Inbox、Manager 与 Executors
├── commands/        # 内置命令注册表与诊断逻辑
├── bridge/          # 带 Authz Profiles 的 HTTP/SSE/WebSocket 运行时桥接层
├── mcp/             # MCP stdio client、配置解析与工具映射
├── runtime/         # 执行沙箱与物理隔离逻辑
├── tasks/           # 调度器与任务状态机
├── memory/          # CLAUDE.md + 动态学习到的上下文
├── skills/          # 技能发现与运行时 prompt 绑定
├── web-access/      # 面向 web-access 的内置浏览器/CDP 集成辅助层
├── state/           # session、agent 与 worker 持久化
├── ui/              # REPL 界面
└── telemetry/       # 事件日志记录与分布式追踪 (traces.jsonl)
```

Starter app 与部署模板位于：

```text
starter/
├── apps/            # 浏览器研究型 + 工作流自动化 starter apps
├── deploy/          # Dockerfile、docker-compose、.env.example、.dockerignore
├── commands/        # 可复用 starter slash commands
├── hooks/           # 可复用 starter hooks
├── skills/          # 可复用 starter skills
└── config/          # starter policy 与 provider config
```

---

## 🧭 当前成熟度

- **已经比较扎实**: runtime 装配、多轮执行、mailbox 驱动的多 Agent 编排、bridge authz、持久化、telemetry 与 replay 诊断。
- **当前活跃线已经产品化可见**: app scaffold/manifest、OAuth profiles、session transcript、本地 docs page、插件市场基础能力、voice 转写、以及 swarm 便捷命令。
- **部分实现**: 超出当前浏览器原语层的更高阶 Web 策略、超出 tool loading 的 MCP 能力、Docker 隔离路径、更成熟的 remote session，以及路线图中更丰富的 TUI。
- **企业基础能力已具备**: observability hooks、自定义 Sentry、GrowthBook 兼容远程 flags，以及远程控制诊断已经有第一阶段实现。
- **仍偏早期**: 包版本仍是 `0.1.0`，`package.json` 依然是 `private`，仓库根目录也还没有真正的 `LICENSE` 文件。

如果你想看更扎实的分析，建议继续读 [架构深潜](./docs/architecture-deep-dive.zh-CN.md)、[版本历史](./docs/version-history.zh-CN.md) 和 [贡献者指南](./docs/contributor-guide.zh-CN.md)。

---

## 🗺 路线图

- [x] **原生供应商**: 内置 Anthropic 与 OpenAI 的 Live 流式支持。
- [x] **安全桥接层**: 实现 **多租户 Authz Profile** 与 **WebSocket 订阅过滤器**。
- [x] **多代理编排**: 实现了 Orchestrator 与跨代理消息总线。
- [ ] **阶段 1**: 完整支持 MCP 1.0 规范（包括资源与提示词）。
- [ ] **阶段 2**: 开发具备语法高亮和多会话标签页的富交互 TUI / REPL。
- [ ] **阶段 3**: 实现分布式追踪可视化，用于多代理任务调试。

---

## 📄 开源协议

仓库当前并未附带根目录 `LICENSE` 文件。如果目标确实是 MIT，请先补齐 `LICENSE` 文件，再在下游场景中按 MIT 使用。
