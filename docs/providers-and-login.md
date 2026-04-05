# Providers And Login

StarkHarness currently supports multiple provider families through environment variables, config files, or app-local manifests.

## Environment Variables

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

## Inspecting Readiness

Use:

- `login-status`
- `env-status`
- `doctor`

This is the current V2 replacement for ad hoc login setup. The goal is to keep provider readiness visible and app-local.
