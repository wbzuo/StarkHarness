# Roadmap

This document turns the current version plan into an executable release roadmap.

Branch strategy:

- `v1.0`: stable baseline focused on "it runs"
- `v2.0`: current productization branch focused on app/platform engineering
- `v3.0`: documentation and docs-site branch
- `v4.0`: stability and large-scale testing branch
- `v5.0`: enterprise observability and control branch
- `v6.0`: major refactor / module split branch

Version shorthand:

- V1: can run
- V2: can become a product
- V3: can be understood
- V4: can be trusted
- V5: can enter enterprise
- V6: can evolve long term

## V1.0 — Run

Status: complete baseline branch

Goal:

- Turn the project from "developer prototype" into "others can install and run it"

Included:

- Core runtime runs end-to-end
- Basic TypeScript migration baseline and typecheck pass
- Node/Bun-compatible execution target direction established
- Environment-variable-first feature configuration starts replacing ad hoc flags
- OpenAI-compatible provider support
- Custom login/provider configuration baseline
- Remote Control / Bridge Mode baseline
- Basic web search capability baseline
- Basic debug entrypoints
- Automatic update behavior disabled
- Removal of anti-distillation behavior
- `rg`-missing search-tool failure path fixed

Explicitly not in scope:

- Buddy feature polish
- Auto Mode product return
- Sentry / GrowthBook
- Chrome use / Computer use / voice / dream
- Large docs push
- Large regression suite expansion
- Enterprise monitoring

Exit criteria:

- Fresh user can install and run the project
- `npm test` passes
- `npm run typecheck` passes
- Runtime, bridge, login/provider, and search paths are usable

## V2.0 — Productize

Status: in progress

Goal:

- Turn the runtime into a reusable platform for building agent applications

Included:

- Formal app API and manifest layer
- Starter/scaffold flow
- Starter apps
- Deployment templates
- Runtime diagnostics growth
- Node/Bun runtime workflow hardening
- Environment variable configuration formalization
- Debug capability engineering
- Remote Control / Bridge Mode completion work
- Provider/login compatibility hardening
- OpenAI compatibility consolidation
- Auto Mode return
- Buddy docs may begin here if they help product onboarding

Explicitly not in scope:

- Full documentation site
- Massive test expansion as the primary deliverable
- Enterprise telemetry stack
- Large codebase reshaping / repartitioning
- Biome rollout as a required formatter

Exit criteria:

- `init`, `dev`, `doctor`, and starter apps form a usable app-development loop
- App-local commands/hooks/skills/config are loadable through manifest paths
- Deployment templates are usable for local/product-style startup
- Environment-variable configuration replaces feature-flag CLI hacks for active features

## V3.0 — Document

Status: planned

Goal:

- Make the platform understandable to end users and downstream developers

Included:

- Large docs pass
- Docs site
- Buddy documentation
- Auto Mode documentation
- Web search documentation
- Debug documentation
- Sentry documentation
- GrowthBook documentation
- Login/provider mode documentation
- Remote Control / Bridge Mode documentation
- OpenAI compatibility documentation
- Chrome use / Computer use / voice / dream documentation
- MCP substitution guidance
- `computer-use-mcp` naming-conflict documentation

Explicitly not in scope:

- Large new platform features unless required to document already-shipped behavior
- Enterprise backend rollout
- Major codebase refactor

Exit criteria:

- A new user can follow docs from install to first agent app
- A developer can understand app manifests, tools, bridge mode, and provider config without reading source
- Docs site covers the main flows and advanced integrations

## V4.0 — Stabilize

Status: planned

Goal:

- Make the system trustworthy under regression pressure

Included:

- Large test expansion
- Regression coverage for bridge, web-access, providers, app manifest/scaffold, login/provider config, and remote flows
- Stability hardening
- Search, login, remote, voice, dream, and browser-related regression coverage
- Additional missing tools only when protected by tests

Explicitly not in scope:

- Enterprise observability platform
- Massive architecture rewrite

Exit criteria:

- Major runtime surfaces have dedicated regression coverage
- Critical flows have end-to-end or integration tests
- Failure modes are reproducible and diagnosable

## V5.0 — Enterprise

Status: planned

Goal:

- Make the platform operable in enterprise-style environments
- Complete the enterprise loop of operations, observability, and control

Included:

- Enterprise-grade monitoring and reporting
- Custom Sentry error reporting
- Custom GrowthBook integration
- More mature Remote Control
- Formal feature-flag / rollout platform support
- Missing-tool completion and controlled restriction removal

Explicitly not in scope:

- Large structural rewrite
- Docs-only milestone work

Exit criteria:

- The runtime can be observed, controlled, and rolled out safely in team environments
- Error reporting and remote config are pluggable
- Feature behavior can be governed externally
- The V5 surface is clearly operable, observable, and controllable in production-style environments

## V6.0 — Re-Architect

Status: planned

Goal:

- Pay down structural debt without mixing in roadmap sprawl

Included:

- Large refactor of legacy code
- Full module/package split
- New branch carries the re-architecture
- `main` is archived as a historical line when the new architecture is ready

Explicitly not in scope:

- Unrelated feature additions
- Documentation-first milestone work
- Enterprise rollout features unless required by the refactor

Exit criteria:

- The codebase is modularized enough for long-term maintenance
- Major subsystems can evolve independently
- Historical compatibility and migration strategy are documented

## Notes

- Biome is intentionally not required in early versions to avoid migration conflicts.
- Feature requests should be placed by version outcome, not just by implementation area.
- Documentation-only items should not inflate engineering milestones unless they unblock adoption.
