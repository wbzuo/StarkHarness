# Auto Mode

Auto Mode is the app-aware execution path for running a default workflow without hand-written command choreography.

## How It Works

When the runtime is launched with:

- `node --import tsx src/main.ts auto`
- `node --import tsx src/main.ts` when `STARKHARNESS_AUTO_MODE=true`
- an app manifest whose `startup.mode` is `auto`

StarkHarness resolves the automation flow in this order:

1. `--prompt=...`
2. stdin input
3. `app.automation.defaultPrompt`
4. `app.automation.defaultCommand`

## Manifest Shape

```json
{
  "automation": {
    "defaultPrompt": "Research the current target and summarize the strongest evidence.",
    "defaultCommand": "",
    "streamOutput": true
  }
}
```

## Good Uses

- scheduled research summaries
- repeatable workspace analysis
- app-specific assistant behavior that should start with one command

## Current Scope

Auto Mode in V2 is intentionally lightweight. It is app-aware and CLI-usable, but it is not yet a full orchestration product on its own.
