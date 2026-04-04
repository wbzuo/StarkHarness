# StarkHarness

一个原子级、零依赖的 Agent Harness 脚手架，用于构建 Claude Code 级别的编码运行时。通过逆向工程 Claude Code 的内部架构——Hook 生命周期、JSON Schema 工具定义、系统提示词组装、Agent Turn Loop、Memory 栈、Skill 加载——然后将每个机制重新实现为干净、可测试的模块。

功能对标 Claude Code 是产品目标。内核大小被极限压缩。

## 快速开始

```bash
git clone git@github.com:wbzuo/StarkHarness.git
cd StarkHarness
npm test                    # 64 个测试，零依赖
node src/main.js blueprint  # 输出完整运行时蓝图
node src/main.js doctor     # 验证 Harness 连线
```

要求 **Node.js 20+**。无需 `npm install`——整个 Harness 仅使用 Node 内置模块。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│ 内核 (Kernel)                                           │
│  session → runtime → loop → context → events → hooks    │
│                                          ↓              │
│                                    prompt builder       │
├─────────────────────────────────────────────────────────┤
│ 控制面 (Control Planes)                                  │
│  permissions/engine  tasks/store  agents/manager        │
│  plugins/loader      plugins/diagnostics                │
├─────────────────────────────────────────────────────────┤
│ 工具层 (JSON Schema)                                     │
│  read_file  write_file  edit_file  shell  search        │
│  glob  fetch_url  spawn_agent  send_message  tasks      │
├─────────────────────────────────────────────────────────┤
│ 智能层 (Intelligence)                                    │
│  memory (CLAUDE.md + 自动记忆)                            │
│  skills (三级渐进式加载)                                   │
│  commands (YAML frontmatter + Markdown 正文)              │
├─────────────────────────────────────────────────────────┤
│ Provider 层                                              │
│  anthropic  openai  compatible (可插拔)                    │
└─────────────────────────────────────────────────────────┘
```

## 核心机制

### Hook 系统 — `src/kernel/hooks.js`

9 个生命周期事件，对标 Claude Code 的 Hook 架构。每一次工具调用、会话事件和停止决策都经过 Hook 管道。

```javascript
const hooks = new HookDispatcher();

// 拦截危险命令
hooks.register('PreToolUse', {
  matcher: 'shell',
  handler: async (ctx) => {
    if (ctx.toolInput.command.includes('rm -rf'))
      return { decision: 'deny', reason: '危险命令已拦截' };
    return { decision: 'allow' };
  },
});

// 会话启动时注入上下文
hooks.register('SessionStart', {
  handler: async () => ({
    additionalContext: '本项目使用 TDD，始终先写测试。',
  }),
});
```

**事件列表：** `PreToolUse` · `PostToolUse` · `Stop` · `SubagentStop` · `UserPromptSubmit` · `SessionStart` · `SessionEnd` · `PreCompact` · `Notification`

**匹配器：** 精确名称 (`shell`)、管道分隔 (`read_file|write_file`)、通配符 (`*`)、正则 (`mcp_.*`)

### JSON Schema 工具定义 — `src/tools/`

每个工具携带完整的 JSON Schema 定义，让 LLM 精确知道需要传递哪些参数——匹配 Anthropic 的 `tool_use` 格式。

```javascript
defineTool({
  name: 'read_file',
  capability: 'read',
  description: '从工作区读取文件',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件相对路径' },
      offset: { type: 'number', description: '起始行号（0-based）' },
      limit: { type: 'number', description: '最大读取行数' },
    },
    required: ['path'],
  },
  async execute(input, runtime) { /* ... */ },
});
```

`registry.toSchemaList()` 生成 LLM 可直接消费的工具列表，用于提示词注入。

### Agent Turn Loop — `src/kernel/loop.js`

完整的 Hook 门控执行管线：

```
权限检查 → PreToolUse Hook → 工具执行 → PostToolUse Hook → 记录 Turn
   ↓              ↓                              ↓
 deny/ask     deny → 中止                   注入 systemMessage
