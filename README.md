# StarkHarness

StarkHarness is an atomic, high-intensity harness scaffold for building a full-feature Claude Code-class coding runtime without dragging product-shell complexity into the kernel.

## Design stance

- Full feature parity is a product goal.
- Kernel size is aggressively minimized.
- Every non-kernel capability is explicit, detachable, and replaceable.
- Commands are a thin interface; tools and orchestration are the real substrate.
- No provider, UI, or telemetry concern is allowed to leak into the kernel contract.

## v1 module blueprint

### Kernel
- `src/kernel/session.js` — session model and lifecycle
- `src/kernel/runtime.js` — runtime composition and execution shell
- `src/kernel/loop.js` — harness turn loop
- `src/kernel/context.js` — context envelope model
- `src/kernel/events.js` — minimal event bus

### Control planes
- `src/permissions/engine.js` — unified permission gate
- `src/tasks/store.js` — task ownership and tracking
- `src/agents/manager.js` — bounded sub-agent orchestration
- `src/plugins/loader.js` — plugin manifest validation and loading

### Capability surfaces
- `src/providers/index.js` — model provider registry
- `src/tools/types.js` — tool contract
- `src/tools/registry.js` — built-in and extension tool registry
- `src/tools/builtins/*.js` — file/shell/search/web/orchestration placeholders
- `src/commands/registry.js` — thin CLI/slash command surface
- `src/capabilities/index.js` — feature modules map
- `src/workspace/index.js` — git/worktree/review surface placeholder
- `src/bridge/index.js` — IDE/remote/mobile bridge placeholder
- `src/ui/repl.js` — shell REPL placeholder
- `src/telemetry/index.js` — logging/event sink placeholder

## Running

```bash
cd StarkHarness
npm test
node src/main.js blueprint
node src/main.js doctor
```

## What this scaffold intentionally does now

- Defines the system contracts.
- Boots a working runtime.
- Registers core tools/capabilities.
- Exposes machine-readable blueprint output.
- Persists session state plus runtime orchestration snapshots under `.starkharness/`.
- Ships real read/write/edit/search/glob/shell tool paths behind unified permissions.
- Supports command dispatch, provider contracts, session resume, and transcript replay.
- Verifies the dependency-free harness shape in tests.

## What comes next

1. Add sandbox profiles and per-tool rule composition on top of policy files.
2. Extend provider adapters from stub contracts into real model backends.
3. Add MCP/LSP/bridge integration.
4. Add transcript replay controls and richer CLI/REPL argument routing.
5. Add team/swarm execution semantics and plugin-backed capability loading.
