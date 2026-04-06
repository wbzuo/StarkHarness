# Voice Mode

StarkHarness 现在已经带有一层轻量语音/转写能力，而且没有引入新的重型 SDK 依赖。

## 当前能做什么

目前的 voice 支持是“基于音频文件的转写”，还不是完整的流式语音助手。

已提供的能力面：

- `voice-status`
- `voice-transcribe`
- `voice_transcribe`

这意味着 voice 已经可以作为下游 agent app 的基础能力使用，但不会过早把整个 runtime 绑死在复杂音频栈上。

## 环境变量

- `STARKHARNESS_VOICE_ENABLED`
- `STARKHARNESS_VOICE_PROVIDER`
- `STARKHARNESS_VOICE_BASE_URL`
- `STARKHARNESS_VOICE_API_KEY`
- `STARKHARNESS_VOICE_MODEL`

默认值：

- provider: `openai`
- OpenAI 风格端点默认模型：`gpt-4o-mini-transcribe`
- generic compatible fallback 默认模型：`whisper-1`

如果对应 provider 已经配置过 API key，voice 也可以直接继承那一层 provider 配置。

## CLI 示例

查看状态：

```bash
node --import tsx src/main.ts voice-status
```

转写本地音频文件：

```bash
node --import tsx src/main.ts voice-transcribe --path=./fixtures/meeting.wav
```

作为工具调用：

```json
{
  "tool": "voice_transcribe",
  "input": {
    "path": "fixtures/meeting.wav"
  }
}
```

## 设计说明

- voice 被归类为 `network` 能力，因此仍然受权限系统约束。
- 底层采用 OpenAI 风格的 `/audio/transcriptions` HTTP 接口。
- 返回值会被归一化为 `{ text, language, duration }` 这样的稳定结构，同时保留原始响应。

## 当前边界

- 还没有内置麦克风采集
- 还没有流式 STT 循环
- 还没有 TTS / spoken output
- 还没有浏览器端录音界面

这些都可以在后续继续往上叠，而不需要推翻现在已经稳定下来的基础转写接口。
