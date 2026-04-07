import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  bold, dim, cyan, green, yellow, red, gray,
  FIGURES, renderBox, boldCyan, dimGray,
} from './theme.js';
import { formatStatusLine, formatError, formatHelp } from './renderer.js';

function clearScreen(outputStream) {
  outputStream.write('\x1bc');
}

function renderLine(label, value) {
  return `${dim(label.padEnd(14))} ${value}`;
}

function formatFlagSet(flags = {}) {
  const entries = Object.entries(flags);
  if (entries.length === 0) return dim('none');
  return entries.map(([name, enabled]) =>
    enabled ? green(`${name}`) : dimGray(name)
  ).join(dim(' | '));
}

function formatProviderSet(providers = {}) {
  const entries = Object.entries(providers);
  if (entries.length === 0) return dim('none');
  return entries.map(([name, enabled]) =>
    enabled ? green(`${name}${dim(':ready')}`) : dimGray(`${name}:off`)
  ).join(dim(' | '));
}

function formatRemote(status = {}) {
  const remoteUrl = status.remoteBridge?.url ?? status.bridge?.remoteUrl ?? status.bridge?.remoteBridgeUrl ?? null;
  if (!remoteUrl) return dim('disabled');
  const mode = status.remoteBridge?.mode ?? 'configured';
  const connected = status.remoteBridge?.connected === true;
  return `${connected ? green('connected') : yellow('idle')} ${dim(remoteUrl)}`;
}

function formatSwarms(swarms = []) {
  if (!Array.isArray(swarms) || swarms.length === 0) return dim('none');
  return swarms.map((swarm) => cyan(swarm.id ?? swarm.sessionName ?? 'swarm')).join(dim(', '));
}

function formatFileCache(fileCache) {
  if (!fileCache) return dim('not initialized');
  const hits = Number(fileCache.hits ?? 0);
  const misses = Number(fileCache.misses ?? 0);
  const entries = Number(fileCache.entries ?? fileCache.files ?? 0);
  return `${dim('entries:')}${entries} ${dim('|')} ${green(`hits:${hits}`)} ${dim('|')} ${dimGray(`misses:${misses}`)}`;
}

export function renderTuiDashboard(status = {}) {
  const session = status.session ?? {};
  const counts = status.counts ?? {};
  const workers = status.workers ?? {};
  const bridge = status.bridge ?? {};
  const voice = status.voice ?? {};
  const webAccess = status.webAccess ?? {};

  const lines = [
    '',
    `  ${boldCyan('StarkHarness')} ${dim('TUI Dashboard')}`,
    `  ${dim(FIGURES.line.repeat(56))}`,
    '',
    `  ${bold('Overview')}`,
    `  ${renderLine('Session', cyan(session.id ?? '-'))}`,
    `  ${renderLine('Mode', yellow(session.mode ?? '-'))}`,
    `  ${renderLine('Goal', session.goal ?? '-')}`,
    `  ${renderLine('CWD', dimGray(session.cwd ?? '-'))}`,
    '',
    `  ${bold('Counts')}`,
    `  ${renderLine('Commands', String(counts.commands ?? 0))}`,
    `  ${renderLine('Tools', String(counts.tools ?? 0))}`,
    `  ${renderLine('Agents', String(counts.agents ?? 0))}`,
    `  ${renderLine('Tasks', String(counts.tasks ?? 0))}`,
    `  ${renderLine('Plugins', String(counts.plugins ?? 0))}`,
    '',
    `  ${bold('Runtime')}`,
    `  ${renderLine('Providers', formatProviderSet(status.providers ?? {}))}`,
    `  ${renderLine('Features', formatFlagSet(status.features ?? {}))}`,
    `  ${renderLine('Voice', voice.ready ? green('ready') : dimGray('idle'))}`,
    `  ${renderLine('Web Access', webAccess.ready ? green('ready') : dimGray('idle'))}`,
    `  ${renderLine('File Cache', formatFileCache(status.fileCache))}`,
    '',
    `  ${bold('Bridge & Remote')}`,
    `  ${renderLine('Bridge', `${dim(bridge.host ?? '127.0.0.1')}:${bridge.port ?? '-'} ${dim('|')} auth:${bridge.authToken ? green('token') : dimGray('open')}`)}`,
    `  ${renderLine('Remote', formatRemote(status))}`,
    `  ${renderLine('Workers', `${dim('active:')}${workers.active ?? 0} ${dim('|')} ${dim('queued:')}${workers.queuedMessages ?? 0}`)}`,
    `  ${renderLine('Swarms', formatSwarms(status.swarms ?? []))}`,
    '',
    `  ${dim(FIGURES.line.repeat(56))}`,
    `  ${dim('Commands:')} ${cyan(':status')} ${dim('|')} ${cyan(':doctor')} ${dim('|')} ${cyan(':registry')} ${dim('|')} ${cyan(':clear')} ${dim('|')} ${cyan(':help')} ${dim('|')} ${cyan(':quit')}`,
    '',
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
    outputStream.write(renderTuiDashboard(status));
  }

  try {
    await refresh();
    while (true) {
      const line = (await rl.question(`${cyan(FIGURES.pointer)} `)).trim();
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
        outputStream.write(formatHelp());
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
