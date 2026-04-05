import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function loadEnvFile(filePath) {
  if (!filePath) return {};
  const content = await readFile(filePath, 'utf8').catch(() => '');
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function quoteEnvValue(value) {
  const stringValue = String(value ?? '');
  return /[\s#"'=]/.test(stringValue) ? JSON.stringify(stringValue) : stringValue;
}

async function loadEnvLines(filePath) {
  const content = await readFile(filePath, 'utf8').catch(() => '');
  return content ? content.split(/\r?\n/) : [];
}

export async function loadRuntimeEnv({ cwd = process.cwd(), envFilePath = null, env = process.env } = {}) {
  const filePath = envFilePath ? path.resolve(cwd, envFilePath) : path.join(cwd, '.env');
  const fileEnv = await loadEnvFile(filePath);
  const raw = { ...fileEnv, ...env };

  return {
    raw,
    filePath,
    providers: {
      anthropic: {
        apiKey: raw.ANTHROPIC_API_KEY ?? null,
        baseUrl: raw.ANTHROPIC_BASE_URL ?? null,
        model: raw.ANTHROPIC_MODEL ?? null,
      },
      openai: {
        apiKey: raw.OPENAI_API_KEY ?? null,
        baseUrl: raw.OPENAI_BASE_URL ?? null,
        model: raw.OPENAI_MODEL ?? null,
      },
      compatible: {
        apiKey: raw.COMPATIBLE_API_KEY ?? null,
        baseUrl: raw.COMPATIBLE_BASE_URL ?? null,
        model: raw.COMPATIBLE_MODEL ?? null,
      },
    },
    bridge: {
      host: raw.STARKHARNESS_BRIDGE_HOST ?? '127.0.0.1',
      port: parseNumber(raw.STARKHARNESS_BRIDGE_PORT, 3000),
      authToken: raw.STARKHARNESS_BRIDGE_TOKEN ?? null,
      tokenProfiles: parseJson(raw.STARKHARNESS_TOKEN_PROFILES, {}),
      remoteControl: parseBoolean(raw.STARKHARNESS_REMOTE_CONTROL, true),
    },
    webAccess: {
      enabled: parseBoolean(raw.STARKHARNESS_FEATURE_WEB_ACCESS, true),
      proxyHost: raw.CDP_PROXY_HOST ?? '127.0.0.1',
      proxyPort: parseNumber(raw.CDP_PROXY_PORT, 3456),
    },
    search: {
      provider: raw.STARKHARNESS_WEB_SEARCH_PROVIDER ?? 'bing',
      baseUrl: raw.STARKHARNESS_WEB_SEARCH_BASE_URL ?? 'https://www.bing.com/search',
      count: parseNumber(raw.STARKHARNESS_WEB_SEARCH_COUNT, 8),
      market: raw.STARKHARNESS_WEB_SEARCH_MARKET ?? 'en-US',
    },
    features: {
      webAccess: parseBoolean(raw.STARKHARNESS_FEATURE_WEB_ACCESS, true),
      remoteControl: parseBoolean(raw.STARKHARNESS_REMOTE_CONTROL, true),
      autoMode: parseBoolean(raw.STARKHARNESS_AUTO_MODE, false),
      autoUpdate: parseBoolean(raw.STARKHARNESS_AUTO_UPDATE, false),
      debug: parseBoolean(raw.STARKHARNESS_DEBUG, false),
    },
    telemetry: {
      monitoringUrl: raw.STARKHARNESS_MONITORING_URL ?? null,
      monitoringToken: raw.STARKHARNESS_MONITORING_TOKEN ?? null,
      sentryDsn: raw.STARKHARNESS_SENTRY_DSN ?? null,
      growthBookUrl: raw.STARKHARNESS_GROWTHBOOK_URL ?? null,
      growthBookClientKey: raw.STARKHARNESS_GROWTHBOOK_CLIENT_KEY ?? null,
      featureFlags: parseJson(raw.STARKHARNESS_FEATURE_FLAGS, {}),
    },
  };
}

export async function writeEnvValues({ cwd = process.cwd(), envFilePath = null, values = {} } = {}) {
  const filePath = envFilePath ? path.resolve(cwd, envFilePath) : path.join(cwd, '.env');
  const lines = await loadEnvLines(filePath);
  const keys = Object.keys(values);
  const remaining = new Set(keys);
  const nextLines = lines.map((line) => {
    const separator = line.indexOf('=');
    if (separator === -1) return line;
    const key = line.slice(0, separator).trim();
    if (!remaining.has(key)) return line;
    remaining.delete(key);
    return `${key}=${quoteEnvValue(values[key])}`;
  });
  for (const key of remaining) {
    nextLines.push(`${key}=${quoteEnvValue(values[key])}`);
  }
  await writeFile(filePath, `${nextLines.filter(Boolean).join('\n')}\n`, 'utf8');
  return filePath;
}

export async function removeEnvKeys({ cwd = process.cwd(), envFilePath = null, keys = [] } = {}) {
  const filePath = envFilePath ? path.resolve(cwd, envFilePath) : path.join(cwd, '.env');
  const lines = await loadEnvLines(filePath);
  const deny = new Set(keys);
  const nextLines = lines.filter((line) => {
    const separator = line.indexOf('=');
    if (separator === -1) return true;
    const key = line.slice(0, separator).trim();
    return !deny.has(key);
  });
  await writeFile(filePath, `${nextLines.filter(Boolean).join('\n')}\n`, 'utf8');
  return filePath;
}
