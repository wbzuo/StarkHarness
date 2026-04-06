import path from 'node:path';
import { readFile } from 'node:fs/promises';

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-transcribe',
  },
  compatible: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'whisper-1',
  },
};

function ensureApiBaseUrl(baseUrl) {
  const trimmed = String(baseUrl ?? '').replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export function resolveVoiceConfig(envConfig = {}) {
  const raw = envConfig.raw ?? process.env;
  const provider = envConfig.voice?.provider ?? raw.STARKHARNESS_VOICE_PROVIDER ?? 'openai';
  const providerConfig = envConfig.providers?.[provider] ?? {};
  const providerDefaults = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.openai;
  const baseUrl = ensureApiBaseUrl(
    envConfig.voice?.baseUrl
      ?? raw.STARKHARNESS_VOICE_BASE_URL
      ?? providerConfig.baseUrl
      ?? providerDefaults.baseUrl,
  );
  const apiKey = envConfig.voice?.apiKey
    ?? raw.STARKHARNESS_VOICE_API_KEY
    ?? providerConfig.apiKey
    ?? providerConfig.accessToken
    ?? null;
  const model = envConfig.voice?.model
    ?? raw.STARKHARNESS_VOICE_MODEL
    ?? providerConfig.model
    ?? providerDefaults.model;
  const enabled = envConfig.voice?.enabled ?? true;

  return {
    enabled,
    provider,
    baseUrl,
    endpoint: `${baseUrl}/audio/transcriptions`,
    model,
    apiKey,
    apiKeyConfigured: Boolean(apiKey),
  };
}

export function describeVoice(envConfig = {}) {
  const config = resolveVoiceConfig(envConfig);
  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    endpoint: config.endpoint,
    ready: config.enabled && config.apiKeyConfigured,
    apiKeyConfigured: config.apiKeyConfigured,
  };
}

export async function transcribeAudio({ filePath, prompt = '', language = '', envConfig = {} } = {}) {
  const config = resolveVoiceConfig(envConfig);
  if (!config.enabled) {
    throw new Error('voice-mode-disabled');
  }
  if (!config.apiKey) {
    throw new Error('voice-provider-not-configured');
  }

  const audio = await readFile(filePath);
  const body = new FormData();
  body.set('model', config.model);
  body.set('file', new Blob([audio]), path.basename(filePath));
  if (prompt) body.set('prompt', String(prompt));
  if (language) body.set('language', String(language));

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`voice-transcription-failed:${response.status}${errorText ? `:${errorText}` : ''}`);
  }

  const payload = await response.json();
  return {
    provider: config.provider,
    model: config.model,
    text: payload.text ?? '',
    language: payload.language ?? language ?? null,
    duration: payload.duration ?? null,
    raw: payload,
  };
}
