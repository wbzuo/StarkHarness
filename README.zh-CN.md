# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E9%9B%B6%E4%BE%9D%E8%B5%96-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/%E6%B5%8B%E8%AF%95-64%20%E9%80%9A%E8%BF%87-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/%E6%9E%B6%E6%9E%84-Claude%20Code%20%E7%BA%A7%E5%88%AB-orange.svg" alt="Architecture">
</p>

---

### 🚀 "Claude Code" 级别的 AI Agent 运行时脚手架

**StarkHarness** 是一个原子化、高强度的运行框架，专为构建全功能 AI 编程助手而设计。它剥离了产品外壳的复杂性，提供了一个干净、可测试且**零外部依赖**的内核，实现了 Claude Code 等世界级 Agent 的核心运行逻辑。

> [**English**](./README.md) | [**简体中文**]

---

## 🏗 系统架构（全景图）

StarkHarness 在五个专业平面之间编排复杂的数据流：

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
│ 🛠️ 能力平面 (执行能力层)                                                     │
│    工具 (JSON Schema) • MCP (协议支持) • 命令 (Markdown 驱动)                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🤖 供应平面 (模型智能层)                                                     │
│    Anthropic-Live • OpenAI-Live • 自定义模型适配器 • 策略引擎                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 开发者指南：扩展框架

StarkHarness 采用了极致的插件化设计，您可以轻松扩展其能力：

### 1. 定义新工具 (`src/tools/`)
工具必须严格遵守 JSON Schema 契约，以便与 LLM 兼容。

```javascript
import { defineTool } from './types.js';

export const myTool = defineTool({
  name: 'git_status',
  capability: 'read',
  description: '获取当前 git 仓库的状态。',
  inputSchema: {
    type: 'object',
    properties: {
      include_untracked: { type: 'boolean', default: true }
    }
  },
  async execute(input, runtime) {
    const { stdout } = await runtime.shell('git status --short');
    return { ok: true, status: stdout };
  }
});
```

### 2. 多 Agent 编排 (`src/agents/`)
StarkHarness 原生支持生成并协调子 Agent：
- **`Orchestrator`**: 管理子 Agent 的全生命周期。
- **`Inbox`**: 处理 Agent 间的跨边界通信。
- **`Executor`**: 在隔离的环境中执行特定任务。

---

## 🔍 深度解析：内置能力特性

| 工具 | 所属能力 | 核心特性 |
| :--- | :--- | :--- |
| `read_file` | `read` | **行切片**: 支持 `offset` 和 `limit` 参数，精准读取超大文件的特定部分。 |
| `edit_file` | `write` | **全局替换**: 设置 `replace_all: true` 即可实现全代码库范围的精确更新。 |
| `shell` | `exec` | **受控执行**: 通过 `/bin/sh -c` 运行，默认 120s 超时及 4MB 输出缓冲。 |
| `mcp` | `protocol` | **MCP 桥接**: 连接任何符合 Model Context Protocol 标准的服务。 |
| `tasks` | `delegate` | **状态机管理**: 集成任务管理器（创建 ➔ 更新 ➔ 列表）。 |

---

## 🚦 CLI 命令参考

通过 `node src/main.js <command>` 执行指令。

| 命令 | 用途 |
| :--- | :--- |
| `registry` | **全量诊断**: 列出所有工具、命令、供应商及插件冲突。 |
| `doctor` | **健康检查**: 验证内核连通性及系统平面状态。 |
| `smoke-test` | **快速验证**: 执行端到端的 `read_file` 循环。 |
| `transcript` | **事件日志**: 回放完整日志，支持自定义过滤。 |
| `replay-runner` | **执行计划**: 评估并执行记录步骤的重放计划。 |

---

## 🏗 项目结构

```text
src/
├── kernel/          # Turn 循环、会话管理和提示词组装
├── permissions/     # 三级权限模型与沙箱 Profile
├── tools/           # 内置工具与 JSON Schema 定义
├── providers/       # Anthropic 与 OpenAI 的原生适配器
├── agents/          # 多 Agent 编排与专用执行器
├── mcp/             # 模型上下文协议 (MCP) 实现
├── plugins/         # 插件加载与冲突诊断
└── telemetry/       # 日志记录与事件 Sink
```

---

## 🗺 路线图与进度

- [x] **核心框架**: 高保真会话、Turn Loop 循环及持久化。
- [x] **原生供应商**: 内置 Anthropic 与 OpenAI 的 Live 支持。
- [x] **多 Agent**: 实现了多 Agent 编排与通信机制。
- [ ] **阶段 1**: 完整支持 MCP 1.0 规范。
- [ ] **阶段 2**: 开发具备语法高亮和自动补全的富交互 TUI / REPL。
- [ ] **阶段 3**: 实现确定性重放引擎，用于 Agent 故障分析。

---

## 📄 开源协议

MIT。专为探索 AI Agent 下一波浪潮的研究者与工程师打造。
