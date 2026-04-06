function createHeaders(token = null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isWebSocketUrl(url = '') {
  return /^wss?:\/\//i.test(String(url));
}

async function ackRemoteCommand(baseUrl, token, payload = {}) {
  if (!baseUrl) return;
  await fetch(`${baseUrl.replace(/\/+$/, '')}/ack`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createHeaders(token),
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function describeRemoteBridge(envConfig = {}, state = {}) {
  const bridge = envConfig.bridge ?? {};
  return {
    enabled: Boolean(bridge.remoteBridgeUrl),
    url: bridge.remoteBridgeUrl ?? null,
    mode: isWebSocketUrl(bridge.remoteBridgeUrl) ? 'websocket' : 'poll',
    clientId: bridge.remoteBridgeClientId ?? null,
    pollMs: bridge.remoteBridgePollMs ?? 5000,
    connected: Boolean(state.connected),
    lastPollAt: state.lastPollAt ?? null,
    lastCommandAt: state.lastCommandAt ?? null,
    lastEventAt: state.lastEventAt ?? null,
    lastError: state.lastError ?? null,
  };
}

async function executeRemotePayload(runtime, payload = {}) {
  if (payload.type === 'command') {
    return runtime.dispatchCommand(payload.name, payload.args ?? {});
  }
  if (payload.type === 'run') {
    return runtime.run(payload.prompt ?? payload.message ?? '');
  }
  if (payload.type === 'settings') {
    return runtime.applyManagedSettings(payload.settings ?? {});
  }
  return { ok: false, reason: 'unknown-remote-payload', payload };
}

export async function pollRemoteBridge(runtime) {
  const baseUrl = runtime.env?.bridge?.remoteBridgeUrl;
  const token = runtime.env?.bridge?.remoteBridgeToken ?? null;
  const clientId = runtime.env?.bridge?.remoteBridgeClientId ?? runtime.session.id;
  if (!baseUrl) throw new Error('remote-bridge-url-missing');
  if (isWebSocketUrl(baseUrl)) {
    return {
      ok: true,
      mode: 'websocket',
      connected: runtime.remoteBridgeState.connected,
    };
  }
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/next`);
  url.searchParams.set('clientId', clientId);
  const response = await fetch(url, {
    headers: createHeaders(token),
  });
  runtime.remoteBridgeState.lastPollAt = new Date().toISOString();
  if (response.status === 204) {
    runtime.remoteBridgeState.lastError = null;
    return { ok: true, empty: true };
  }
  if (!response.ok) {
    runtime.remoteBridgeState.lastError = `poll-failed:${response.status}`;
    throw new Error(runtime.remoteBridgeState.lastError);
  }
  const payload = await response.json();
  const result = await executeRemotePayload(runtime, payload);
  runtime.remoteBridgeState.lastCommandAt = new Date().toISOString();
  runtime.remoteBridgeState.lastError = null;
  await ackRemoteCommand(baseUrl, token, {
    clientId,
    type: payload.type ?? null,
    name: payload.name ?? null,
    ok: result?.ok !== false,
  });
  return {
    ok: true,
    payload,
    result,
  };
}

function sendSocketMessage(runtime, payload = {}) {
  if (runtime.remoteBridgeSocket?.readyState === WebSocket.OPEN) {
    runtime.remoteBridgeSocket.send(JSON.stringify(payload));
    runtime.remoteBridgeState.lastEventAt = new Date().toISOString();
    return true;
  }
  return false;
}

async function handleWebSocketPayload(runtime, payload = {}) {
  if (payload.type === 'ping') {
    sendSocketMessage(runtime, { type: 'pong', clientId: runtime.session.id });
    return;
  }
  const result = await executeRemotePayload(runtime, payload);
  sendSocketMessage(runtime, {
    type: 'result',
    requestId: payload.requestId ?? null,
    name: payload.name ?? null,
    payloadType: payload.type ?? null,
    result,
  });
}

export function startRemoteBridge(runtime) {
  const remoteUrl = runtime.env?.bridge?.remoteBridgeUrl;
  if (!remoteUrl) return describeRemoteBridge(runtime.env, runtime.remoteBridgeState);
  if (isWebSocketUrl(remoteUrl)) {
    if (runtime.remoteBridgeSocket && runtime.remoteBridgeSocket.readyState <= WebSocket.OPEN) {
      return describeRemoteBridge(runtime.env, runtime.remoteBridgeState);
    }
    const url = new URL(remoteUrl);
    const token = runtime.env?.bridge?.remoteBridgeToken ?? null;
    const clientId = runtime.env?.bridge?.remoteBridgeClientId ?? runtime.session.id;
    if (token) url.searchParams.set('token', token);
    url.searchParams.set('clientId', clientId);
    const socket = new WebSocket(url.toString());
    runtime.remoteBridgeSocket = socket;
    runtime.remoteBridgeState.connected = false;

    socket.onopen = () => {
      runtime.remoteBridgeState.connected = true;
      runtime.remoteBridgeState.lastError = null;
      sendSocketMessage(runtime, {
        type: 'hello',
        clientId,
        sessionId: runtime.session.id,
        app: runtime.app?.name ?? null,
      });
    };

    socket.onmessage = (event) => {
      Promise.resolve()
        .then(() => JSON.parse(String(event.data)))
        .then((payload) => handleWebSocketPayload(runtime, payload))
        .catch((error) => {
          runtime.remoteBridgeState.lastError = error instanceof Error ? error.message : String(error);
        });
    };

    socket.onclose = () => {
      runtime.remoteBridgeState.connected = false;
    };
    socket.onerror = () => {
      runtime.remoteBridgeState.lastError = 'remote-bridge-websocket-error';
    };
    return describeRemoteBridge(runtime.env, runtime.remoteBridgeState);
  }

  if (runtime.remoteBridgeTimer) return describeRemoteBridge(runtime.env, runtime.remoteBridgeState);
  const pollMs = Number(runtime.env?.bridge?.remoteBridgePollMs ?? 5000);
  runtime.remoteBridgeState.connected = true;
  runtime.remoteBridgeTimer = setInterval(() => {
    pollRemoteBridge(runtime).catch((error) => {
      runtime.remoteBridgeState.lastError = error instanceof Error ? error.message : String(error);
    });
  }, pollMs);
  runtime.remoteBridgeTimer.unref?.();
  return describeRemoteBridge(runtime.env, runtime.remoteBridgeState);
}

export function stopRemoteBridge(runtime) {
  if (runtime.remoteBridgeSocket) {
    runtime.remoteBridgeSocket.close();
    runtime.remoteBridgeSocket = null;
  }
  if (runtime.remoteBridgeTimer) {
    clearInterval(runtime.remoteBridgeTimer);
    runtime.remoteBridgeTimer = null;
  }
  runtime.remoteBridgeState.connected = false;
  return describeRemoteBridge(runtime.env, runtime.remoteBridgeState);
}

export function emitRemoteBridgeEvent(runtime, payload = {}) {
  const remoteUrl = runtime.env?.bridge?.remoteBridgeUrl;
  if (!remoteUrl || !isWebSocketUrl(remoteUrl)) return false;
  return sendSocketMessage(runtime, {
    type: 'event',
    ...payload,
  });
}
