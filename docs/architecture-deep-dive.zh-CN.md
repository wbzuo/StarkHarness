# 架构深潜

StarkHarness 是一个零依赖的 Agent Runtime 内核，目标是承载 Claude Code 风格的编程 Agent。它已经具备真实的运行时装配、多轮 Agent 循环、远程 Bridge、持久化、追踪，以及多 Agent 控制平面。更准确地说，它现在是一个“很认真的早期运行时内核”，而不是一个已经打磨成熟的终端产品。

> [English](./architecture-deep-dive.md) | [简体中文](./architecture-deep-dive.zh-CN.md)

## 当前状态概览

| 领域 | 当前状态 | 说明 |
| :--- | :--- | :--- |
| CLI 运行时 | 已可用 | `src/main.ts` 已支持命令模式、REPL/chat、pipe、resume 和 serve。 |
| 多轮 Agent 循环 | 已可用 | `src/kernel/runner.ts` 已负责 provider 调用、工具执行和上下文压缩。 |
| 多 Agent 编排 | 已可用 | `src/agents/` 与 `src/tasks/` 已实现 Inbox、worker loop、任务调度和执行。 |
| HTTP/SSE/WebSocket Bridge | 已可用 | `src/bridge/http.ts` 已暴露 `/run`、`/stream`、命令分发和过滤式 WS 事件。 |
| MCP 支持 | 部分完成 | 目前已有 stdio MCP 客户端和工具注入；完整 resources/prompts 仍在路线图中。 |
| 执行隔离 | 部分完成 | `local` 与 `process` 模式已可用；Docker 模式仍是最小占位实现。 |
| TUI / 富交互 REPL | 部分完成 | 目前已有 readline REPL；路线图中的 richer TUI 仍是后续工作。 |

## 运行时到底在做什么

### 1. 启动与运行时装配

[`src/kernel/runtime.ts`](../src/kernel/runtime.ts) 是整个系统的组合根。`createRuntime()` 会把下面这些模块装配起来：

- session 与 context
- permissions 与 sandbox profiles
- tasks、agents、inbox、orchestrator、scheduler
- provider registry 与 tool registry
- plugins、MCP tool proxies、memory、skills、hooks
- state storage 与 telemetry sinks
- bridge 与 REPL blueprints

这说明 StarkHarness 不只是“模块堆在一起”，而是已经存在一条真实的运行时装配路径。

### 2. 它故意保留了两条执行路径

StarkHarness 目前同时保留了更底层的工具回合接口，以及更新的多轮 Agent 对话路径。

- [`src/kernel/loop.ts`](../src/kernel/loop.ts) 负责单次工具 turn，流程是权限检查与 hooks 包裹下的 tool 执行。
- [`src/kernel/runner.ts`](../src/kernel/runner.ts) 负责完整 Agent 循环：构造消息、调用 provider、解析 tool calls、执行工具、回填 tool results、继续下一轮。

这反映了仓库的演进过程。它一方面保留了确定性的 tool-turn 能力，另一方面已经把 `runtime.run()` 演进成真实的 provider 驱动对话路径。

### 3. Context、Session 与压缩

[`src/kernel/context.ts`](../src/kernel/context.ts) 负责建模消息历史，并带有 token 估算和上下文压缩逻辑。当消息过多时，旧历史会被总结为摘要，只保留近期消息。

[`src/kernel/session.ts`](../src/kernel/session.ts) 定义了最小的持久化 session 结构，包括 session id、goal、mode、turns、messages、hook state 和时间戳。

### 4. Provider 与模型策略

[`src/providers/index.ts`](../src/providers/index.ts) 会注册内建 provider 家族，并把 provider 选择交给 [`src/providers/strategy.ts`](../src/providers/strategy.ts)。

目前 provider 层已经包括：

- [`src/providers/anthropic-live.ts`](../src/providers/anthropic-live.ts) 中的 Anthropic 原生流式支持
- [`src/providers/openai-live.ts`](../src/providers/openai-live.ts) 中的 OpenAI-compatible chat completions 与流式支持
- 基于 capability 的 provider 选择与 retry 逻辑

这部分是仓库目前比较扎实的区域之一，不只是抽象壳。

## 子系统逐层说明

### Kernel

Kernel 是整个运行时骨架：

- `runtime.js` 负责总装配
- `runner.js` 驱动多轮对话
- `loop.js` 执行单次工具回合
- `hooks.js` 提供 `PreToolUse`、`PostToolUse`、`Stop`、`PreCompact` 等生命周期拦截点
- `hook-loader.js` 负责从 `.starkharness/hooks` 与项目根 `hooks/` 自动发现文件系统 hooks
- `prompt.js` 与 `memory/` 一起参与系统提示词拼装

这个 hook 层实现得比较克制，更像控制平面，而不是一套很重的插件框架。

### Tools 与 MCP

内置工具定义在 [`src/tools/builtins/index.ts`](../src/tools/builtins/index.ts)。当前 builtin surface 包括：

- 工作区 IO：`read_file`、`write_file`、`edit_file`
- 发现类工具：`search`、`glob`
- 执行与联网：`shell`、`fetch_url`
- 委派能力：`spawn_agent`、`send_message`、`tasks`

