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

export async function startRepl(runtime, { json = false, outputStream = output } = {}) {
  const rl = readline.createInterface({ input, output: json ? process.stderr : outputStream, historySize: 200 });
  const transcript = [];
  const prompt = json ? '' : 'stark> ';

  if (!runtime.requestPermission && !json) {
    runtime.requestPermission = async ({ toolName, capability, toolInput, gate }) => {
      const summary = toolName === 'shell'
        ? (toolInput?.command ?? '')
        : (toolInput?.path ?? toolInput?.file ?? JSON.stringify(toolInput ?? {}));
      const answer = (await rl.question(`Permission required for ${toolName} (${capability})\nReason: ${gate.reason ?? gate.source ?? 'policy'}\nInput: ${summary}\nAllow? [y/N] `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    };
  }

  function emit(line, result, error = null) {
    if (json) {
      const record = { input: line, timestamp: new Date().toISOString() };
      if (error) {
        record.error = error instanceof Error ? error.message : String(error);
      } else {
        record.output = typeof result?.finalText === 'string' ? result.finalText : result;
        if (result?.usage) record.usage = result.usage;
        if (result?.traceId) record.traceId = result.traceId;
        if (result?.turns != null) record.turns = typeof result.turns === 'number' ? result.turns : result.turns?.length;
        if (result?.stopReason) record.stopReason = result.stopReason;
        if (result?.activeSkill) record.activeSkill = result.activeSkill;
      }
      outputStream.write(JSON.stringify(record) + '\n');
    }
  }

  try {
    while (true) {
      let line;
      try {
        line = (await rl.question(prompt)).trim();
      } catch (error) {
        if (error?.code === 'ERR_USE_AFTER_CLOSE') break;
        throw error;
      }
      if (!line) continue;
      if (line === 'exit' || line === 'quit') break;
      try {
        let result;
        let streamed = false;
        if (line.startsWith('/')) {
          const [command, ...rest] = line.slice(1).split(' ');
          result = await runtime.dispatchCommand(command, { prompt: rest.join(' '), agent: rest[0], id: rest[0] });
        } else {
          if (!json) outputStream.write('…thinking\n');
          result = await runtime.run(line, {
            onTextChunk: json ? undefined : (chunk) => {
              streamed = true;
              outputStream.write(chunk);
            },
          });
        }
        transcript.push({ line, result });
        emit(line, result);
        if (!json) {
          if (typeof result?.finalText === 'string' && result.finalText) {
            if (streamed) outputStream.write('\n');
            else await streamText(outputStream, result.finalText);
          } else {
            outputStream.write(`${formatResult(result)}\n`);
          }
        }
      } catch (error) {
        emit(line, null, error);
        if (!json) {
          outputStream.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
    }
  } finally {
    rl.close();
    input.pause();
  }
  return transcript;
}
