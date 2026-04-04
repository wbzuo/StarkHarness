# StarkHarness 中文说明

## 项目简介

**StarkHarness** 是一个从零构建的、面向 **Claude Code / Codex / agentic coding runtime** 这一类系统的运行时内核脚手架。

它的核心目标不是做一个花哨的产品壳，而是先把这些系统真正关键的部分拆干净、做扎实：

- 会话管理
- 工具注册与调度
- 权限控制
- 状态持久化
- 插件扩展
- Provider 抽象
- 事件日志与回放
- 多代理/任务编排骨架

一句话概括：

> **StarkHarness = 一个极简内核、强约束、可回放、可扩展的编码 Agent Harness。**

---

## 设计目标

StarkHarness 的设计不是简单“模仿 Claude Code 的界面”，而是抽取其底层运行时模式，并在架构上做得更清晰。

### 设计原则

1. **功能目标对标 Claude Code 级系统**
2. **内核极小化，外围能力模块化**
3. **所有能力通过显式注册进入 runtime**
4. **权限、状态、工具、插件必须可审计**
5. **运行日志可回放、可过滤、可总结**
6. **避免把 Provider/UI/Telemetry 耦合进核心内核**

---

## 当前实现状态

截至当前版本，StarkHarness 已经从“空壳脚手架”推进到了一个可运行、可测试、可扩展的 Harness 原型。

### 已实现能力

#### 1. Kernel 核心层
位于：`src/kernel/`

- `session.js`：会话对象模型
- `runtime.js`：运行时组装中心
- `loop.js`：turn 执行入口
- `context.js`：上下文 envelope
- `events.js`：基础 EventBus

#### 2. Tool 系统
位于：`src/tools/`

已内建工具：

- `read_file`
- `write_file`
- `edit_file`
- `shell`
- `search`
- `glob`
- `fetch_url`
- `spawn_agent`
- `send_message`
- `tasks`

支持：
- 工具注册
- 工具级权限判定
- 插件工具注入

#### 3. 权限系统
位于：`src/permissions/`

支持五大能力域：

- `read`
- `write`
- `exec`
- `network`
- `delegate`

权限值：
- `allow`
- `ask`
- `deny`

还支持：
- policy 文件加载
- tool-scoped 覆盖
- sandbox profiles

内置 profile：
- `permissive`
- `safe`
- `locked`

#### 4. 状态持久化
位于：`src/state/store.js`

持久化位置：`.starkharness/`

包括：
- `sessions/<id>.json`
- `runtime.json`
- `transcript.jsonl`

支持：
- session 保存/恢复
- runtime snapshot 保存/恢复
- session 列表

#### 5. Provider 抽象
位于：`src/providers/`

目前已拆分为独立模块：
- `anthropic.js`
- `openai.js`
- `compatible.js`
- `base.js`
- `config.js`

已实现：
- Provider 注册中心
- Provider request/response envelope
- Provider config 文件加载
- `complete()` 调用路径

当前仍为 stub provider，但接口已经稳定。

#### 6. Plugin 系统
位于：`src/plugins/`

支持 plugin manifest：
- `capabilities`
- `commands`
- `tools`

支持：
- manifest 校验
- manifest 文件加载
- capability 列表
- plugin command 注入
- plugin tool 注入
- command/tool 命名冲突诊断

#### 7. Command 系统
位于：`src/commands/registry.js`

当前已经支持多种 runtime 命令，包括：

- `blueprint`
- `doctor`
- `run`
- `resume`
- `session-summary`
- `sessions`
- `providers`
- `provider-config`
- `tasks`
- `agents`
- `plugins`
- `profiles`
- `transcript`
- `playback`
- `replay-turn`
- `replay-runner`
- `complete`

#### 8. Transcript / Replay 能力
位于：`src/telemetry/` 与 `src/replay/`

支持：
- 事件日志追加写入（JSONL）
- transcript replay
- transcript 过滤
- transcript summary
- replay turn skeleton
- replay runner plan

#### 9. 编排骨架
位于：
- `src/agents/manager.js`
- `src/tasks/store.js`

当前支持：
- 代理记录与持久化
- 任务记录与持久化
- send_message 会话消息记录
- 运行时 resume 后恢复 agent/task 状态