```

```javascript
const loop = new AgentLoop({ hooks, tools, permissions });
const result = await loop.executeTurn({
  tool: 'edit_file',
  input: { path: 'src/app.js', old_string: 'foo', new_string: 'bar' },
});
// result.ok === true | false（附带 reason）
```

`loop.requestStop(reason)` 触发 `Stop` Hook——Hook 可以阻止退出（例如"测试未通过"）。

### 系统提示词构建器 — `src/kernel/prompt.js`

从多个来源组装系统提示词，与 Claude Code 完全一致：

```
身份 → 环境 → CLAUDE.md → Memory → Hook 上下文 → 工具 Schema → 规则
```

```javascript
const prompt = promptBuilder.build({
  tools: registry.toSchemaList(),
  claudeMd: '# 规则\n始终使用 TDD',
  memory: '[user:profile] 资深 Go 工程师',
  hookContext: '学习模式已启用',
  cwd: '/projects/myapp',
  platform: 'darwin',
});
```

### Memory 系统 — `src/memory/index.js`

对标 Claude Code 的双层记忆模式：

- **静态层：** 项目根目录的 `CLAUDE.md`（+ 可选的用户级）
- **动态层：** `.starkharness/memory/` 下的 YAML frontmatter `.md` 文件

```markdown
---
name: user-role
type: user
description: 用户是资深 Go 工程师
---
深厚的 Go 专业经验，刚接触 React 和前端工具链。
用后端类比来解释前端概念。
```

类型：`user`（用户画像）· `feedback`（行为反馈）· `project`（项目上下文）· `reference`（外部参考）

### Skill 加载 — `src/skills/loader.js`

三级渐进式披露——metadata 始终廉价加载，body 按需加载，references 在需要深度上下文时加载：

| 层级 | 方法 | 加载内容 |
|------|------|----------|
| 1 | `discoverSkills()` | 仅 frontmatter（name、description、version） |
| 2 | `loadSkill(dir)` | 完整 SKILL.md 正文 |
| 3 | `loadReferences(dir)` | `references/*.md` 文件 |

`matchSkill(query)` 通过匹配 description 中的引号触发短语将用户查询路由到对应 Skill，并以词重叠作为兜底。

### Command 解析器 — `src/commands/parser.js`

Claude Code 风格的命令：YAML frontmatter 元数据 + Markdown 正文提示词。

```markdown
---
description: 审查代码变更
allowed-tools: Read, Bash(git:*)
model: sonnet
argument-hint: [file-or-directory]
---

审查每个变更文件：
- 安全漏洞
- 性能问题
- 测试覆盖空缺
```

`loadCommandsFromDir(path)` 从目录批量加载所有 `.md` 命令文件。

### 权限引擎 — `src/permissions/`

三级权限模型：`allow` / `ask` / `deny`，支持能力域默认值和逐工具覆盖。

```javascript
// 默认策略
{ read: 'allow', write: 'ask', exec: 'ask', network: 'ask', delegate: 'allow' }

// 工具级覆盖
{ exec: 'allow', tools: { shell: 'deny' } }  // 允许 exec，但专门阻止 shell
```

**沙箱配置：** `permissive`（全部允许）· `safe`（默认）· `locked`（拒绝 write/exec/network/delegate）

**策略文件：** JSON 文件在启动时合并——支持工作区级和用户级策略。

## CLI 命令

```bash
node src/main.js <command> [options]
```

| 命令 | 说明 |
|------|------|
| `blueprint` | 输出完整运行时结构（JSON） |
| `doctor` | 验证 Harness 连线和表面计数 |
| `providers` | 列出已注册的模型 Provider |
| `provider-config` | 显示 Provider 配置键 |
| `sessions` | 列出持久化的会话 |
| `session-summary` | 当前会话状态（agents、tasks、turns） |
| `resume <id>` | 恢复持久化的会话 |
| `tasks` | 列出跟踪的任务 |
| `agents` | 列出已启动的代理 |
| `plugins` | 插件清单、能力、诊断 |
| `profiles` | 列出沙箱配置 |
| `transcript` | 回放事件日志 |
| `playback` | 汇总 transcript 事件 |
| `replay-turn` | 确定性 turn 回放骨架 |
| `replay-runner` | 回放执行计划 |
| `complete` | Stub Provider 补全（`--provider=openai --prompt=...`） |

## 插件系统

插件通过 manifest 注册命令、工具和能力。冲突检测会捕获跨插件的重名。

```javascript
const runtime = await createRuntime({
  plugins: [{
    name: 'browser-pack',
    version: '0.1.0',
    capabilities: ['browser', 'dom-inspect'],
    commands: [{ name: 'screenshot', description: '截取页面' }],
    tools: [{ name: 'click', capability: 'browser', output: 'clicked' }],
  }],
});
```

## Agent 编排

有界子代理，支持基于描述的路由、模型选择和工具白名单。

```javascript
// 启动专家代理
await runtime.dispatchTurn({
  tool: 'spawn_agent',
  input: {
    role: 'code-reviewer',
    description: '审查代码的安全性和性能问题',
    model: 'sonnet',
    tools: ['read_file', 'search', 'glob'],
  },
});

// 按描述路由
const agent = runtime.agents.matchAgent('审查这段代码的安全性');
```

## 项目结构

```
src/
├── kernel/          # 核心运行时（session、loop、context、events、hooks、prompt）
├── permissions/     # 权限引擎、策略文件、沙箱配置
├── tools/           # 工具类型（JSON Schema）、注册表、10 个内置工具
├── commands/        # 命令注册表（17 个内置）+ YAML frontmatter 解析器
├── memory/          # CLAUDE.md + 动态自动记忆
├── skills/          # 三级渐进式 Skill 加载器
├── agents/          # Agent 管理器（描述驱动路由）
├── plugins/         # 插件加载器 + 冲突诊断
├── providers/       # 模型 Provider 注册表（anthropic、openai、compatible）
├── tasks/           # 任务所有权和跟踪
├── state/           # JSON 文件持久化（.starkharness/）
├── telemetry/       # 事件日志写入 transcript.jsonl
├── capabilities/    # 功能模块映射
├── workspace/       # Git/worktree 表面（占位）
├── bridge/          # IDE/远程桥接（占位）
├── ui/              # REPL 表面（占位）
└── main.js          # CLI 入口

tests/               # 64 个测试，8 个测试文件，node:test，零依赖
docs/plans/          # 实现计划
```

## Claude Code 对齐

| 机制 | Claude Code | StarkHarness |
|------|-------------|-------------|
| Hook 系统 | 9 个生命周期事件，command/prompt 类型 | `HookDispatcher`——9 个事件、匹配器、deny-wins |
| 工具 Schema | 每个工具的 JSON Schema 供 LLM 消费 | 每个 `defineTool` 都有 `inputSchema` |
| 系统提示词 | CLAUDE.md + 工具 + memory + hooks | `SystemPromptBuilder` 组装所有来源 |
| Turn Loop | PreToolUse → Execute → PostToolUse | `AgentLoop.executeTurn()` 完整 Hook 链 |
| 权限 | allow/ask/deny + 工具级覆盖 | `PermissionEngine` + 策略文件 + profiles |
| Memory | CLAUDE.md + auto-memory YAML frontmatter | `MemoryManager` 双层模式完全对标 |
| Skills | 三级渐进式披露 | `SkillLoader`——discover → load → references |
| Commands | YAML frontmatter + Markdown 提示词正文 | `parseCommandFile` + allowed-tools 白名单 |
| Agents | 描述路由、model/tools 字段 | `AgentManager.matchAgent()` + spawn 选项 |
| 插件 | 文件夹 manifest + 冲突检测 | `PluginLoader` + diagnostics |

## 适合谁

- 想从零构建 Claude Code / Codex 级运行时的开发者
- 研究 Agent Harness 最小核心结构的架构师
- 不想从庞大耦合的成熟产品代码开始的工程师
- 需要把权限、日志、插件、Provider、状态这些基础层先搭扎实的团队

## 后续路线

1. **真实 LLM 集成** — Anthropic Messages API + 流式 `tool_use` blocks
2. **MCP 协议桥接** — stdio、SSE、HTTP、WebSocket 传输层
3. **交互式 REPL** — 权限提示、会话管理、斜杠命令
4. **Transcript 回放引擎** — 从事件日志确定性重执行
5. **插件自动发现** — 文件夹约定 + npm 加载

## License

MIT
