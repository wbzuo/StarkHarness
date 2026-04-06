# StarkHarness 快速开始

## 1. 安装

```bash
git clone https://github.com/wbzuo/StarkHarness.git
cd StarkHarness
npm install
```

需要 **Node.js 20+**。

## 2. 配置 API Key

在项目根目录创建 `.env`：

```bash
# 至少需要配置一个 provider
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.deepseek.com   # 兼容 DeepSeek 等 OpenAI-compatible 接口

# 或使用 Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# 或任意 OpenAI-compatible endpoint
COMPATIBLE_API_KEY=xxx
COMPATIBLE_BASE_URL=https://your-api.com/v1
```

## 3. 六种运行方式

```bash
# 1. Doctor — 校验 runtime 接线
node --import tsx src/main.ts doctor

# 2. Blueprint — 输出模块拓扑
node --import tsx src/main.ts blueprint

# 3. 单次命令 — 执行任意已注册命令
node --import tsx src/main.ts status
node --import tsx src/main.ts run --prompt="List project files"

# 4. REPL — 交互式终端对话
node --import tsx src/main.ts repl

# 5. TUI — 仪表盘风格终端界面
node --import tsx src/main.ts tui

# 6. HTTP/WS 服务 — API 模式
node --import tsx src/main.ts serve --port=3000
```

## 4. 服务模式（`serve`）

启动后会暴露以下 endpoint：

```
GET  /health              — 健康检查
GET  /session             — 当前会话
GET  /providers           — 已注册 provider
GET  /tools               — 可用工具
GET  /agents              — Agent 列表
GET  /tasks               — Task 列表
GET  /docs                — 动态浏览器文档与 runtime 仪表盘
GET  /docs/page?name=...  — 从当前工作区读取本地文档页面

POST /run    {"prompt":"..."} — 同步对话
POST /stream {"prompt":"..."} — SSE 流式输出
POST /command/doctor {}       — 执行命令

WS   /ws                  — WebSocket 实时订阅
```

## 5. 创建自己的应用

```bash
# 列出可用模板
node --import tsx src/main.ts starter-apps

# 脚手架生成新项目
node --import tsx src/main.ts init --target=my-agent --template=browser-research
```

生成后的目录结构：

```
my-agent/
├── starkharness.app.json   <- App manifest（入口）
├── .env                    <- API keys
├── commands/               <- 自定义 Markdown 命令
├── skills/                 <- Skill 定义
├── hooks/                  <- Hook 脚本
├── plugins/                <- Plugin manifests
└── config/
    ├── policy.json         <- 权限策略
    └── providers.json      <- Provider 配置
```

## 6. 核心概念

| 概念 | 说明 |
|---------|-------------|
| **Runtime** | 负责装配所有子系统的核心 runtime |
| **Provider** | LLM 后端（Anthropic / OpenAI / Compatible） |
| **Tool** | Agent 可调用能力（`read_file`、`shell`、`web_search`、`browser`、`voice` 等；默认 runtime 当前内置 28 个） |
| **Command** | CLI 命令（`doctor`、`status`、`run`、`serve`、`swarm`、插件、后台任务等；默认 runtime 当前注册 90 个） |
| **Agent** | 拥有角色、工具和邮箱的独立执行单元 |
| **Task** | 支持依赖、重试和死信队列的可调度工作单元 |
| **Hook** | 拦截器（`PreToolUse` / `PostToolUse` / `Stop`） |
| **Skill** | 绑定到 agent 执行的提示增强层 |
| **Permission** | 分层授权：capability -> tool -> path -> bash classifier |

## 7. 多 Agent 编排

```bash
# 启动 swarm（多 agent 并行执行）
node --import tsx src/main.ts swarm-start \
  --goal="Analyze project architecture" \
  --workers=3 \
  --roles=planner,executor,executor

# 通过 tmux 启动多终端 swarm
node --import tsx src/main.ts swarm-launch \
  --tasks="Analyze frontend;;Analyze backend;;Analyze database"
```

## 8. Pipe 模式（CI/CD 集成）

```bash
# 从 stdin 读取 prompt
echo "Analyze security risks in this project" | node --import tsx src/main.ts pipe

# Auto mode — 使用 app 默认 prompt
node --import tsx src/main.ts auto
```

## 9. Coordinator 模式

```bash
# 在当前会话进入 coordinator mode
node --import tsx src/main.ts enter-coordinator-mode

# 稍后恢复同一个会话并保留该 mode
node --import tsx src/main.ts sessions
node --import tsx src/main.ts resume <session-id>

# 也可以在基于 REPL/TUI 的工作流里交互式使用 coordinator mode
# 工具限制为：spawn_agent、send_message、tasks
```

## 10. 作为库使用（编程调用）

```typescript
import { createRuntime } from './src/kernel/runtime.js';
import { loadRuntimeEnv } from './src/config/env.js';

const env = await loadRuntimeEnv({ cwd: process.cwd() });
const runtime = await createRuntime({
  session: { goal: 'my task', mode: 'interactive', cwd: process.cwd() },
  envConfig: env,
});

// 运行一次对话
const result = await runtime.run('List the files in this directory');
console.log(result.finalText);

// 执行一个命令
const status = await runtime.dispatchCommand('status');

// 关闭 runtime
await runtime.shutdown();
```

## 11. 常用命令速查

```bash
# 会话与状态
node --import tsx src/main.ts sessions          # 列出会话
node --import tsx src/main.ts resume <id>       # 恢复会话

# Provider 管理
node --import tsx src/main.ts login --provider=openai --apiKey=sk-xxx
node --import tsx src/main.ts login-status
node --import tsx src/main.ts logout --provider=openai

# Plugin 管理
node --import tsx src/main.ts plugins
node --import tsx src/main.ts plugin-install --url=https://example.com/plugin.json
node --import tsx src/main.ts plugin-package-dxt --path=plugin.json

# 诊断
node --import tsx src/main.ts registry          # 输出完整 registry
node --import tsx src/main.ts traces            # 查询 trace span
node --import tsx src/main.ts transcript        # 回放事件日志

# 后台任务
node --import tsx src/main.ts dream             # 手动触发 memory consolidation
node --import tsx src/main.ts dream-start       # 启用后台 dreaming
node --import tsx src/main.ts cron-list         # 列出定时任务
```
