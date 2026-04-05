import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { tokenizeForStreaming } from '../utils/text.js';

export { tokenizeForStreaming } from '../utils/text.js';

export function createReplBlueprint() {
  return {
    mode: 'readline',
    status: 'ready',
  };
}

export async function streamText(outputStream, text) {
  for (const token of tokenizeForStreaming(text)) {
    outputStream.write(token);
    await Promise.resolve();
  }
  outputStream.write('\n');
}

function formatResult(result) {
  if (typeof result?.finalText === 'string' && result.finalText) return result.finalText;
  return JSON.stringify(result, null, 2);
}

export async function startRepl(runtime) {
  const rl = readline.createInterface({ input, output, historySize: 200 });
  const transcript = [];
  try {
    while (true) {
      const line = (await rl.question('stark> ')).trim();
      if (!line) continue;
      if (line === 'exit' || line === 'quit') break;
      try {
        let result;
        let streamed = false;
        if (line.startsWith('/')) {
          const [command, ...rest] = line.slice(1).split(' ');
          result = await runtime.dispatchCommand(command, { prompt: rest.join(' '), agent: rest[0], id: rest[0] });
        } else {
          output.write('…thinking\n');
          result = await runtime.run(line, {
            onTextChunk(chunk) {
              streamed = true;
              output.write(chunk);
            },
          });
        }
        transcript.push({ line, result });
        if (typeof result?.finalText === 'string' && result.finalText) {
          if (streamed) output.write('\n');
          else await streamText(output, result.finalText);
        } else {
          output.write(`${formatResult(result)}\n`);
        }
      } catch (error) {
        output.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  } finally {
    rl.close();
  }
  return transcript;
}
