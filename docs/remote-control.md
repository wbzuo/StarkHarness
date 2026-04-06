# Remote Control

Remote Control is the bridge surface that turns StarkHarness into a controllable runtime instead of just a local CLI.

## HTTP Surface

Key endpoints:

- `GET /health`
- `GET /status`
- `GET /session`
- `GET /app`
- `GET /blueprint`
- `GET /doctor`
- `GET /registry`
- `GET /env`
- `GET /web-access`
- `GET /providers`
- `GET /tools`
- `GET /agents`
- `GET /tasks`
- `GET /workers`
- `GET /traces`
- `GET /docs`
- `GET /docs/page?name=...`
- `POST /command/:name`
- `POST /run`
- `POST /stream`

## WebSocket Surface

`/ws` supports:

- prompt execution
- command execution
- subscriptions
- filtered runtime events by topic, `traceId`, and `agentId`

## Local Docs Surface

`/docs` is now a dynamic browser control page backed by the active bridge.

The bridge also serves local documentation pages through `/docs/page?name=...`, so the docs site can render the exact files from the current workspace instead of linking to an older branch snapshot on GitHub.

## Environment Controls

These environment variables affect remote control:

- `STARKHARNESS_BRIDGE_HOST`
- `STARKHARNESS_BRIDGE_PORT`
- `STARKHARNESS_BRIDGE_TOKEN`
- `STARKHARNESS_TOKEN_PROFILES`
- `STARKHARNESS_REMOTE_CONTROL`

If `STARKHARNESS_REMOTE_CONTROL=false`, the bridge still exists, but command-style remote control surfaces are intentionally restricted.

## Security Note

For non-local use, always configure:

- a bridge token
- token profile mapping
- appropriate sandbox policy

Also prefer exposing only the bridge surfaces you actually need. StarkHarness can run locally without publishing the remote-control plane to a wider network.
