# Version History

This document records how StarkHarness evolved across the milestone branches that shaped the current `v11.0` line.

## Branch Strategy

- `v1.0` through `v11.0` were used as milestone branches while the platform was being rebuilt in public.
- Active development now continues on `v11.0` instead of opening a new version branch for every small feature slice.
- `ROADMAP.md` still describes the outcome-oriented phases (`run`, `productize`, `document`, `stabilize`, `enterprise`, `re-architect`).
- This file is the concrete release history that shows which capabilities actually landed.

## Milestones

### v1.0

- Established the runnable baseline.
- Completed the initial TypeScript direction and basic typecheck success path.
- Added the first OpenAI-compatible provider path, bridge baseline, search baseline, and environment-variable-first feature toggles.

### v2.0

- Turned StarkHarness into an app platform.
- Added `starkharness.app.json`, starter apps, scaffold/init commands, deployment templates, env configuration, and app-aware `dev` / `doctor`.

### v3.0

- Shipped the first serious docs pass and docs-site direction.
- Documented bridge mode, login/providers, auto mode, debugging, and web search flows.

### v4.0

- Expanded regression coverage and hardened more core flows.
- Focused on trustworthiness instead of net-new product surface.

### v5.0

- Added the first enterprise operations layer.
- Introduced monitoring hooks, Sentry integration, GrowthBook-compatible flags, and richer runtime status/feature flag inspection.

### v6.0

- Began the structural split toward a more modular workspace-style codebase.
- Preserved the working runtime while reducing long-term architectural debt.

### v7.0

- Added bash safety classification and richer permission controls.
- Introduced path rules, bash rules, and LLM-assisted context compaction.

### v8.0

- Upgraded the tooling surface.
- Added `grep`, stronger `edit_file`, plan mode, and user-facing todo persistence.

### v9.0

- Strengthened orchestration.
- Added coordinator mode, worktree isolation, and persisted agent summaries.

### v10.0

- Added richer auth and memory behavior.
- Introduced OAuth/PKCE helpers, interactive approval for `ask` permissions, session transcript persistence, and automatic memory extraction.

### v11.0

The active line now includes all earlier milestones plus:

- `tool_search`, `lsp_diagnostics`, `lsp_workspace_symbols`
- `notebook_edit`, persisted cron commands, and plugin marketplace basics
- `ask_user_question`, `repl_tool`, `magic-docs`, and `dream`
- `CLAUDE.md @include`
- a local docs-page bridge surface so `/docs` serves the current workspace docs instead of linking to stale branch snapshots
- voice transcription primitives:
  - `voice-status`
  - `voice-transcribe`
  - `voice_transcribe`
- swarm convenience commands:
  - `swarm-start`
  - `swarm-status`
- interactive permission prompts for normal interactive CLI flows, not just REPL
- coordinator mode now enforces a restricted tool surface instead of relying only on prompt wording
- agent summaries now prefer an LLM summary and fall back to text truncation only when needed

## Current Reading Guide

If you are new to the repo, read in this order:

1. `README.md`
2. `docs/architecture-deep-dive.md`
3. `docs/version-history.md`
4. `docs/providers-and-login.md`
5. `docs/remote-control.md`

That sequence explains what StarkHarness is, how it is structured, how it evolved, and how to operate it today.
