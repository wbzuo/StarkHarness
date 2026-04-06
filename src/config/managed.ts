function mergeSection(base, override) {
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

export function mergeManagedSettingsIntoEnv(envConfig = {}, settings = {}) {
  if (!settings || typeof settings !== 'object') return envConfig;
  return {
    ...envConfig,
    providers: {
      anthropic: mergeSection(envConfig.providers?.anthropic, settings.providers?.anthropic),
      openai: mergeSection(envConfig.providers?.openai, settings.providers?.openai),
      compatible: mergeSection(envConfig.providers?.compatible, settings.providers?.compatible),
    },
    bridge: mergeSection(envConfig.bridge, settings.bridge),
    webAccess: mergeSection(envConfig.webAccess, settings.webAccess),
    search: mergeSection(envConfig.search, settings.search),
    voice: mergeSection(envConfig.voice, settings.voice),
    plugins: mergeSection(envConfig.plugins, settings.plugins),
    settings: mergeSection(envConfig.settings, settings.settings),
    features: mergeSection(envConfig.features, settings.features),
    telemetry: {
      ...(envConfig.telemetry ?? {}),
      ...(settings.telemetry ?? {}),
      featureFlags: {
        ...(envConfig.telemetry?.featureFlags ?? {}),
        ...(settings.telemetry?.featureFlags ?? {}),
      },
    },
  };
}

export async function fetchManagedSettings({ url, token = null } = {}) {
  if (!url) throw new Error('managed-settings-url-missing');
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`managed-settings-fetch-failed:${response.status}`);
  }
  return response.json();
}
