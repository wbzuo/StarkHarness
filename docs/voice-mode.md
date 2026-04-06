# Voice Mode

StarkHarness now includes a lightweight voice/transcription surface that works without adding a new SDK dependency.

## What It Does

Current voice support is file-based transcription, not a full streaming voice assistant.

Shipped surfaces:

- `voice-status`
- `voice-transcribe`
- `voice_transcribe`

This makes voice useful as a building block for downstream agent apps without forcing the runtime to adopt a heavyweight audio stack too early.

## Environment Variables

- `STARKHARNESS_VOICE_ENABLED`
- `STARKHARNESS_VOICE_PROVIDER`
- `STARKHARNESS_VOICE_BASE_URL`
- `STARKHARNESS_VOICE_API_KEY`
- `STARKHARNESS_VOICE_MODEL`

Defaults:

- provider: `openai`
- model: `gpt-4o-mini-transcribe` for OpenAI-style endpoints
- model: `whisper-1` for the generic compatible fallback

If a provider-specific API key already exists, StarkHarness can also inherit that provider config.

## CLI Examples

Check readiness:

```bash
node --import tsx src/main.ts voice-status
```

Transcribe a file:

```bash
node --import tsx src/main.ts voice-transcribe --path=./fixtures/meeting.wav
```

Use it inside the tool loop:

```json
{
  "tool": "voice_transcribe",
  "input": {
    "path": "fixtures/meeting.wav"
  }
}
```

## Design Notes

- Voice is treated as a network capability, so it respects the runtime permission model.
- The implementation uses the OpenAI-style `/audio/transcriptions` HTTP contract.
- The returned payload is normalized into a simple `{ text, language, duration }` shape plus the raw response.

## Current Limits

- No live microphone capture in the harness itself
- No streaming STT loop yet
- No TTS or spoken output
- No browser-side recorder UI yet

Those can be layered on later without changing the basic transcription contract that already exists today.
