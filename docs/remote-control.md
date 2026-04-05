# Remote Control

Remote Control is the bridge surface that turns StarkHarness into a controllable runtime instead of just a local CLI.

## HTTP Surface

Key endpoints:

- `GET /health`
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
- `POST /command/:name`
- `POST /run`
- `POST /stream`

## WebSocket Surface

`/ws` supports:

- prompt execution
- command execution
- subscriptions
- filtered runtime events by topic, `traceId`, and `agentId`

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