---

## 当前目录结构

```text
StarkHarness/
├── README.md
├── README-zh.md
├── package.json
├── src/
│   ├── main.js
│   ├── kernel/
│   │   ├── session.js
│   │   ├── runtime.js
│   │   ├── loop.js
│   │   ├── context.js
│   │   └── events.js
│   ├── permissions/
│   │   ├── engine.js
│   │   ├── policy.js
│   │   └── profiles.js
│   ├── providers/
│   │   ├── base.js
│   │   ├── anthropic.js
│   │   ├── openai.js
│   │   ├── compatible.js
│   │   ├── config.js
│   │   └── index.js
│   ├── tools/
│   │   ├── types.js
│   │   ├── registry.js
│   │   └── builtins/
│   ├── plugins/
│   │   ├── loader.js
│   │   └── diagnostics.js
│   ├── replay/
│   │   └── runner.js
│   ├── tasks/
│   │   └── store.js
│   ├── agents/
│   │   └── manager.js
│   ├── state/
│   │   └── store.js
│   ├── telemetry/
│   │   └── index.js
│   ├── commands/
│   │   └── registry.js
│   ├── capabilities/
│   │   └── index.js
│   ├── bridge/
│   │   └── index.js
│   ├── workspace/
│   │   └── index.js
│   └── ui/
│       └── repl.js
└── tests/
    └── runtime.test.js
```

---

## 如何运行

### 环境要求

- Node.js >= 20

### 安装

当前无外部依赖，因此无需 `npm install`。

### 运行基础命令

```bash
node src/main.js blueprint
node src/main.js doctor
node src/main.js providers
node src/main.js sessions
```

### 运行测试

```bash
npm test
```

---

## 常用命令示例

### 1. 查看蓝图
```bash
node src/main.js blueprint
```

### 2. 查看运行时诊断
```bash
node src/main.js doctor
```

### 3. 查看可用沙箱 profile
```bash
node src/main.js profiles
```

### 4. 使用 policy 文件
```bash
node src/main.js doctor --policy=/path/to/policy.json
```

示例 policy：

```json
{
  "exec": "allow",
  "write": "deny",
  "tools": {
    "shell": "deny"
  }
}
```

### 5. 查看 provider 配置摘要
```bash
node src/main.js provider-config --providers=/path/to/providers.json
```

示例 providers 配置：

```json
{
  "openai": {
    "model": "gpt-5",
    "baseUrl": "https://example.com"
  },
  "anthropic": {
    "model": "claude-3-7-sonnet-latest"
  }
}
```

### 6. 触发 provider completion
```bash
node src/main.js complete --provider=openai --prompt="draft harness"
```

### 7. 查看 transcript
```bash
node src/main.js transcript
node src/main.js transcript --event=command:complete
node src/main.js transcript --query=provider --limit=5
```

### 8. 查看 playback 摘要
```bash
node src/main.js playback
```

### 9. 查看 replay 计划
```bash
node src/main.js replay-runner
node src/main.js replay-turn
```

### 10. 使用插件 manifest
```bash
node src/main.js plugins --plugin=/path/to/plugin.json
```

插件 manifest 示例：

```json
{
  "name": "tool-pack",
  "version": "0.1.0",
  "capabilities": ["browser"],
  "commands": [
    {
      "name": "plugin:hello",
      "description": "Say hello",
      "output": "hello-from-plugin"
    }
  ],
  "tools": [
    {
      "name": "plugin_tool",
      "capability": "delegate",
      "output": "tool-output"
    }
  ]
}
```

---

## 已实现的关键架构优势

### 1. 权限模型足够清晰
相较很多大而混杂的 Agent CLI，StarkHarness 的权限层更容易维护：

- 能力域少而稳定
- policy 结构可序列化
- 支持 profile + file + runtime override 三层合并
- 支持 per-tool 覆盖

### 2. 插件冲突不再静默覆盖
`PluginLoader` + diagnostics 明确暴露：
- command 冲突
- tool 冲突

这为后续做：
- 插件优先级
- 冲突策略
- 兼容性报告

打下了基础。

