function parseSentryDsn(dsn) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

export function createObservabilityManager(config = {}) {
  return {
    config,
    async report(eventName, payload = {}) {
      const event = {
        eventName,
        payload,
        recordedAt: new Date().toISOString(),
      };

      if (config.monitoringUrl) {
        await fetch(config.monitoringUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.monitoringToken ? { Authorization: `Bearer ${config.monitoringToken}` } : {}),
          },
          body: JSON.stringify(event),
        }).catch(() => {});
      }

      if (config.sentryDsn && (/error/i.test(eventName) || payload.error)) {
        const parsed = parseSentryDsn(config.sentryDsn);
        if (parsed) {
          const envelope = [
            JSON.stringify({ sent_at: new Date().toISOString(), sdk: { name: 'starkharness', version: '0.1.0' } }),
            JSON.stringify({ type: 'event' }),
            JSON.stringify({
              level: 'error',
              message: {
                formatted: payload.error ?? `${eventName}`,
              },
              extra: event,
            }),
          ].join('\n');

          await fetch(`${parsed.envelopeUrl}?sentry_key=${parsed.publicKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-sentry-envelope' },
            body: envelope,
          }).catch(() => {});
        }
      }
    },
    status() {
      return {
        monitoringUrl: config.monitoringUrl ?? null,
        monitoringEnabled: Boolean(config.monitoringUrl),
        sentryDsn: config.sentryDsn ?? null,
        sentryEnabled: Boolean(config.sentryDsn),
      };
    },
  };
}
