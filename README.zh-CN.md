# StarkHarness ⚡️ (Codex 版)

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0+-blue.svg" alt="TypeScript Version">
  <img src="https://img.shields.io/badge/%E8%BF%90%E8%A1%8C%E6%97%B6-Node.js%2020%2B%20%2F%20tsx-green.svg" alt="Runtime">
  <img src="https://img.shields.io/badge/%E5%AE%89%E5%85%A8-Bash%20%E8%A7%A3%E6%9E%90%E5%99%A8%20%2B%20OAuth-red.svg" alt="Security">
  <img src="https://img.shields.io/badge/%E6%9E%B6%E6%9E%84-%E4%BC%81%E4%B8%9A%E7%BA%A7-orange.svg" alt="Architecture">
</p>

---

### 🚀 企业级 AI Agent 操作系统内核

**StarkHarness Codex** 是 StarkHarness 内核的高级 TypeScript 实现版本。专为高可靠性的企业环境设计，它将 Claude Code 的编排逻辑与深度的安全分析、多模态能力（语音/网页）以及专业的企业级可观测性完美结合。

> [**English**](./README.md) | [**简体中文**]

---

## 🏗 企业级架构（全景图）

StarkHarness Codex 跨多个专业领域运作，为复杂的代理工作流提供坚实的底层支持。

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ 🧠 核心内核 (TypeScript / ESM)                                                 │
│    session ➔ loop ➔ context ➔ prompt builder ➔ runner ➔ hooks ➔ events         │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🛡️ 安全与治理                                                                  │
│    权限引擎 (Profiles) • Bash 解析器/分类器 • OAuth/PKCE 身份管理              │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ 能力平面 (多模态扩展)                                                       │
│    工具 (JSON Schema) • MCP 协议 • 网页访问 • 语音接口 • LSP 诊断              │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🤖 智能策略层                                                                  │
│    Anthropic-Live • OpenAI-Live • 模型路由策略 • 企业级可观测性                │
├────────────────────────────────────────────────────────────────────────────────┤
│ 🔗 连通性与集群                                                                │
│    安全 HTTP/WS 桥接 • 多代理编排器 • 集群协作 (Tmux/LSP)                      │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 💎 Codex 版独有特性

### 🛡️ 1. 高级安全层 (`src/security/`)
超越简单的字符串匹配。StarkHarness Codex 包含：
- **Bash 解析器与分类器**: 在执行前对 Shell 命令进行语义分析，检测并拦截破坏性模式。
- **OAuth & PKCE**: 集成身份管理，实现企业级工具访问权限控制。

### 🎙️ 2. 多模态能力扩展 (`src/voice/`, `src/web-access/`)
为未来的交互界面而生：
- **语音接口**: 内置语音转代理、代理转语音的闭环接口原型。
- **网页访问**: 专门的能力模块，用于浏览网页资源并与之交互。

### 📊 3. 企业级可观测性 (`src/enterprise/`)
- **GrowthBook 集成**: 内置对特性开关（Feature Flags）和 Agent 行为 A/B 测试的支持。
- **全链路追踪**: 工业级的 Trace 和指标监控，支持在大规模环境下追踪 Agent 表现。

### 🛠️ 4. 开发者工具链集成 (`src/lsp/`, `src/ui/`)
- **LSP 支持**: 集成语言服务器协议（Language Server Protocol），实现深度的代码库诊断。
- **专业级 TUI**: 全功能终端 UI 实现，为高强度开发者提供极致交互体验。
- **可视化调试器 (Web Inspector)**: 在 `http://127.0.0.1:3000/inspect` 提供的实时仪表盘，用于监控 Hook 执行链、多代理协作与 Token 消耗。

---

## 🚦 开发者快速上手

需要 **Node.js 20+** 和 **TypeScript 6.0**。

```bash
# 1. 环境初始化
git clone https://github.com/wbzuo/StarkHarness.git
cd StarkHarness/Codex

# 2. 安装依赖
npm install

# 3. 全局安装 CLI
cd packages/cli && npm link && cd ../..

# 4. 交互式初始化新项目
stark init

# 5. 启动可视化调试器和桥接服务
stark inspect
```

---

## 🔍 特性矩阵

| 特性 | 标准版 (JS) | Codex 版 (TS) |
| :--- | :---: | :---: |
| **开发语言** | JavaScript | **TypeScript 6.0** |
| **安全机制** | 权限拦截 | **Bash 语义安全分析** |
| **身份认证** | 基于 Token | **OAuth 2.0 + PKCE** |
| **连通性** | 本地 / HTTP | **Tmux 集群 / LSP** |
| **多模态** | 仅限文本 | **语音与网页访问** |

---

## 📂 项目结构

```text
src/
├── agents/          # 多代理编排与专用执行器
├── bridge/          # 安全 HTTP/WS 通信层
├── enterprise/      # GrowthBook 集成与工业级监控
├── kernel/          # Turn 循环、会话与提示词组装
├── mcp/             # 模型上下文协议 (MCP) 桥接
├── security/        # Bash 解析器与安全分类器
├── providers/       # Anthropic 与 OpenAI 的原生适配器
└── ui/              # TUI 与 REPL 实现
```

---

## 📄 开源协议

MIT。专为构建下一代工业级 AI Agent 的工程师打造。