### 3. Transcript 是一等公民
很多系统把日志当附属品，而 StarkHarness 把运行日志变成可查询、可过滤、可回放的正式接口：

- `transcript`
- `playback`
- `replay-turn`
- `replay-runner`

### 4. Provider 抽象已经具备演化空间
虽然当前 provider 还是 stub，但 envelope、config、registry 都已经就位，后续替换为真实 Anthropic/OpenAI 请求时不会破坏整体设计。

---

## 当前差距

虽然项目已经具备了很强的内核脚手架能力，但离“真正可用的 Claude Code 级运行时”还有几个关键空缺。

### 1. 还没有真实 LLM loop
当前 `loop.js` 仍然只是 turn 执行入口，不包含：

- 消息构建
- system prompt 注入
- provider 调用
- tool_use 解析
- tool 调用后的循环迭代

### 2. 还没有 Hook 系统
当前只有 `EventBus`，还没有真正的：
- PreToolUse
- PostToolUse
- Stop
- SessionStart
- SessionEnd
- PermissionDenied

这类可拦截生命周期。

### 3. 还没有 Tool Schema / System Prompt Builder
目前工具是运行时对象，但还没有把它们系统化转换为：
- LLM 可理解的 schema
- tool descriptions
- system message 注入片段

### 4. Agent 仍是骨架
`spawn_agent` 当前只是持久化和管理数据，不是真正的：
- 子进程
- 子会话
- 并发执行
- mailbox / inbox / handoff

### 5. Plugin 还未执行真实逻辑
当前插件 command/tool 是 declarative mock，不执行外部 JS 模块逻辑。

### 6. 还没有 MCP / LSP / Skills
目前这些都还未接入。

---

## 建议的后续优先级

### P0 — 真实 LLM Turn Loop
目标：让 StarkHarness 从“运行时骨架”变成“真实 Agent Loop”。

建议实现：
1. user input -> messages
2. build system prompt
3. call provider
4. parse tool calls
5. dispatch tools
6. append tool results
7. repeat until final answer

### P1 — Hook System
把 `EventBus` 升级成真正的 hook/interceptor 系统。

### P2 — System Prompt Builder
将 `ToolRegistry`、policy、plugin 状态转成可注入模型的统一 prompt/schema。

### P3 — 真实 Provider 实现
先接真实 Anthropic，再接 OpenAI/兼容层。

### P4 — Skills / MCP / LSP
把 StarkHarness 从“内核”推进为“可用编码运行时”。

---

## 测试情况

当前测试覆盖包括：

- 权限默认行为
- sandbox profile
- policy 文件覆盖
- tool-scoped policy
- session persistence
- runtime resume
- 文件读写编辑
- 搜索与 glob
- 任务/代理/消息持久化
- provider completion stub
- transcript replay/filter
- plugin command/tool 注入
- plugin 冲突检测
- provider config 摘要
- replay runner
- session summary

这使它虽然还是早期项目，但**核心 contract 已经比较稳**。

---

## 适合谁

StarkHarness 适合这些场景：

1. 你想自己造一个 Claude Code / Codex 类 runtime
2. 你想研究 Agent Harness 的最小核心结构
3. 你不想从庞大、耦合严重的成熟产品代码开始
4. 你想把权限、日志、插件、provider、状态这些基础层先搭扎实

---

## 不适合谁

如果你现在就需要一个“开箱即用、立刻能当生产级 Claude Code 替代品”的东西，StarkHarness 还不是那个阶段。

它现在更像：

> **一个已经跨过概念验证阶段、进入可持续演化阶段的 Agent Runtime 内核项目。**

---

## 仓库地址

GitHub：

- <https://github.com/wbzuo/StarkHarness>

---

## 总结

StarkHarness 的价值不在于“代码很多”，而在于它已经把 Claude Code 类系统最重要的基础抽象拆出来了：

- Tool
- Permission
- Session
- State
- Plugin
- Provider
- Transcript
- Replay
- Orchestration Skeleton

如果后续继续沿着这条路线补齐：
- 真正的 LLM 循环
- Hook 系统
- Prompt Builder
- MCP/LSP/Skills
- 真正的子代理执行

那么它就能从一个**极其干净的内核脚手架**，成长为一个真正可用的编码运行时。
