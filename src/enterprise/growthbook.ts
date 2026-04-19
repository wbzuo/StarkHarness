export function createFeatureFlagManager(config = {}) {
  let remoteFlags = {};

  return {
    async sync() {
      if (!config.growthBookUrl) return remoteFlags;
      const response = await fetch(config.growthBookUrl, {
        headers: config.growthBookClientKey
          ? { Authorization: `Bearer ${config.growthBookClientKey}` }
          : {},
      });
      const payload = await response.json();
      remoteFlags = payload.features ?? payload.flags ?? payload ?? {};
      return remoteFlags;
    },
    getAll() {
      return {
        ...(config.featureFlags ?? {}),
        ...remoteFlags,
      };
    },
    status() {
      return {
        growthBookUrl: config.growthBookUrl ?? null,
        growthBookClientKeyConfigured: Boolean(config.growthBookClientKey),
        localFlags: config.featureFlags ?? {},
        remoteFlags,
      };
    },
  };
}
