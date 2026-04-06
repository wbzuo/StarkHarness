export function createInspectorHtml({ wsUrl }: { wsUrl: string }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StarkHarness Inspector ⚡️</title>
  <style>
    :root {
      --bg: #0d131b;
      --panel: #16202c;
      --line: rgba(255,255,255,.08);
      --text: #eaf0f6;
      --muted: #99afc6;
      --accent: #60a5fa;
      --success: #6ee7b7;
      --error: #fb7185;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top right, rgba(96,165,250,.08), transparent 40%), var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(13, 19, 27, 0.8);
      backdrop-filter: blur(8px);
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--muted);
    }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--error);
      box-shadow: 0 0 8px var(--error);
    }
    .dot.connected { background: var(--success); box-shadow: 0 0 8px var(--success); }
    
    .container {
      display: grid;
      grid-template-columns: 350px 1fr 300px;
      flex: 1;
      overflow: hidden;
    }
    .panel {
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      background: var(--panel);
    }
    .panel:last-child { border-right: none; }
    .panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    
    /* Traces List */
    .trace-item {
      padding: 12px;
      border-radius: 8px;
      background: rgba(255,255,255,.03);
      border: 1px solid var(--line);
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .trace-item:hover, .trace-item.active {
      background: rgba(96,165,250,.1);
      border-color: var(--accent);
    }
    .trace-id { font-family: monospace; font-size: 12px; color: var(--accent); }
    
    /* Log View */
    .log-line {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      line-height: 1.5;
      padding: 4px 0;
      border-bottom: 1px dashed rgba(255,255,255,.05);
      word-wrap: break-word;
    }
    .log-meta { color: var(--muted); font-size: 11px; margin-right: 8px; user-select: none; }
    .log-chunk { color: #d8e2ec; }
    .log-sys { color: var(--success); }
    
    /* Stats */
    .stat-box {
      background: rgba(255,255,255,.02);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .stat-value { font-size: 24px; font-weight: 600; margin-top: 8px; font-family: monospace;}
  </style>
</head>
<body>
  <header>
    <div style="font-weight: 600; font-size: 18px;">⚡️ StarkHarness Inspector</div>
    <div class="status">
      <div id="conn-dot" class="dot"></div>
      <span id="conn-text">Disconnected</span>
    </div>
  </header>
  
  <div class="container">
    <aside class="panel">
      <div class="panel-header">Active Traces</div>
      <div class="panel-content" id="trace-list">
        <!-- Traces populated here -->
      </div>
    </aside>
    
    <main class="panel">
      <div class="panel-header">Live Output Stream</div>
      <div class="panel-content" id="log-view">
        <!-- Logs populated here -->
      </div>
    </main>

    <aside class="panel">
      <div class="panel-header">Resource Monitor</div>
      <div class="panel-content">
        <div class="stat-box">
          <div class="log-meta">TOTAL TOKENS</div>
          <div class="stat-value" id="stat-tokens">0</div>
        </div>
        <div class="stat-box">
          <div class="log-meta">COMPLETED TURNS</div>
          <div class="stat-value" id="stat-turns">0</div>
        </div>
        <div class="stat-box" style="margin-top: 24px; border-color: var(--accent);">
          <div class="log-meta" style="color: var(--accent)">FILTERS</div>
          <div style="margin-top: 12px; font-size: 13px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="filter-chunks" checked> Show Text Chunks
            </label>
          </div>
        </div>
      </div>
    </aside>
  </div>

  <script>
    const WS_URL = '${wsUrl}';
    let ws = null;
    const state = {
      traces: new Map(),
      activeTraceId: null,
      stats: { tokens: 0, turns: 0 }
    };

    const els = {
      dot: document.getElementById('conn-dot'),
      text: document.getElementById('conn-text'),
      traceList: document.getElementById('trace-list'),
      logView: document.getElementById('log-view'),
      tokens: document.getElementById('stat-tokens'),
      turns: document.getElementById('stat-turns'),
      filterChunks: document.getElementById('filter-chunks')
    };

    function updateStats() {
      els.tokens.textContent = state.stats.tokens.toLocaleString();
      els.turns.textContent = state.stats.turns.toLocaleString();
    }

    function appendLog(msg, type = 'chunk') {
      if (type === 'chunk' && !els.filterChunks.checked) return;
      
      const div = document.createElement('div');
      div.className = 'log-line';
      const time = new Date().toLocaleTimeString();
      
      let content = msg;
      if (typeof msg === 'object') content = JSON.stringify(msg);
      
      div.innerHTML = \`<span class="log-meta">[\${time}]</span> <span class="\${type === 'sys' ? 'log-sys' : 'log-chunk'}">\${escapeHtml(content)}</span>\`;
      els.logView.appendChild(div);
      els.logView.scrollTop = els.logView.scrollHeight;
    }

    function renderTraces() {
      els.traceList.innerHTML = '';
      const traces = Array.from(state.traces.values()).reverse();
      
      for (const t of traces) {
        const div = document.createElement('div');
        div.className = 'trace-item ' + (state.activeTraceId === t.id ? 'active' : '');
        div.innerHTML = \`
          <div class="trace-id">\${t.id || 'Anonymous Run'}</div>
          <div style="font-size:12px; margin-top:4px; color:#d8e2ec;">\${t.preview}</div>
          <div class="log-meta" style="margin-top:8px;">Status: \${t.status}</div>
        \`;
        div.onclick = () => {
          state.activeTraceId = t.id;
          renderTraces();
          // In a real app, clicking would filter logs. For now we just highlight.
          ws.send(JSON.stringify({ type: 'subscribe', topics: ['runs'], filters: { traceId: t.id } }));
          els.logView.innerHTML = '';
          appendLog(\`Switched filter to trace: \${t.id}\`, 'sys');
        };
        els.traceList.appendChild(div);
      }
    }

    function connect() {
      // Handle token from URL if present
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const finalUrl = token ? \`\${WS_URL}?token=\${token}\` : WS_URL;

      ws = new WebSocket(finalUrl);
      
      ws.onopen = () => {
        els.dot.className = 'dot connected';
        els.text.textContent = 'Connected (Live)';
        appendLog('WebSocket connected successfully.', 'sys');
        // Subscribe to everything by default
        ws.send(JSON.stringify({ type: 'subscribe', topics: ['runs'] }));
      };
      
      ws.onclose = () => {
        els.dot.className = 'dot';
        els.text.textContent = 'Disconnected - Retrying...';
        setTimeout(connect, 3000);
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        
        if (data.type === 'chunk') {
          appendLog(data.chunk, 'chunk');
          
          // Upsert trace
          if (data.requestId && !state.traces.has(data.requestId)) {
            state.traces.set(data.requestId, { id: data.traceId || data.requestId, preview: data.chunk.slice(0, 40) + '...', status: 'Running' });
            renderTraces();
          }
        } 
        else if (data.type === 'complete') {
          appendLog(\`Turn Completed. Stop Reason: \${data.stopReason}\`, 'sys');
          if (data.usage) {
            state.stats.tokens += (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0);
          }
          state.stats.turns += data.turns || 0;
          updateStats();
          
          if (data.requestId && state.traces.has(data.requestId)) {
            state.traces.get(data.requestId).status = 'Completed';
            renderTraces();
          }
        }
        else {
          appendLog(\`Event: \${data.type}\`, 'sys');
        }
      };
    }

    function escapeHtml(unsafe) {
      return (unsafe || '').toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    // Start
    connect();
  </script>
</body>
</html>`;
}
