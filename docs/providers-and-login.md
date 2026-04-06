# Providers And Login

StarkHarness supports multiple provider families through environment variables, app manifests, provider config files, and persisted OAuth profiles.

## Provider Families

Anthropic:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

OpenAI:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

Compatible gateways:

- `COMPATIBLE_API_KEY`
- `COMPATIBLE_BASE_URL`
- `COMPATIBLE_MODEL`

## App-Level Config

Apps can point to a provider config file through:

```json
{
  "paths": {
    "providerConfigPath": "config/providers.json"
  }
}
```

The runtime merges provider inputs in this order:

1. provider config file
2. `.env`
3. saved OAuth profiles
4. explicit runtime overrides

## CLI Login Paths

API key login:

```bash
node --import tsx src/main.ts login --provider=openai --apiKey=sk-... --model=gpt-5
```

Logout:

```bash
node --import tsx src/main.ts logout --provider=openai
```

OAuth bootstrap:

```bash
node --import tsx src/main.ts login \
  --method=oauth \
  --provider=openai \
  --authorizeUrl=https://example.com/oauth/authorize \
  --tokenUrl=https://example.com/oauth/token \
  --clientId=starkharness-cli
```

OAuth refresh:

```bash
node --import tsx src/main.ts oauth-refresh --provider=openai
```

## Inspection Commands

Use:

- `login-status`
- `oauth-status`
- `env-status`
- `doctor`
- `status`

The goal is to keep provider readiness visible, workspace-local, and scriptable.
