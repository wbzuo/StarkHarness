# StarkHarness

An atomic, high-intensity harness scaffold for building Claude Code-class coding runtimes. Full feature parity is a product goal. Kernel size is aggressively minimized.

## Architecture

```
Kernel:    session → runtime → loop → context → events → hooks → prompt
Control:   permissions/engine → tasks/store → agents/manager → plugins/loader
Tools:     types (JSON Schema) → registry → builtins (10 tools)
Memory:    CLAUDE.md (static) → auto-memory (dynamic, YAML frontmatter)
Skills:    3-level progressive loading (metadata → body → references)
Commands:  YAML frontmatter + Markdown body parser
Providers: anthropic → openai → compatible (pluggable)
```

## Claude Code Harness Alignment

| Mechanism | Claude Code | StarkHarness |
|-----------|-------------|-------------|
| Hook System | 9 lifecycle events, command/prompt types | `HookDispatcher` with 9 events + matchers |
| Tool Schema | JSON Schema per tool for LLM | `inputSchema` on every `defineTool` |
| System Prompt | CLAUDE.md + tools + memory + hooks | `SystemPromptBuilder` composing all sources |
| Turn Loop | PreToolUse → Execute → PostToolUse | `AgentLoop.executeTurn()` with full hook chain |
| Permissions | allow/ask/deny + tool-level override | `PermissionEngine` with policy files + profiles |
| Memory | CLAUDE.md + auto-memory frontmatter | `MemoryManager` with identical pattern |
| Skills | 3-level progressive disclosure | `SkillLoader` with discover → load → references |
| Commands | YAML frontmatter + MD prompt | `parseCommandFile` with allowed-tools whitelist |
| Agents | description routing, model/tools fields | `AgentManager.matchAgent()` + spawn options |
| Plugins | folder manifest + conflict detection | `PluginLoader` with diagnostics |

## Running

```bash
npm test                              # Run all tests
node src/main.js blueprint            # Print module blueprint
node src/main.js doctor               # Validate harness wiring
```

## What comes next

1. Real LLM provider integration (Anthropic Messages API with tool_use).
2. MCP protocol bridge (stdio, SSE, HTTP, WebSocket).
3. REPL with interactive permission prompts.
4. Transcript replay execution engine.
5. Plugin auto-discovery from folder conventions.
