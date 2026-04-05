# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E9%9B%B6%E4%BE%9D%E8%B5%96-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/%E6%B5%8B%E8%AF%95-145%20%E9%80%9A%E8%BF%87-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/%E5%AE%89%E5%85%A8-%E5%A4%9A%E7%A7%9F%E6%88%B7%20Authz-blue.svg" alt="Security">
</p>

---

### 🚀 "Claude Code" 级别的 AI Agent 操作系统内核

**StarkHarness** 是一个原子化、高强度的运行框架，专为构建全功能 AI 编程助手而设计。与简单的包装器不同，它提供了一个干净、零依赖的 **Agent 操作系统 (AOS) 内核**，实现了 Claude Code 等世界级工具中核心的编排逻辑。

> [**English**](./README.md) | [**简体中文**]

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

### 🛡️ 2. 多租户授权隔离 (Authz) (`src/bridge/`)
超越简单的身份验证，StarkHarness 实现了 **Token 到 Profile** 的动态映射：
- **`tokenProfiles`**: 将不同的 API Key 映射到特定的沙箱配置（如 `locked` 或 `permissive`）。
- **上下文隔离**: 每个请求使用独立的 `PermissionEngine` 实例，确保“观察者”Token 无法越权执行管理级操作。
- **安全访问**: 支持 `Authorization: Bearer` (HTTP) 和 `?token=` (WS) 两种鉴权方式。

### 🔌 3. 细粒度实时订阅 (`src/bridge/ws`)
具备高精度的实时监控能力：
- **过滤器 (Filters)**: 订阅特定的 `traceId` 或 `agentId`，过滤掉背景噪音，专注关键链路。
- **基于 Topic**: 支持按 `runs`、`logs` 或 `system` 进行事件分组。
- **实时上下文**: 实时流式传输 `tool_use` 事件及其完整的追踪溯源。

### 🛡️ 4. 执行沙箱 (Execution Sandbox) (`src/runtime/sandbox.js`)
- **物理隔离**: 为 `shell` 和 `exec` 命令提供可选的环境隔离。
- **资源限制**: 为每个工具调用配置硬性的 CPU、内存和执行时间上限。

---

## 🔍 深度解析：内置能力特性

| 工具 | 所属能力 | 高级特性 |
| :--- | :--- | :--- |
| `read_file` | `read` | **行切片**: 支持 `offset` 和 `limit`，实现对大文件的外科手术式读取。 |
| `edit_file` | `write` | **全局替换**: 设置 `replace_all: true` 实现全代码库范围的批量更新。 |
| `shell` | `exec` | **受控执行**: 通过 `/bin/sh -c` 运行，默认 120s 超时及 4MB 输出缓冲。 |
| `mcp` | `protocol` | **协议桥接**: 为基于协议的工具扩展提供统一接口。 |
| `spawn_agent` | `delegate` | **编排化**: 创建具备特定角色和工具白名单的子代理。 |

---

## 🚦 CLI 命令参考

通过 `node src/main.js <command>` 执行指令。

| 命令 | 用途 |
| :--- | :--- |
| `registry` | **全量诊断**: 列出所有工具、命令、供应商及插件冲突。 |
| `doctor` | **健康检查**: 验证内核连通性及各平面状态。 |
| `smoke-test` | **快速验证**: 执行端到端的 `read_file` Turn 循环。 |
| `transcript` | **事件日志**: 回放完整日志，支持自定义过滤。 |
| `playback` | **状态摘要**: 快速汇总 Transcript 事件以查看当前状态。 |
| `replay-runner` | **执行计划**: 确定性地重放已记录的 Agent 执行步骤。 |

---

## 📂 项目结构

```text
src/
├── kernel/          # Turn 循环、会话管理、钩子及提示词组装
├── permissions/     # 权限引擎与沙箱 Profile
├── tools/           # JSON Schema 工具定义 (内置 + MCP)
├── providers/       # Anthropic 与 OpenAI 的原生流式适配器
├── agents/          # Orchestrator、Inbox 及专用执行器 Executor
├── bridge/          # 带有 Authz 隔离和细粒度订阅的 HTTP/WS 安全通信层
├── runtime/         # 执行沙箱与物理隔离逻辑
├── tasks/           # 调度器与任务状态机
├── memory/          # CLAUDE.md + 动态学习到的上下文
└── telemetry/       # 事件日志记录与分布式追踪 (traces.jsonl)
```

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

MIT。专为探索 AI Agent 下一波浪潮的研究者与工程师打造。
