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

### 📡 4. 流式 Bridge 与 Live Providers (`src/bridge/`, `src/providers/`)
实时执行已经是系统的一等能力：
- **过滤器 (Filters)**: 订阅特定的 `traceId` 或 `agentId`，过滤掉背景噪音，专注关键链路。
- **基于 Topic**: 支持按 `runs`、`logs` 或 `system` 进行事件分组。
- **Live Providers**: Anthropic 与 OpenAI-compatible adapters 已支持真实工具循环和流式响应。
- **执行隔离**: 当前 `local` 和 `process` 路径已可用；Docker profiles 已存在，但仍属于较早期路径。

---

## 🔍 深度解析：内置能力特性

| 工具 | 所属能力 | 高级特性 |
| :--- | :--- | :--- |
| `read_file` | `read` | **行切片**: 支持 `offset` 和 `limit`，实现对大文件的外科手术式读取。 |
| `search` | `read` | **工作区搜索**: 支持文本搜索，并可选配合 glob 过滤。 |
| `edit_file` | `write` | **全局替换**: 设置 `replace_all: true` 实现全代码库范围的批量更新。 |
| `shell` | `exec` | **受控执行**: 通过 `/bin/sh -c` 运行，默认 120s 超时及 4MB 输出缓冲。 |
| `fetch_url` | `network` | **远程上下文**: 直接把 HTTP 内容拉入运行时。 |
| `spawn_agent` | `delegate` | **编排化**: 创建具备特定角色和工具白名单的子代理。 |

MCP tools 并不是一个单独硬编码的 builtin，而是以 `mcp__server__tool` 这样的形式动态注入。

---

## 🚦 CLI 命令参考

通过 `node src/main.js <command>` 执行指令。

| 命令 | 用途 |
| :--- | :--- |
| `blueprint` | **运行时蓝图**: 打印当前组装出的 runtime surface 与能力面。 |
| `registry` | **全量诊断**: 列出所有工具、命令、供应商及插件冲突。 |
| `doctor` | **健康检查**: 验证内核连通性及各平面状态。 |
| `run` | **Agent 循环**: 对给定 prompt 执行完整的 provider-backed agent run。 |
| `repl` / `chat` | **交互模式**: 启动基于 readline 的本地 REPL。 |
| `serve` | **Bridge 模式**: 启动 HTTP、SSE 与 WebSocket bridge。 |
| `smoke-test` | **快速验证**: 执行端到端的 `read_file` Turn 循环。 |
| `transcript` / `playback` | **事件日志**: 回放或汇总 transcript 事件。 |
| `replay-turn` / `replay-runner` | **回放辅助**: 重建已记录 turn 流程并生成 replay plan。 |

---

## 📂 项目结构

```text
src/
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
├── state/           # session、agent 与 worker 持久化
├── ui/              # REPL 界面
└── telemetry/       # 事件日志记录与分布式追踪 (traces.jsonl)
```

---

## 🧭 当前成熟度

- **已经比较扎实**: runtime 装配、多轮执行、mailbox 驱动的多 Agent 编排、bridge authz、持久化、telemetry 与 replay 诊断。
- **部分实现**: 超出 tool loading 的 MCP 能力、Docker 隔离路径，以及路线图中更丰富的 TUI。
- **仍偏早期**: 包版本仍是 `0.1.0`，`package.json` 依然是 `private`，仓库根目录也还没有真正的 `LICENSE` 文件。

如果你想看更扎实的分析，建议继续读 [架构深潜](./docs/architecture-deep-dive.zh-CN.md) 和 [贡献者指南](./docs/contributor-guide.zh-CN.md)。

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
