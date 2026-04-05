# Debug

Debugging StarkHarness is currently centered around a few key surfaces.

## CLI Diagnostics

- `doctor`
- `registry`
- `env-status`
- `login-status`
- `web-access-status`
- `transcript`
- `playback`
- `traces`

## Runtime Files

State is written under `.starkharness/`:

- sessions
- runtime snapshot
- transcript JSONL
- trace JSONL
- agent state
- worker state

## Remote Debugging

When bridge mode is running, `/docs` provides a live docs and runtime control surface. It reads:

- health
- app
- env
- web-access
- blueprint
- providers
- live prompt execution

## Common First Checks

1. `doctor`
2. `env-status`
3. `login-status`
4. `web-access-status`
5. `registry`

That sequence usually tells you whether the issue is config, provider readiness, bridge state, or runtime wiring.
