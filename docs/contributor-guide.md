# Contributor Guide

This guide is for engineers who want to extend StarkHarness without accidentally fighting the current architecture. The project is small enough to understand quickly, but it already has enough moving parts that "just changing one file" can easily drift into runtime, prompt, bridge, or persistence regressions.

> [English](./contributor-guide.md) | [简体中文](./contributor-guide.zh-CN.md)

## Local Workflow

Use Node.js 20 or newer.

```bash
npm test
node src/main.js doctor
node src/main.js blueprint
node src/main.js repl
node src/main.js serve --port=3000
```

What these give you:

- `npm test`: the current regression safety net
- `doctor`: quick runtime wiring check
- `blueprint`: a compact view of the assembled runtime surface
- `repl`: the fastest way to manually exercise `runtime.run()`
- `serve`: the fastest way to validate the HTTP/SSE/WebSocket bridge

Note: the bridge tests bind to `127.0.0.1`. In restricted sandboxes they may fail with `listen EPERM` even when the implementation is correct.

## Read The Code In This Order

If you are new to the repo, read in this order before editing behavior:

1. [`src/main.js`](../src/main.js)
2. [`src/kernel/runtime.js`](../src/kernel/runtime.js)
3. [`src/kernel/runner.js`](../src/kernel/runner.js)
4. [`src/tools/builtins/index.js`](../src/tools/builtins/index.js)
5. [`src/agents/orchestrator.js`](../src/agents/orchestrator.js)
6. [`src/bridge/http.js`](../src/bridge/http.js)
7. [`src/state/store.js`](../src/state/store.js)

That sequence gives you entrypoints, runtime composition, the agent loop, the tool surface, orchestration, remote APIs, and persistence with minimal context switching.

## Best First Contribution Areas

These areas are relatively safe and high leverage:

- documentation and examples
- diagnostics and command ergonomics
- tests for edge cases around bridge auth, replay, and provider retries
- memory and skill loading UX
- MCP tool registration and configuration validation

If you want a low-risk first patch, improve docs, add tests, or tighten diagnostics before changing runtime semantics.

## Areas To Treat Carefully

### Runner Message Shapes

[`src/kernel/runner.js`](../src/kernel/runner.js) and the live provider adapters depend on a very specific internal message shape:

- assistant text messages
- assistant `tool_use` blocks
- user `tool_result` blocks

If you change these shapes, you must update both provider adapters and the runner tests.

### Agent Isolation

[`src/agents/executor.js`](../src/agents/executor.js) and [`src/runtime/sandbox.js`](../src/runtime/sandbox.js) are still evolving. The current implementation supports local and process execution paths, but Docker execution is still only a minimal placeholder.

Be especially careful with:

- isolation mode naming
- portable tool assumptions
- custom hooks in isolated execution

### Bridge Behavior

[`src/bridge/http.js`](../src/bridge/http.js) now carries several responsibilities at once:

- auth token extraction
- profile-based permission overrides
- REST request handling
- SSE streaming
- WebSocket subscriptions and filters

Small changes here can affect both remote clients and local tests quickly.

### Persistence Format

[`src/state/store.js`](../src/state/store.js) writes JSON and JSONL files directly. That is simple and readable, but it also means format changes become compatibility changes very quickly.

## Suggested Next Improvements

If you want to push the project forward, these are the highest-leverage next steps.

### 1. Finish Isolation Semantics

- align default isolation naming consistently across agent creation and execution
- replace the Docker placeholder path with a real container execution bridge
- add explicit tests for isolation fallback behavior

### 2. Deepen MCP Support

- expand beyond stdio tool loading
- add clearer support boundaries for resources and prompts
- document namespacing and failure behavior for injected MCP tools

### 3. Harden The Bridge

- add more end-to-end tests for SSE and WebSocket event filtering
- clarify the public API surface in the docs
- consider splitting transport concerns from auth/profile logic if the file keeps growing

### 4. Improve Contributor UX

- add a real `LICENSE` file if MIT is the intended license
- add a short `CONTRIBUTING.md`
- add a single docs index page for architecture, roadmap, and contributor material

## Practical Rules Of Thumb

- Prefer changing one subsystem at a time.
- Read the matching tests before changing runtime behavior.
- When editing provider code, run the provider and runner tests together.
- When editing bridge code, run bridge tests and manually sanity-check `serve`.
- When editing persistence, think about resumed sessions and recorded traces, not just fresh runs.

The repo already has enough internal structure that disciplined small patches will age much better than broad rewrites.
