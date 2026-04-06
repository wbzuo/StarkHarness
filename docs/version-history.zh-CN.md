# 版本历史

这份文档记录了 StarkHarness 从早期里程碑分支一路演进到当前 `v11.0` 活跃线的过程。

## 分支策略

- `v1.0` 到 `v11.0` 曾用于承载公开迭代过程中的里程碑版本。
- 现在开始，日常增强会继续落在 `v11.0` 上，而不是每做一小批功能就再开一个新版本分支。
- `ROADMAP.md` 仍然负责描述“按结果划分的阶段目标”。
- 这份文档则负责说明“哪些能力真实落地了”。

## 里程碑摘要

### v1.0

- 建立了“别人能跑起来”的最小可用基线。
- 打通了 TypeScript 迁移基线与基本类型检查。
- 提供了第一版 OpenAI-compatible provider、bridge、搜索能力和环境变量配置入口。

### v2.0

- 把 StarkHarness 推进为一个可二次开发的 app 平台。
- 增加了 `starkharness.app.json`、starter apps、脚手架命令、部署模板，以及 app-aware 的 `dev` / `doctor`。

### v3.0

- 完成第一轮较完整的文档建设。
- 把 bridge、providers/login、auto mode、debug、web search 这些核心操作路径写成文档。

### v4.0

- 强化回归测试和稳定性。
- 重点不是堆新功能，而是让关键路径更可信。

### v5.0

- 增加第一阶段企业能力。
- 包括 monitoring hooks、Sentry、GrowthBook-compatible flags，以及更完整的运行时状态面。

### v6.0

- 开始往模块化、可长期维护的结构演进。
- 在不牺牲可运行性的前提下推进包级拆分方向。

### v7.0

- 加入 bash 安全分类器和更细粒度的权限规则。
- 增加 path rules、bash rules，以及基于 LLM 的上下文压缩。

### v8.0

- 补强工具层。
- 增加 `grep`、增强版 `edit_file`、plan mode，以及用户级 todo 持久化。

### v9.0

- 补强编排层。
- 增加 coordinator mode、worktree 隔离，以及 agent summary。

### v10.0

- 加入更完整的登录与会话记忆能力。
- 包括 OAuth/PKCE、`ask` 权限交互式审批、session transcript 持久化，以及自动 memory 提取。

### v11.0

当前活跃线在前面所有能力之上，又继续补了：

- `tool_search`、`lsp_diagnostics`、`lsp_workspace_symbols`
- `notebook_edit`、持久化 cron 命令，以及插件市场基础能力
- `ask_user_question`、`repl_tool`、`magic-docs`、`dream`
- `CLAUDE.md @include`
- 本地 docs page 路由：`/docs` 不再只跳旧分支链接，而是直接读取当前工作区文档
- 语音转写基础能力：
  - `voice-status`
  - `voice-transcribe`
  - `voice_transcribe`
- swarm 便捷命令：
  - `swarm-start`
  - `swarm-status`
- tmux 驱动的多终端 swarm 命令：
  - `swarm-launch`
  - `swarm-list`
  - `swarm-stop`
- 文件缓存命令：
  - `file-cache-status`
  - `file-cache-clear`
- managed settings 与 remote bridge 命令：
  - `settings-status`
  - `settings-sync`
  - `remote-status`
  - `remote-connect`
  - `remote-poll`
  - `remote-disconnect`
- DXT 与插件信任链命令：
  - `plugin-package-dxt`
  - `plugin-validate-dxt`
  - `plugin-trust`
  - `plugin-trust-list`
  - `plugin-autoupdate`
- 后台 dream 与调度命令：
  - `dream-start`
  - `dream-stop`
  - `dream-status`
  - `cron-run-due`
- dependency-free TUI 面板：
  - `tui`
- 普通交互式 CLI 也具备权限审批提示，不再只局限于 REPL
- coordinator mode 现在会真正限制工具面，而不是只靠 system prompt 提示
- agent summary 现在优先尝试 LLM 摘要，失败时才回退到文本截断
- remote bridge 现在同时支持 polling 与 WebSocket 控制平面，并补齐了稳定的 `clientId`、`ping` / `pong` 与失败回报
- plugin install、uninstall 与 autoupdate 现在会在当前 runtime 中立即刷新命令/工具面，不再要求重启
- DXT archive 现在会保留 bundled files、校验签名覆盖的 bundle 内容，并在 uninstall / reinstall 时清理已解包内容
- tmux swarm 启动现在会显式固定 pane 工作目录，并正确沿用自定义 CLI 命令
- Quick Start 现在提供中英文双版本，并有自动命令 / endpoint 一致性测试兜底

## 当前推荐阅读顺序

如果你第一次进入这个仓库，建议按这个顺序读：

1. `README.zh-CN.md`
2. `docs/architecture-deep-dive.zh-CN.md`
3. `docs/version-history.zh-CN.md`
4. `docs/providers-and-login.md`
5. `docs/remote-control.md`

这样可以先建立整体认知，再理解系统结构、版本演进，以及今天该怎么实际使用它。
