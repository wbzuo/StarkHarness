import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function createReplBlueprint() {
  return {
    mode: 'readline',
    status: 'ready',
  };
}

export async function startRepl(runtime) {
  const rl = readline.createInterface({ input, output, historySize: 200 });
  const transcript = [];
  try {
    while (true) {
      const line = (await rl.question('stark> ')).trim();
      if (!line) continue;
      if (line === 'exit' || line === 'quit') break;
      let result;
      if (line.startsWith('/')) {
        const [command, ...rest] = line.slice(1).split(' ');
        result = await runtime.dispatchCommand(command, { prompt: rest.join(' '), agent: rest[0], id: rest[0] });
      } else {
        result = await runtime.run(line);
      }
      transcript.push({ line, result });
      output.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } finally {
    rl.close();
  }
  return transcript;
}
