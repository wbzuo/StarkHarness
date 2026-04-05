# 贡献者指南

这份指南面向希望扩展 StarkHarness 的工程师，目标是帮助你在不破坏现有架构的前提下推进项目。这个仓库规模还不算大，读起来不算难，但它已经有足够多的运行时部件，稍不留神就会把一个看似局部的修改扩散到 runtime、prompt、bridge 或 persistence 层。

> [English](./contributor-guide.md) | [简体中文](./contributor-guide.zh-CN.md)

## 本地开发流程

使用 Node.js 20 或更高版本。

```bash
npm test
node --import tsx src/main.ts doctor
node --import tsx src/main.ts blueprint
node --import tsx src/main.ts repl
node --import tsx src/main.ts serve --port=3000
```

这些命令的用途分别是：

- `npm test`: 当前最重要的回归保护网
- `doctor`: 快速检查 runtime wiring 是否正常
- `blueprint`: 以紧凑形式查看运行时组装出来的能力面
- `repl`: 最快的 `runtime.run()` 手工验证入口
- `serve`: 最快验证 HTTP/SSE/WebSocket bridge 的方式

补充一点：bridge 测试需要在 `127.0.0.1` 上监听端口。在受限沙箱中，即使实现本身正确，它们也可能因为 `listen EPERM` 而失败。

## 建议的读码顺序

如果你第一次接触这个仓库，建议先按下面顺序阅读，再开始改行为：

1. [`src/main.ts`](../src/main.ts)
2. [`src/kernel/runtime.ts`](../src/kernel/runtime.ts)
3. [`src/kernel/runner.ts`](../src/kernel/runner.ts)
4. [`src/tools/builtins/index.ts`](../src/tools/builtins/index.ts)
5. [`src/agents/orchestrator.ts`](../src/agents/orchestrator.ts)
6. [`src/bridge/http.ts`](../src/bridge/http.ts)
7. [`src/state/store.ts`](../src/state/store.ts)

这条路径可以用最少的上下文切换，把入口、运行时装配、Agent loop、tool surface、多 Agent 控制平面、远程 API 和持久化串起来。

## 最适合作为第一批贡献的区域

这些区域相对安全，而且收益很高：

- 文档与示例
- 诊断命令与命令行易用性
- bridge 鉴权、replay、provider retry 等边界行为的测试
- memory 与 skill loading 的使用体验
- MCP tool registration 与配置校验

如果你想做一个低风险的第一版补丁，优先考虑文档、测试和诊断，而不是先动 runtime 语义。

## 需要谨慎对待的区域

### Runner 的消息结构

[`src/kernel/runner.ts`](../src/kernel/runner.ts) 与 live provider adapter 依赖一套非常具体的内部消息格式：

- assistant 普通文本消息
- assistant `tool_use` blocks
- user `tool_result` blocks

如果你改了这些结构，必须同步更新 provider adapters 和 runner tests。

### Agent 隔离执行

[`src/agents/executor.ts`](../src/agents/executor.ts) 与 [`src/runtime/sandbox.ts`](../src/runtime/sandbox.ts) 还在演进过程中。当前 `local` 和 `process` 路径是真实可用的，但 Docker 执行目前仍然只是一个最小占位实现。

尤其要注意：

- isolation mode 的命名是否一致
- 哪些工具能被视为 portable tools
- 自定义 hooks 在隔离执行中的兼容性

### Bridge 行为

[`src/bridge/http.ts`](../src/bridge/http.ts) 现在同时承载了多种职责：

- auth token 提取
- 基于 profile 的 permission override
- REST 请求处理
- SSE streaming
- WebSocket 订阅与过滤

这里的小改动很容易同时影响远程客户端和本地测试。

### 持久化格式

[`src/state/store.ts`](../src/state/store.ts) 直接写 JSON 和 JSONL 文件。这样做的优点是简单透明，但也意味着一旦格式变化，很快就会变成兼容性变化。

## 最值得推进的下一批改进

如果你想真正推动项目往前走，下面几项是收益最高的方向。

### 1. 补齐隔离语义

- 统一 agent 创建与执行时的 isolation naming
- 用真实的容器执行桥替换当前 Docker placeholder 路径
- 为隔离回退行为增加明确测试

### 2. 深化 MCP 支持

- 从当前的 stdio tool loading 继续向前扩展
- 更清晰地补齐 resources 与 prompts 的支持边界
- 为注入型 MCP tools 的命名空间和失败行为补文档

### 3. 加固 Bridge

- 为 SSE 与 WebSocket 过滤增加更多端到端测试
- 在文档中更清晰地定义公共 API surface
- 如果文件继续膨胀，可以考虑把 transport 与 auth/profile 逻辑拆分

### 4. 改善贡献者体验

- 如果目标确实是 MIT，请补一个真正的 `LICENSE` 文件
- 增加一个简短的 `CONTRIBUTING.md`
- 增加一个 docs 索引页，统一串起架构、路线图和贡献材料

## 实用经验

- 尽量一次只改一个子系统。
- 改 runtime 行为前，先读对应测试。
- 改 provider 代码时，至少把 provider tests 和 runner tests 一起跑。
- 改 bridge 代码时，除了桥接测试，也最好手动 sanity-check 一次 `serve`。
- 改持久化时，不要只考虑 fresh run，也要考虑 resumed session 和 recorded traces。

这个仓库已经有一定内部结构了。相较于大刀阔斧重写，纪律性更强的小补丁会更容易长期成立。
