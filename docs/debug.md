# Debug

Debugging StarkHarness is currently centered around a few key surfaces.

## CLI Diagnostics

- `doctor`
- `registry`
- `env-status`
- `login-status`
- `oauth-status`
- `status`
- `file-cache-status`
- `settings-status`
- `remote-status`
- `voice-status`
- `web-access-status`
- `transcript`
- `session-transcript`
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
- managed settings snapshot
- cron schedules
- trusted plugin list
- swarm session metadata

## Remote Debugging

When bridge mode is running, `/docs` provides a live docs and runtime control surface. It reads:

- health
- status
- app
- env
- web-access
- voice
- file cache
- remote bridge
- blueprint
- providers
- live prompt execution

## Common First Checks

1. `doctor`
2. `env-status`
3. `login-status`
4. `status`
5. `web-access-status`
6. `registry`

That sequence usually tells you whether the issue is config, provider readiness, bridge state, or runtime wiring.