MCP 不是一个硬编码的 builtin tool。当前实现方式是：

- [`src/mcp/client.ts`](../src/mcp/client.ts) 实现 stdio JSON-RPC 客户端
- [`src/mcp/config.ts`](../src/mcp/config.ts) 解析 MCP server 配置
- [`src/mcp/tools.ts`](../src/mcp/tools.ts) 将远程 MCP tools 映射成类似 `mcp__server__tool` 的 StarkHarness 工具名

这个区别在写文档时很重要。MCP 已经存在，但它是“动态注入的工具”，而不是一个固定内置命令。

### Agents、Tasks 与 Mailbox

多 Agent 这一层已经很像真正的系统：

- [`src/agents/manager.ts`](../src/agents/manager.ts) 负责 agent 定义与状态管理
- [`src/agents/inbox.ts`](../src/agents/inbox.ts) 实现 event/request/response mailbox，支持 correlation id 和 awaitable reply
- [`src/agents/executor.ts`](../src/agents/executor.ts) 为 agent 构造受限工具集并执行任务
- [`src/agents/orchestrator.ts`](../src/agents/orchestrator.ts) 负责任务分配、worker 监管、重试/超时/取消和 inbox work 处理
- [`src/tasks/store.ts`](../src/tasks/store.ts) 与 [`src/tasks/scheduler.ts`](../src/tasks/scheduler.ts) 负责任务持久化与调度

这是仓库最有辨识度的一层之一。它不只是 `spawn_agent`，还包括 mailbox worker 和 task orchestration。

### Bridge 与 UI

[`src/bridge/http.ts`](../src/bridge/http.ts) 是今天已经可用的远程入口。它目前支持：

- `POST /run`
- `POST /stream`（SSE）
- `POST /command/:name`
- `GET /health`、`/session`、`/providers`、`/tools`、`/agents`、`/tasks`、`/workers`、`/traces`
- 带 topic、`traceId`、`agentId` 过滤的 WebSocket 广播

[`src/bridge/index.ts`](../src/bridge/index.ts) 也很明确地把 bridge 状态写成：

- `web: ready`
- `ide: planned`
- `remote: planned`
- `mobile: planned`

[`src/ui/repl.ts`](../src/ui/repl.ts) 则提供了一个简单的 readline REPL。它已经能用，但还不是路线图中提到的 richer multi-session TUI。

### Memory、Skills、State 与 Telemetry

这四块共同让 StarkHarness 更像一个“运行时系统”：

- [`src/memory/index.ts`](../src/memory/index.ts) 会加载项目级 `CLAUDE.md` 以及 `.starkharness/memory` 下的动态记忆文件
- [`src/skills/loader.ts`](../src/skills/loader.ts) 负责从文件系统发现 skill packs
- [`src/skills/binder.ts`](../src/skills/binder.ts) 负责在运行时把匹配到的 skill 注入 system prompt
- [`src/state/store.ts`](../src/state/store.ts) 负责 session、runtime snapshot、agent state、transcript、worker status 的持久化
- [`src/telemetry/index.ts`](../src/telemetry/index.ts) 负责 JSONL transcript 和 trace spans 的记录

仓库现在还内置了 [`skills/web-access`](../skills/web-access/SKILL.md) 这套能力包。再配合 shell 工具里对 `CLAUDE_SKILL_DIR` 的传递，默认 runtime 已经具备无需额外安装即可使用的联网 / 搜索 / 浏览器工作流入口。

它们现在都还不算“重型系统”，但都已经真正接进了运行路径。

## 哪些部分今天看起来比较稳

- runtime 装配方式与子系统边界
- provider 驱动的多轮执行链路
- mailbox 与 worker 编排
- telemetry 与 replay 相关诊断能力
- bridge 的 auth/profile 映射与过滤式 WebSocket 订阅

## 哪些部分仍明显偏早期

- Docker 隔离路径仍然只是部分实现
- MCP 目前主要覆盖 stdio tool loading，而不是完整的 1.0 resources/prompts 能力
- REPL 已存在，但仍是轻量实现
- 仓库版本仍是 `0.1.0`，`package.json` 也还是 `private`
- 仓库根目录目前没有实际的 `LICENSE` 文件，因此 README 里关于 MIT 的表述在补齐 license file 之前都应谨慎对待

## 推荐阅读顺序

如果你想快速读懂这个仓库，建议按这个顺序看：

1. [`src/main.ts`](../src/main.ts)
2. [`src/kernel/runtime.ts`](../src/kernel/runtime.ts)
3. [`src/kernel/runner.ts`](../src/kernel/runner.ts)
4. [`src/tools/builtins/index.ts`](../src/tools/builtins/index.ts)
5. [`src/agents/orchestrator.ts`](../src/agents/orchestrator.ts)
6. [`src/bridge/http.ts`](../src/bridge/http.ts)
7. [`src/state/store.ts`](../src/state/store.ts)

这条路径能用最少的文件数，把 runtime shell、agent loop、tool surface、多 Agent 控制平面、远程 API 和持久化串起来。
