function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createDocsSiteHtml({ runtime }) {
  const appName = runtime.app?.name ?? 'StarkHarness';
  const docLinks = [
    { title: 'Architecture Deep Dive', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/docs/architecture-deep-dive.md' },
    { title: 'Contributor Guide', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/docs/contributor-guide.md' },
    { title: 'Roadmap', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/ROADMAP.md' },
    { title: 'Auto Mode', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/docs/auto-mode.md' },
    { title: 'Remote Control', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/docs/remote-control.md' },
    { title: 'Providers & Login', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/docs/providers-and-login.md' },
    { title: 'Web Search', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/docs/web-search.md' },
    { title: 'Debug', href: 'https://github.com/wbzuo/StarkHarness/blob/v3.0/docs/debug.md' },
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(appName)} Docs</title>
  <style>
    :root {
      --bg: #0e131a;
      --panel: #151d27;
      --panel-strong: #1d2835;
      --text: #e9eef5;
      --muted: #9db0c5;
      --line: rgba(255,255,255,.08);
      --accent: #6ee7b7;
      --accent-2: #60a5fa;
      --warn: #fbbf24;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(96,165,250,.12), transparent 26%),
        radial-gradient(circle at left, rgba(110,231,183,.10), transparent 22%),
        var(--bg);
      color: var(--text);
    }
    a { color: var(--accent-2); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .shell {
      max-width: 1320px;
      margin: 0 auto;
      padding: 32px 20px 80px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .card {
      background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 20px;
      backdrop-filter: blur(12px);
      box-shadow: 0 20px 50px rgba(0,0,0,.2);
    }
    .title {
      margin: 0 0 10px;
      font-size: 32px;
      line-height: 1.08;
    }
    .subtitle {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .taglist, .grid, .docs-grid, .metrics {
      display: grid;
      gap: 14px;
    }
    .taglist {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      margin-top: 18px;
    }
    .tag {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
      background: rgba(255,255,255,.02);
    }
    .tag b { display: block; margin-bottom: 6px; }
    .grid {
      grid-template-columns: 1.1fr .9fr;
      margin-top: 20px;
    }
    .metrics {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 16px;
    }
    .metric {
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
    }
    .metric .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .metric .value {
      margin-top: 8px;
      font-size: 24px;
      font-weight: 700;
    }
    .block-title {
      margin: 0 0 12px;
      font-size: 17px;
    }
    .surface {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .surface .mini {
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      min-height: 110px;
    }
    .surface .mini h4 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .surface .mini pre {
      margin: 0;
      color: var(--muted);
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.5;
    }
    .docs-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin-top: 12px;
    }
    .doc-link {
      padding: 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.02);
      display: block;
    }
    .playground textarea {
      width: 100%;
      min-height: 120px;
      resize: vertical;
      background: #0b1016;
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      font: inherit;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 11px 16px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: #0b1117;
      cursor: pointer;
    }
    button.secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--line);
    }
    .console {
      margin-top: 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: #081019;
      padding: 14px;
      min-height: 220px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      line-height: 1.55;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.03);
      color: var(--muted);
      font-size: 13px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--warn);
      box-shadow: 0 0 0 6px rgba(251,191,36,.12);
    }
    .dot.ok {
      background: var(--accent);
      box-shadow: 0 0 0 6px rgba(110,231,183,.12);
    }
    @media (max-width: 960px) {
      .hero, .grid { grid-template-columns: 1fr; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="card">
        <h1 class="title">${escapeHtml(appName)} Dynamic Docs</h1>
        <p class="subtitle">
          A live documentation surface for StarkHarness. This page combines docs, runtime status, app metadata,
          env configuration, web-access readiness, and a built-in run playground on top of the active bridge.
        </p>
        <div class="taglist">
          <div class="tag"><b>V2 Productize</b><span class="subtitle">Scaffold, app manifest, env config, remote control, auto mode.</span></div>
          <div class="tag"><b>Live Bridge</b><span class="subtitle">Inspect runtime state and execute prompts without leaving the browser.</span></div>
          <div class="tag"><b>Bundled Web Access</b><span class="subtitle">CDP-aware browser primitives and site-context helpers are built in.</span></div>
        </div>
        <div class="metrics">
          <div class="metric"><div class="label">Commands</div><div class="value" id="metric-commands">-</div></div>
          <div class="metric"><div class="label">Tools</div><div class="value" id="metric-tools">-</div></div>
          <div class="metric"><div class="label">Providers</div><div class="value" id="metric-providers">-</div></div>
          <div class="metric"><div class="label">Workers</div><div class="value" id="metric-workers">-</div></div>
        </div>
      </div>
      <div class="card">
        <h3 class="block-title">Runtime Status</h3>
        <div id="status-health" class="status"><span class="dot"></span><span>Checking health...</span></div>
        <div style="margin-top:12px" class="surface">
          <div class="mini"><h4>App</h4><pre id="app-card">Loading...</pre></div>
          <div class="mini"><h4>Bridge / Env</h4><pre id="env-card">Loading...</pre></div>
          <div class="mini"><h4>Web Access</h4><pre id="web-card">Loading...</pre></div>
          <div class="mini"><h4>Providers</h4><pre id="providers-card">Loading...</pre></div>
        </div>
      </div>
    </section>

    <section class="grid">
      <div class="card">
        <h3 class="block-title">Docs Hub</h3>
        <p class="subtitle">Open the detailed docs for architecture, contributor guidance, roadmap, auto mode, remote control, providers/login, web search, and debugging.</p>
        <div class="docs-grid">
          ${docLinks.map((link) => `<a class="doc-link" href="${link.href}" target="_blank" rel="noreferrer">${link.title}</a>`).join('')}
        </div>
      </div>
      <div class="card playground">
        <h3 class="block-title">Run Playground</h3>
        <p class="subtitle">Execute a prompt directly against the active runtime. The output below uses the same bridge endpoints the remote-control clients use.</p>
        <textarea id="prompt" placeholder="Ask the current app/runtime to do something..."></textarea>
        <div class="actions">
          <button id="run-btn">Run Prompt</button>
          <button id="doctor-btn" class="secondary">Fetch Doctor</button>
          <button id="registry-btn" class="secondary">Fetch Registry</button>
        </div>
        <div id="console" class="console">Ready.</div>
      </div>
    </section>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);

    async function getJson(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(url + ' -> ' + res.status);
      return res.json();
    }

    function pretty(value) {
      return JSON.stringify(value, null, 2);
    }

    function setConsole(value) {
      $('console').textContent = typeof value === 'string' ? value : pretty(value);
    }

    async function refresh() {
      try {
        const [health, app, env, web, providers, blueprint, workers] = await Promise.all([
          getJson('/health'),
          getJson('/app'),
          getJson('/env'),
          getJson('/web-access'),
          getJson('/providers'),
          getJson('/blueprint'),
          getJson('/workers'),
        ]);

        $('metric-commands').textContent = String(blueprint.commands.length);
        $('metric-tools').textContent = String(blueprint.tools.length);
        $('metric-providers').textContent = String(providers.length);
        $('metric-workers').textContent = String(workers.length);
        $('app-card').textContent = app ? pretty({ name: app.name, version: app.version, startup: app.startup }) : 'No app manifest loaded.';
        $('env-card').textContent = pretty({ envFile: env?.filePath ?? null, features: env?.features ?? {}, bridge: env?.bridge ?? {} });
        $('web-card').textContent = pretty(web);
        $('providers-card').textContent = pretty(providers);

        const status = $('status-health');
        status.innerHTML = '<span class="dot ok"></span><span>Healthy · session ' + health.sessionId + '</span>';
      } catch (error) {
        const status = $('status-health');
        status.innerHTML = '<span class="dot"></span><span>' + error.message + '</span>';
      }
    }

    $('run-btn').addEventListener('click', async () => {
      const prompt = $('prompt').value.trim();
      if (!prompt) {
        setConsole('Enter a prompt first.');
        return;
      }
      setConsole('Running...');
      try {
        const res = await fetch('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        setConsole(await res.json());
      } catch (error) {
        setConsole(error.message);
      }
    });

    $('doctor-btn').addEventListener('click', async () => setConsole(await getJson('/doctor')));
    $('registry-btn').addEventListener('click', async () => setConsole(await getJson('/registry')));

    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;
}
