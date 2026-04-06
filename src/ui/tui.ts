import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function clearScreen(outputStream) {
  outputStream.write('\x1bc');
}

function renderPanel(title, body) {
  return `== ${title} ==\n${body}`;
}

function renderLine(label, value) {
  return `${label.padEnd(14)} ${value}`;
}

function formatFlagSet(flags = {}) {
  const entries = Object.entries(flags);
  if (entries.length === 0) return 'none';
  return entries.map(([name, enabled]) => `${name}:${enabled ? 'on' : 'off'}`).join(' | ');
}

function formatProviderSet(providers = {}) {
  const entries = Object.entries(providers);
  if (entries.length === 0) return 'none';
  return entries.map(([name, enabled]) => `${name}:${enabled ? 'ready' : 'off'}`).join(' | ');
}

function formatRemote(status = {}) {
  const remoteUrl = status.remoteBridge?.url ?? status.bridge?.remoteUrl ?? status.bridge?.remoteBridgeUrl ?? null;
  if (!remoteUrl) return 'disabled';
  const mode = status.remoteBridge?.mode ?? 'configured';
  const connected = status.remoteBridge?.connected === true ? 'connected' : 'idle';
  return `${mode}:${connected} ${remoteUrl}`;
}

function formatSwarms(swarms = []) {
  if (!Array.isArray(swarms) || swarms.length === 0) return 'none';
  return swarms.map((swarm) => swarm.id ?? swarm.sessionName ?? 'swarm').join(', ');
}

function formatFileCache(fileCache) {
  if (!fileCache) return 'not initialized';
  const hits = Number(fileCache.hits ?? 0);
  const misses = Number(fileCache.misses ?? 0);
  const entries = Number(fileCache.entries ?? fileCache.files ?? 0);
  return `entries:${entries} | hits:${hits} | misses:${misses}`;
}

function createSection(title, lines) {
  return renderPanel(title, lines.join('\n'));
}

export function renderTuiDashboard(status = {}) {
  const session = status.session ?? {};
  const counts = status.counts ?? {};
  const workers = status.workers ?? {};
  const bridge = status.bridge ?? {};
  const voice = status.voice ?? {};
  const webAccess = status.webAccess ?? {};
  const lines = [
    'StarkHarness TUI',
    '================================================================',
    '',
    createSection('Overview', [
      renderLine('Session', session.id ?? '-'),
      renderLine('Mode', session.mode ?? '-'),
      renderLine('Goal', session.goal ?? '-'),
      renderLine('CWD', session.cwd ?? '-'),
    ]),
    '',
    createSection('Counts', [
      renderLine('Commands', String(counts.commands ?? 0)),
      renderLine('Tools', String(counts.tools ?? 0)),
      renderLine('Agents', String(counts.agents ?? 0)),
      renderLine('Tasks', String(counts.tasks ?? 0)),
      renderLine('Plugins', String(counts.plugins ?? 0)),
    ]),
    '',
    createSection('Runtime Surface', [
      renderLine('Providers', formatProviderSet(status.providers ?? {})),
      renderLine('Features', formatFlagSet(status.features ?? {})),
      renderLine('Voice / Web', `voice:${voice.ready ? 'ready' : 'idle'} | web:${webAccess.ready ? 'ready' : 'idle'}`),
      renderLine('File Cache', formatFileCache(status.fileCache)),
    ]),
    '',
    createSection('Bridge and Remote', [
      renderLine('Bridge', `${bridge.host ?? '127.0.0.1'}:${bridge.port ?? '-'} | auth:${bridge.authToken ? 'token' : 'open'}`),
      renderLine('Remote', formatRemote(status)),
      renderLine('Workers', `active:${workers.active ?? 0} | queued:${workers.queuedMessages ?? 0} | pending:${workers.pendingResponses ?? 0}`),
      renderLine('Swarms', formatSwarms(status.swarms ?? [])),
    ]),
    '',
    createSection('Visual Notes', [
      renderLine('Inspector', 'Open /inspect in the bridge UI for trace-level browser monitoring'),
      renderLine('Commands', ':status | :doctor | :registry | :clear | :help | :quit'),
    ]),
    '',
    'Prompt Mode',
    '  Enter any non-command line to run it as a prompt against the active runtime.',
  ];

  return lines.join('\n');
}

export const renderTuiFrame = renderTuiDashboard;

export async function startTui(runtime, { inputStream = input, outputStream = output } = {}) {
  const rl = readline.createInterface({ input: inputStream, output: outputStream, historySize: 200 });
  const transcript = [];

  async function refresh() {
    const status = await runtime.dispatchCommand('status');
    clearScreen(outputStream);
    outputStream.write(`${renderTuiDashboard(status)}\n\n`);
  }

  try {
    await refresh();
    while (true) {
      const line = (await rl.question('tui> ')).trim();
      if (!line) continue;
      if (line === ':quit' || line === 'quit' || line === 'exit') break;

      let result;
      if (line === ':status') {
        await refresh();
        continue;
      }
      if (line === ':clear') {
        await refresh();
        continue;
      }
      if (line === ':help') {
        outputStream.write('Commands: :status, :doctor, :registry, :clear, :help, :quit\n\n');
        continue;
      }
      if (line === ':doctor') {
        result = await runtime.dispatchCommand('doctor');
      } else if (line === ':registry') {
        result = await runtime.dispatchCommand('registry');
      } else {
        result = await runtime.run(line);
      }

      transcript.push({ line, result });
      outputStream.write(`${typeof result?.finalText === 'string' && result.finalText ? result.finalText : JSON.stringify(result, null, 2)}\n\n`);
    }
  } finally {
    rl.close();
    inputStream.pause?.();
  }

  return transcript;
}
