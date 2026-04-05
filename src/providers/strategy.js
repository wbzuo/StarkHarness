export function selectProvider(providers, requiredCapability) {
  for (const p of providers) {
    if (p.capabilities?.includes(requiredCapability)) return p.id;
  }
  return null;
}

function matchesPreference(provider, prefer) {
  if (!prefer) return false;
  if (provider.id === prefer) return true;
  if (provider.modelFamily === prefer) return true;
  return Array.isArray(provider.aliases) && provider.aliases.includes(prefer);
}

export function isRetryableError(error) {
  if (!error) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  if (typeof error.status === 'number') {
    if ([408, 409, 425, 429].includes(error.status)) return true;
    if (error.status >= 500) return true;
    if (error.status >= 400 && error.status < 500) return false;
  }
  if (error instanceof TypeError) return true;
  const message = String(error.message ?? error);
  if (/timed out|timeout|network|fetch failed|econnreset|socket hang up/i.test(message)) return true;
  if (/\b40[0-9]\b|\b41[0-9]\b|\b42[0-9]\b|\b43[0-9]\b|\b44[0-9]\b/.test(message)) return false;
  return true;
}

export class ModelStrategy {
  #providers;
  #unavailable;

  constructor({ providers = [], unavailable = new Set() } = {}) {
    this.#providers = providers.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    this.#unavailable = unavailable;
  }

  select({ require: cap = 'chat', prefer } = {}) {
    if (prefer && !this.#unavailable.has(prefer)) {
      const pref = this.#providers.find((p) => matchesPreference(p, prefer));
      if (pref?.capabilities?.includes(cap)) return pref.id;
    }
    for (const p of this.#providers) {
      if (this.#unavailable.has(p.id)) continue;
      if (p.capabilities?.includes(cap)) return p.id;
    }
    return null;
  }

  markUnavailable(id) {
    this.#unavailable.add(id);
  }

  markAvailable(id) {
    this.#unavailable.delete(id);
  }
}

export async function withRetry(fn, { maxRetries = 3, baseDelay = 1000, timeout = 120000 } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => {
          const error = new Error('Request timed out');
          error.name = 'TimeoutError';
          setTimeout(() => reject(error), timeout);
        }),
      ]);
      return result;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      if (!isRetryableError(err)) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
