export function createInspectorHtml({ wsUrl }: { wsUrl: string }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StarkHarness Inspector</title>
  <style>
    :root {
      --bg: #09111a;
      --bg-soft: #0f1823;
      --panel: rgba(18, 28, 39, 0.88);
      --panel-strong: rgba(22, 34, 48, 0.95);
      --line: rgba(255,255,255,.08);
      --line-strong: rgba(255,255,255,.14);
      --text: #eaf2f8;
      --muted: #98aec4;
      --accent: #79d2a6;
      --accent-2: #5fb8ff;
      --warn: #f6c85f;
      --error: #fb7185;
      --shadow: 0 24px 60px rgba(0,0,0,.28);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(95,184,255,.16), transparent 26%),
        radial-gradient(circle at bottom right, rgba(121,210,166,.12), transparent 24%),
        linear-gradient(180deg, #081018 0%, #09111a 100%);
      min-height: 100vh;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #081018;
    }
    button.secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--line);
    }
    input[type="checkbox"] {
      accent-color: var(--accent);
    }
    .shell {
      max-width: 1520px;
      margin: 0 auto;
      padding: 28px 18px 32px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 18px;
      margin-bottom: 18px;
    }
    .card {
      background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.015));
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
    }
    .hero-card {
      padding: 22px;
    }
    .eyebrow {
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: .14em;
      font-size: 11px;
      font-weight: 700;
    }
    .title {
      margin: 10px 0 10px;
      font-size: 34px;
      line-height: 1.04;
    }
    .subtitle {
      margin: 0;
      color: var(--muted);
      line-height: 1.65;
      max-width: 70ch;
    }
    .status-row, .control-row, .metric-grid, .layout, .trace-meta, .detail-grid {
      display: grid;
      gap: 12px;
    }
    .status-row {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      margin-top: 18px;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 10px 14px;
      color: var(--muted);
      background: rgba(255,255,255,.03);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--error);
      box-shadow: 0 0 0 6px rgba(251,113,133,.12);
      flex: 0 0 auto;
    }
    .dot.connected {
      background: var(--accent);
      box-shadow: 0 0 0 6px rgba(121,210,166,.12);
    }
    .hero-side {
      padding: 22px;
      display: grid;
      gap: 14px;
    }
    .hero-side h3 {
      margin: 0;
      font-size: 16px;
    }
    .hero-side p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .control-row {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      margin-top: 8px;
    }
    .control-box {
      padding: 14px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.03);
    }
    .control-label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: 10px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-size: 14px;
      margin-top: 8px;
    }
    .metric-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 18px;
    }
    .metric {
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .metric-value {
      margin-top: 8px;
      font-size: 28px;
      font-weight: 800;
      line-height: 1;
    }
    .layout {
      grid-template-columns: 300px minmax(0, 1fr) 320px;
      min-height: 620px;
    }
    .panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .panel-header {
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .panel-title {
      font-size: 13px;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .panel-subtitle {
      color: var(--muted);
      font-size: 12px;
    }
    .panel-content {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 14px;
    }
    .trace-item {
      padding: 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.025);
      margin-bottom: 10px;
      cursor: pointer;
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }
    .trace-item:hover {
      transform: translateY(-1px);
      border-color: var(--line-strong);
      background: rgba(255,255,255,.04);
    }
    .trace-item.active {
      border-color: var(--accent-2);
      background: rgba(95,184,255,.10);
    }
    .trace-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .trace-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      color: var(--accent-2);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .trace-status {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--text);
    }
    .trace-preview {
      margin-top: 8px;
      color: #d8e5f0;
      font-size: 13px;
      line-height: 1.5;
    }
    .trace-meta {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
    }
    .log-line {
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255,255,255,.025);
      border: 1px solid rgba(255,255,255,.05);
      margin-bottom: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.6;
    }
    .log-line.type-chunk {
      border-left: 3px solid var(--accent-2);
    }
    .log-line.type-sys {
      border-left: 3px solid var(--accent);
    }
    .log-line.type-error {
      border-left: 3px solid var(--error);
      background: rgba(251,113,133,.08);
    }
    .log-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .log-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-weight: 700;
    }
    .log-time {
      color: var(--muted);
      font-size: 11px;
    }
    .log-trace {
      color: var(--accent-2);
      font-size: 11px;
    }
    .log-body {
      white-space: pre-wrap;
      word-break: break-word;
      color: #e2edf7;
    }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 16px;
      padding: 16px;
      color: var(--muted);
      line-height: 1.6;
    }
    .detail-grid {
      grid-template-columns: 1fr;
    }
    .detail-card {
      padding: 14px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.03);
    }
    .detail-card h4 {
      margin: 0 0 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
    }
    .detail-card pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: #dce8f2;
      font-size: 13px;
      line-height: 1.6;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    @media (max-width: 1180px) {
      .hero, .layout {
        grid-template-columns: 1fr;
      }
      .metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 720px) {
      .shell {
        padding-inline: 12px;
      }
      .metric-grid {
        grid-template-columns: 1fr;
      }
      .title {
        font-size: 28px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="card hero-card">
        <div class="eyebrow">Live Visual Debugging</div>
        <h1 class="title">StarkHarness Inspector</h1>
        <p class="subtitle">
          Watch trace activity, token usage, command completions, and live text output as the active runtime works.
          This surface subscribes to the same bridge events that power remote-control clients.
        </p>
        <div class="status-row">
          <div class="status-pill">
            <span id="conn-dot" class="dot"></span>
            <span id="conn-text">Connecting...</span>
          </div>
          <div class="status-pill">
            <span class="dot connected" style="box-shadow:none;background:var(--accent-2)"></span>
            <span id="trace-summary">0 tracked traces</span>
          </div>
        </div>
      </div>
      <div class="card hero-side">
        <div>
          <h3>Inspector Controls</h3>
          <p>Switch between all traces and one selected trace, clear local history, and tune how noisy the stream is.</p>
        </div>
        <div class="control-row">
          <div class="control-box">
            <div class="control-label">Actions</div>
            <div class="actions">
              <button id="subscribe-all">Subscribe All</button>
              <button id="reset-filter" class="secondary">Reset Filter</button>
              <button id="clear-logs" class="secondary">Clear Logs</button>
            </div>
          </div>
          <div class="control-box">
            <div class="control-label">Visibility</div>
            <label class="toggle"><input type="checkbox" id="filter-chunks" checked> Show text chunks</label>
            <label class="toggle"><input type="checkbox" id="filter-system" checked> Show system events</label>
          </div>
        </div>
      </div>
    </section>

    <section class="metric-grid">
      <div class="metric">
        <div class="metric-label">Tracked Traces</div>
        <div class="metric-value" id="stat-traces">0</div>
      </div>
      <div class="metric">
        <div class="metric-label">Stream Events</div>
        <div class="metric-value" id="stat-events">0</div>
      </div>
      <div class="metric">
        <div class="metric-label">Completed Turns</div>
        <div class="metric-value" id="stat-turns">0</div>
      </div>
      <div class="metric">
        <div class="metric-label">Approx Tokens</div>
        <div class="metric-value" id="stat-tokens">0</div>
      </div>
    </section>

    <section class="layout">
      <aside class="card panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Trace Timeline</div>
            <div class="panel-subtitle">Select one trace to focus the event stream.</div>
          </div>
        </div>
        <div class="panel-content" id="trace-list"></div>
      </aside>

      <main class="card panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Live Event Stream</div>
            <div class="panel-subtitle" id="stream-subtitle">Showing all trace activity.</div>
          </div>
        </div>
        <div class="panel-content" id="log-view"></div>
      </main>

      <aside class="card panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">Trace Details</div>
            <div class="panel-subtitle">Current selection and event mix.</div>
          </div>
        </div>
        <div class="panel-content detail-grid">
          <div class="detail-card">
            <h4>Selection</h4>
            <pre id="selection-card">All traces</pre>
          </div>
          <div class="detail-card">
            <h4>Recent Event</h4>
            <pre id="event-card">No events yet.</pre>
          </div>
          <div class="detail-card">
            <h4>Filters</h4>
            <pre id="filter-card">Trace filter: all\nText chunks: on\nSystem events: on</pre>
          </div>
        </div>
      </aside>
    </section>
  </div>

  <script>
    const WS_URL = ${JSON.stringify(wsUrl)};
    let ws = null;
    const state = {
      traces: new Map(),
      logs: [],
      activeTraceId: null,
      stats: { events: 0, tokens: 0, turns: 0, errors: 0 },
      lastEvent: null,
    };

    const els = {
      dot: document.getElementById('conn-dot'),
      text: document.getElementById('conn-text'),
      traceSummary: document.getElementById('trace-summary'),
      traceList: document.getElementById('trace-list'),
      logView: document.getElementById('log-view'),
      traces: document.getElementById('stat-traces'),
      events: document.getElementById('stat-events'),
      tokens: document.getElementById('stat-tokens'),
      turns: document.getElementById('stat-turns'),
      streamSubtitle: document.getElementById('stream-subtitle'),
      selectionCard: document.getElementById('selection-card'),
      eventCard: document.getElementById('event-card'),
      filterCard: document.getElementById('filter-card'),
      filterChunks: document.getElementById('filter-chunks'),
      filterSystem: document.getElementById('filter-system'),
      subscribeAll: document.getElementById('subscribe-all'),
      resetFilter: document.getElementById('reset-filter'),
      clearLogs: document.getElementById('clear-logs'),
    };

    function escapeHtml(unsafe) {
      return (unsafe || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function nowLabel(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    }

    function getTraceKey(payload) {
      return payload.traceId || payload.requestId || null;
    }

    function updateStats() {
      els.traces.textContent = state.traces.size.toLocaleString();
      els.events.textContent = state.stats.events.toLocaleString();
      els.tokens.textContent = state.stats.tokens.toLocaleString();
      els.turns.textContent = state.stats.turns.toLocaleString();
      els.traceSummary.textContent = state.traces.size + ' tracked trace' + (state.traces.size === 1 ? '' : 's');
    }

    function renderFilterSummary() {
      const trace = state.activeTraceId ? state.activeTraceId : 'all';
      els.filterCard.textContent =
        'Trace filter: ' + trace + '\\n'
        + 'Text chunks: ' + (els.filterChunks.checked ? 'on' : 'off') + '\\n'
        + 'System events: ' + (els.filterSystem.checked ? 'on' : 'off');
      els.streamSubtitle.textContent = state.activeTraceId
        ? 'Showing only events for trace ' + state.activeTraceId + '.'
        : 'Showing all trace activity.';
    }

    function upsertTrace(traceId, patch = {}) {
      if (!traceId) return null;
      const current = state.traces.get(traceId) || {
        id: traceId,
        preview: 'Waiting for first event...',
        status: 'Listening',
        chunks: 0,
        events: 0,
        turns: 0,
        errors: 0,
        lastUpdate: null,
        lastType: null,
      };
      const next = { ...current, ...patch };
      state.traces.set(traceId, next);
      return next;
    }

    function renderTraces() {
      if (state.traces.size === 0) {
        els.traceList.innerHTML = '<div class="empty">No trace activity yet. Start a run through the bridge, docs playground, or REPL-backed flow and live traces will appear here.</div>';
        return;
      }

      const traces = Array.from(state.traces.values())
        .sort((left, right) => (right.lastUpdate || '').localeCompare(left.lastUpdate || ''));
      els.traceList.innerHTML = traces.map((trace) => {
        const active = trace.id === state.activeTraceId ? ' active' : '';
        return '<div class="trace-item' + active + '" data-trace-id="' + escapeHtml(trace.id) + '">'
          + '<div class="trace-head"><div class="trace-id">' + escapeHtml(trace.id) + '</div><div class="trace-status">' + escapeHtml(trace.status) + '</div></div>'
          + '<div class="trace-preview">' + escapeHtml(trace.preview) + '</div>'
          + '<div class="trace-meta">'
          + '<div>Events: ' + trace.events + '</div>'
          + '<div>Chunks: ' + trace.chunks + '</div>'
          + '<div>Turns: ' + trace.turns + '</div>'
          + '<div>Errors: ' + trace.errors + '</div>'
          + '</div>'
          + '</div>';
      }).join('');

      els.traceList.querySelectorAll('[data-trace-id]').forEach((element) => {
        element.addEventListener('click', () => {
          state.activeTraceId = element.getAttribute('data-trace-id');
          renderFilterSummary();
          renderTraces();
          renderLogs();
          renderDetails();
        });
      });
    }

    function getVisibleLogs() {
      return state.logs.filter((entry) => {
        if (entry.type === 'chunk' && !els.filterChunks.checked) return false;
        if ((entry.type === 'sys' || entry.type === 'command') && !els.filterSystem.checked) return false;
        if (state.activeTraceId && entry.traceId !== state.activeTraceId) return false;
        return true;
      });
    }

    function renderLogs() {
      const visible = getVisibleLogs();
      if (visible.length === 0) {
        els.logView.innerHTML = '<div class="empty">No visible events for the current filter. Toggle chunk/system visibility or reset the trace filter.</div>';
        return;
      }

      els.logView.innerHTML = visible.map((entry) => {
        return '<div class="log-line type-' + escapeHtml(entry.type) + '">'
          + '<div class="log-head">'
          + '<span class="log-badge">' + escapeHtml(entry.label) + '</span>'
          + '<span class="log-time">' + escapeHtml(nowLabel(entry.timestamp)) + '</span>'
          + '</div>'
          + (entry.traceId ? '<div class="log-trace">' + escapeHtml(entry.traceId) + '</div>' : '')
          + '<div class="log-body">' + escapeHtml(entry.body) + '</div>'
          + '</div>';
      }).join('');
      els.logView.scrollTop = els.logView.scrollHeight;
    }

    function renderDetails() {
      const selected = state.activeTraceId ? state.traces.get(state.activeTraceId) : null;
      if (!selected) {
        els.selectionCard.textContent = 'All traces\\nTracked: ' + state.traces.size;
      } else {
        els.selectionCard.textContent =
          'Trace: ' + selected.id + '\\n'
          + 'Status: ' + selected.status + '\\n'
          + 'Events: ' + selected.events + '\\n'
          + 'Chunks: ' + selected.chunks + '\\n'
          + 'Turns: ' + selected.turns + '\\n'
          + 'Errors: ' + selected.errors;
      }

      if (!state.lastEvent) {
        els.eventCard.textContent = 'No events yet.';
        return;
      }
      els.eventCard.textContent =
        'Type: ' + state.lastEvent.label + '\\n'
        + 'Trace: ' + (state.lastEvent.traceId || 'n/a') + '\\n'
        + 'At: ' + nowLabel(state.lastEvent.timestamp) + '\\n\\n'
        + state.lastEvent.body;
    }

    function recordEvent({ traceId = null, type = 'sys', label = 'system', body = '' }) {
      const entry = {
        traceId,
        type,
        label,
        body,
        timestamp: Date.now(),
      };
      state.logs.push(entry);
      if (state.logs.length > 600) state.logs.shift();
      state.lastEvent = entry;
      renderLogs();
      renderDetails();
    }

    function setConnection(connected, label) {
      els.dot.className = connected ? 'dot connected' : 'dot';
      els.text.textContent = label;
    }

    function subscribeAll() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'subscribe', topics: ['runs'] }));
    }

    function connect() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const finalUrl = token ? WS_URL + '?token=' + encodeURIComponent(token) : WS_URL;
      ws = new WebSocket(finalUrl);

      ws.onopen = () => {
        setConnection(true, 'Connected to live runtime bridge');
        subscribeAll();
        recordEvent({ type: 'sys', label: 'connected', body: 'WebSocket connected and subscribed to run events.' });
      };

      ws.onclose = () => {
        setConnection(false, 'Disconnected, retrying in 3s');
        recordEvent({ type: 'error', label: 'disconnected', body: 'Bridge connection closed. Retrying automatically...' });
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setConnection(false, 'Connection error');
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const traceId = getTraceKey(data);
        state.stats.events += 1;

        if (data.type === 'chunk') {
          const preview = String(data.chunk || '').slice(0, 72) || 'Streaming output...';
          const trace = upsertTrace(traceId, {
            preview,
            status: 'Streaming',
            chunks: (state.traces.get(traceId)?.chunks || 0) + 1,
            events: (state.traces.get(traceId)?.events || 0) + 1,
            lastUpdate: new Date().toISOString(),
            lastType: 'chunk',
          });
          recordEvent({ traceId: trace?.id || traceId, type: 'chunk', label: 'chunk', body: String(data.chunk || '') });
        } else if (data.type === 'complete') {
          state.stats.tokens += Number(data.usage?.input_tokens || 0) + Number(data.usage?.output_tokens || 0);
          state.stats.turns += Number(data.turns || 0);
          const trace = upsertTrace(traceId, {
            preview: 'Completed with ' + (data.turns || 0) + ' turn' + (data.turns === 1 ? '' : 's'),
            status: 'Completed',
            events: (state.traces.get(traceId)?.events || 0) + 1,
            turns: Number(data.turns || 0),
            lastUpdate: new Date().toISOString(),
            lastType: 'complete',
          });
          recordEvent({
            traceId: trace?.id || traceId,
            type: 'sys',
            label: 'complete',
            body: 'Stop reason: ' + (data.stopReason || 'end_turn') + '\\nTurns: ' + (data.turns || 0),
          });
        } else if (data.type === 'error') {
          state.stats.errors += 1;
          const trace = upsertTrace(traceId, {
            preview: String(data.error || 'Unknown error'),
            status: 'Error',
            events: (state.traces.get(traceId)?.events || 0) + 1,
            errors: (state.traces.get(traceId)?.errors || 0) + 1,
            lastUpdate: new Date().toISOString(),
            lastType: 'error',
          });
          recordEvent({ traceId: trace?.id || traceId, type: 'error', label: 'error', body: String(data.error || 'Unknown error') });
        } else if (data.type === 'command-result') {
          recordEvent({
            traceId,
            type: 'command',
            label: 'command',
            body: 'Command: ' + (data.name || 'unknown') + '\\n' + JSON.stringify(data.result || null, null, 2),
          });
        } else if (data.type === 'connected' || data.type === 'subscribed') {
          recordEvent({ type: 'sys', label: data.type, body: JSON.stringify(data, null, 2) });
        } else {
          recordEvent({ traceId, type: 'sys', label: data.type || 'event', body: JSON.stringify(data, null, 2) });
        }

        updateStats();
        renderTraces();
      };
    }

    els.subscribeAll.addEventListener('click', () => {
      state.activeTraceId = null;
      subscribeAll();
      renderFilterSummary();
      renderTraces();
      renderLogs();
      renderDetails();
    });
    els.resetFilter.addEventListener('click', () => {
      state.activeTraceId = null;
      renderFilterSummary();
      renderTraces();
      renderLogs();
      renderDetails();
    });
    els.clearLogs.addEventListener('click', () => {
      state.logs = [];
      state.lastEvent = null;
      renderLogs();
      renderDetails();
    });
    els.filterChunks.addEventListener('change', () => {
      renderFilterSummary();
      renderLogs();
    });
    els.filterSystem.addEventListener('change', () => {
      renderFilterSummary();
      renderLogs();
    });

    updateStats();
    renderFilterSummary();
    renderTraces();
    renderLogs();
    renderDetails();
    connect();
  </script>
</body>
</html>`;
}
