# StarkHarness ⚡️

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js Version">
  <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E9%9B%B6%E4%BE%9D%E8%B5%96-blue.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-MIT-yellow.svg" alt="License">
  <img src="https://img.shields.io/badge/%E6%9E%B6%E6%9E%84-Claude%20Code%20%E7%BA%A7%E5%88%AB-orange.svg" alt="Architecture">
</p>

---

### 🚀 "Claude Code" 级别的 AI Agent 运行时脚手架

**StarkHarness** 是一个专为构建全功能 AI 编程助手而设计的原子化、高强度运行框架。它剥离了产品外壳的复杂性，提供了一个干净、可测试且**零依赖**的内核，实现了世界级编程 Agent 的核心逻辑。

> [**English**](./README.md) | [**简体中文**]

---

## 💎 核心理念

| 🛡️ 安全至上 | ⚙️ 精密机制 | 🧩 极致模块化 |
| :--- | :--- | :--- |
| **三级权限模型**（允许/询问/拒绝），在内核层确保绝对安全。 | **9 阶段钩子生命周期**，精密控制 Agent 思考循环的每一个环节。 | **显式且可拆卸**的能力。没有黑盒逻辑，只有清晰的能力契约。 |

---

## 🏗 系统架构

StarkHarness 构建在四个独立的操作“平面”之上：

```text
┌───────────────────────────────────────────────────────────────────────┐
│ 🧠 内核平面 (内核编排层)                                              │
│    session ➔ runtime ➔ loop ➔ context ➔ events ➔ hooks ➔ prompt       │
├───────────────────────────────────────────────────────────────────────┤
│ 🛡️ 控制平面 (安全与管理层)                                            │
│    permissions/engine  •  tasks/store  •  agents/manager               │
│    plugins/loader      •  plugins/diagnostics                          │
├───────────────────────────────────────────────────────────────────────┤
│ 🛠️ 能力平面 (执行能力层)                                              │
│    工具 (JSON Schema)  •  技能 (三级加载)  •  命令 (Markdown 驱动)     │
├───────────────────────────────────────────────────────────────────────┤
│ 🤖 供应平面 (模型智能层)                                              │
│    Anthropic (原生)    •  OpenAI           •  自定义模型适配器         │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 关键机制

### 🔗 1. 钩子调度器 (`src/kernel/hooks.js`)
借鉴顶级 Agent 的内部架构，Hook 系统允许您拦截并修改任何操作：
- `PreToolUse`: 在工具运行前进行验证或拦截。
- `PostToolUse`: 在 Agent 看到结果前处理工具输出。
- `Stop`: 如果测试未通过或目标未达成，钩子可以阻止 Agent 退出。

### 🛡️ 2. 权限引擎 (`src/permissions/`)
一个健壮的沙箱系统，预置了三种配置：
- 🔓 **Permissive (宽松)**: 开发模式，允许所有工具。
- 🛡️ **Safe (安全)**: 默认模式，危险操作需人工确认。
- 🔒 **Locked (锁定)**: 只读模式，禁止写入、执行和网络访问。

### 📚 3. 内存与技能
- **静态内存**: 遵循 `CLAUDE.md` 标准，定义项目规则。
- **动态内存**: 学习到的上下文存储在 `.starkharness/memory/` 中，支持 YAML 前置元数据。
- **渐进式技能**: 三级加载机制（发现 ➔ 正文 ➔ 引用），最大限度节省 Token 消耗。

---

## 📊 特性对比

| 特性 | Claude Code | StarkHarness |
| :--- | :---: | :---: |
| **零外部依赖** | ❌ | ✅ **是** |
| **钩子生命周期** | 9 阶段 | 9 阶段 |
| **权限控制** | 交互式询问 | 策略 + 交互式 |
| **内存标准** | `CLAUDE.md` | `CLAUDE.md` |
| **技能加载** | 渐进式 | 渐进式 |
| **扩展性** | 插件化 | 插件化 |

---

## 🚦 快速开始

```bash
# 1. 克隆代码
git clone https://github.com/wbzuo/StarkHarness.git

# 2. 进入控制台
cd StarkHarness

# 3. 查看系统蓝图（查看完整运行时结构）
node src/main.js blueprint

# 4. 运行健康检查
node src/main.js doctor

# 5. 执行单元测试 (使用 Node 原生测试运行器)
npm test
```

---

## 🗺 路线图

- [x] **核心框架**: 高保真会话与 Turn 循环实现。
- [ ] **阶段 1**: 实现真正的 Anthropic/OpenAI 后端适配。
- [ ] **阶段 2**: 集成 MCP (Model Context Protocol) 协议。
- [ ] **阶段 3**: 开发富交互 REPL，支持斜杠命令与语法高亮。
- [ ] **阶段 4**: 实现确定性重放引擎，用于 Agent 故障调试。

---

## 📄 开源协议

MIT。专为探索 AI Agent 下一波浪潮的研究者与工程师打造。
