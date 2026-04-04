export function selectProvider(providers, requiredCapability) {
  for (const p of providers) {
    if (p.capabilities?.includes(requiredCapability)) return p.id;
  }
  return null;
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
      const pref = this.#providers.find((p) => p.id === prefer);
      if (pref?.capabilities?.includes(cap)) return prefer;
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
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), timeout),
        ),
      ]);
      return result;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
