import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function clearScreen(outputStream) {
  outputStream.write('\x1bc');
}

function renderPanel(title, body) {
  return `== ${title} ==\n${body}`;
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

export function renderTuiDashboard(status) {
  return [
    'StarkHarness TUI',
    '',
    renderPanel('Session', formatJson(status.session ?? {})),
    '',
    renderPanel('Counts', formatJson(status.counts ?? {})),
    '',
    renderPanel('Features', formatJson(status.features ?? {})),
    '',
    renderPanel('Bridge', formatJson(status.bridge ?? {})),
    '',
    renderPanel('Voice / Web', formatJson({
      voice: status.voice ?? null,
      webAccess: status.webAccess ?? null,
    })),
    '',
    'Commands:',
    '  :status          refresh dashboard',
    '  :doctor          run doctor',
    '  :registry        run registry',
    '  :quit            exit',
    '  anything else    run as a prompt',
  ].join('\n');
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
