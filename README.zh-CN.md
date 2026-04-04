# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E9%9B%B6%E4%BE%9D%E8%B5%96-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/%E6%B5%8B%E8%AF%95-64%20%E9%80%9A%E8%BF%87-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/%E6%9E%B6%E6%9E%84-Claude%20Code%20%E7%BA%A7%E5%88%AB-orange.svg" alt="Architecture">
</p>

---

### 🚀 "Claude Code" 级别的 AI Agent 运行时脚手架

**StarkHarness** 是一个专为构建全功能 AI 编程助手而设计的原子化、高强度运行框架。它剥离了产品外壳的复杂性，提供了一个干净、可测试且**零外部依赖**的内核，完美复刻了 Claude Code 等世界级 Agent 的核心运行逻辑。

> [**English**](./README.md) | [**简体中文**]

---

## 💎 核心理念

| 🛡️ 安全第一 | ⚙️ 精密机械 | 🧩 极致模块化 |
| :--- | :--- | :--- |
| **三级沙箱模型**（允许/询问/拒绝），支持工具级规则覆盖，确保内核级安全。 | **9 阶段钩子生命周期**，允许在 Agent 思考循环的每一个微小环节进行外科手术式干预。 | **零外部依赖**。完全基于 Node.js 20+ 原生能力构建，无需 `npm install`。 |

---

## 🏗 系统架构（全景图）

StarkHarness 在四个专业平面之间编排复杂的数据流：

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧠 内核平面 (内核编排层)                                                     │
│    session ➔ runtime ➔ loop ➔ context ➔ events ➔ hooks ➔ prompt builder     │
│    ───────────────────────────────────────────────────────────────────      │
│    [身份定义] + [环境] + [CLAUDE.md] + [内存] + [工具 Schema] = 系统提示词     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ 控制平面 (安全与治理层)                                                   │
│    permissions/engine (策略合并)    • tasks/store (任务状态机)                │
│    agents/manager (子 Agent 管理)    • plugins/diagnostics (冲突检测)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ 能力平面 (执行能力层)                                                     │
│    工具 (JSON Schema) • 技能 (三级渐进式加载) • 命令 (Markdown 驱动)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🤖 供应平面 (模型智能层)                                                     │
│    Anthropic (原生) • OpenAI • 自定义模型适配器 • MCP 协议桥接               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 关键机制与实战指南

### 🔗 1. 钩子流水线 (`src/kernel/hooks.js`)
拦截并修改 Agent 的行为逻辑。
- **`PreToolUse`**: 拦截危险操作，或在执行前**静默修改工具参数**（如重定向路径）。
- **`PostToolUse`**: 在工具输出到达 LLM 前进行脱敏或预处理。
- **`Stop`**: 如果核心目标（如单元测试通过）未达成，可强制阻止 Agent 退出。

### 🛡️ 2. 层级权限系统 (`src/permissions/`)
- **默认策略**: 基于能力的宽泛控制（如 `exec: ask`）。
- **工具覆盖**: 具体的工具规则（如 `tools.shell: deny`）具有最高优先级。
- **沙箱预设**: 提供 `permissive`（宽松）、`safe`（安全，默认）和 `locked`（只读）三种模式。

### 📚 3. 渐进式技能与内存
- **三级加载技能**: `发现` ➔ `正文` ➔ `引用`。按需加载，最大限度压缩 Token 成本。
- **双层内存**: 静态的 `CLAUDE.md` 项目规则 + 动态的 YAML 前置元数据（位于 `.starkharness/memory/`）。

---

## 🔍 深度解析：内置能力特性

| 工具 | 所属能力 | “隐藏”特性 |
| :--- | :--- | :--- |
| `read_file` | `read` | **行切片**: 支持 `offset` 和 `limit` 参数，精准读取超大文件的特定部分。 |
| `edit_file` | `write` | **全局替换**: 设置 `replace_all: true` 即可实现全代码库范围的精确更新。 |
| `shell` | `exec` | **受控执行**: 通过 `/bin/sh -c` 运行，默认 120s 超时及 4MB 输出缓冲。 |
| `search` | `read` | **自动忽略**: 内部自动过滤 `.git`、`node_modules` 和 `.starkharness`。 |
| `spawn_agent` | `delegate` | **角色化隔离**: 创建具备特定职责和独立工具白名单的子 Agent。 |
| `tasks` | `delegate` | **状态机管理**: 集成任务管理器（创建 ➔ 更新 ➔ 列表）。 |

---

## 🚦 开发者实战指引

```bash
# 1. 初始化环境
git clone https://github.com/wbzuo/StarkHarness.git && cd StarkHarness

# 2. 查看系统注册表 (查看所有工具、命令、供应商及潜在的插件冲突)
node src/main.js registry

# 3. 健康检查
node src/main.js doctor

# 4. 冒烟测试 (验证端到端的 Turn Loop 链路是否通畅)
node src/main.js smoke-test

# 5. 运行测试套件 (执行 64 个工业级单元测试)
npm test
```

---

## 🗺 路线图与进度

- [x] **核心框架**: 高保真会话、Turn Loop 循环及持久化。
- [x] **注册表与诊断**: 自动检测插件间的命令/工具名冲突。
- [ ] **阶段 1**: 实现支持流式输出的 Anthropic/OpenAI 供应后端。
- [ ] **阶段 2**: 完整支持 MCP (Model Context Protocol) 传输协议。
- [ ] **阶段 3**: 开发具备语法高亮和自动补全的富交互 TUI / REPL。
- [ ] **阶段 4**: 实现重放引擎，用于确定性调试失败的 Turn。

---

## 📄 开源协议

MIT。专为探索 AI Agent 下一波浪潮的研究者与工程师打造。
