import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { tokenizeForStreaming } from '../utils/text.js';
import { attachInteractivePrompts } from './prompts.js';
import {
  bold, dim, cyan, green, yellow, gray,
  FIGURES, createSpinner,
} from './theme.js';
import {
  formatWelcome, formatResponseLine, formatToolUse,
  formatToolResult, formatHelp, formatError,
  formatStatusLine, renderMarkdown,
} from './renderer.js';

export { tokenizeForStreaming } from '../utils/text.js';

export function createReplBlueprint() {
  return {
    mode: 'readline',
    status: 'ready',
    tui: 'ready',
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

// Claude-code style prompt: ❯ with cyan coloring
function makePrompt(mode) {
  if (mode === 'json') return '';
  return `${cyan(FIGURES.pointer)} `;
}

function renderStreamPrefix(first) {
  return first ? `\n  ${dim(FIGURES.corner)} ` : '';
}

export async function startRepl(runtime, { json = false, outputStream = output } = {}) {
  const rl = readline.createInterface({
    input,
    output: json ? process.stderr : outputStream,
    historySize: 500,
    prompt: makePrompt(json ? 'json' : 'interactive'),
  });

  const transcript = [];
  const prompt = makePrompt(json ? 'json' : 'interactive');

  if (!json) {
    attachInteractivePrompts(runtime, rl);

    // Welcome banner (like claude-code's Logo + status display)
    const status = await runtime.dispatchCommand('status').catch(() => ({}));
    outputStream.write(formatWelcome({
      session: status?.session?.id,
      cwd: status?.session?.cwd ?? process.cwd(),
      model: status?.providers?.active ?? status?.session?.model,
      mode: status?.session?.mode ?? 'interactive',
    }));
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

  // Show status line after each turn (like claude-code's StatusLine component)
  function showStatusLine(result) {
    if (json) return;
    const parts = [];
    if (result?.usage) {
      parts.push(formatStatusLine({
        tokens: { input: result.usage.inputTokens, output: result.usage.outputTokens },
        cost: result.usage.cost,
      }));
    }
    if (parts.length > 0) {
      outputStream.write(`\n  ${parts.join('')}\n`);
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

          // Built-in UI commands
          if (command === 'help') {
            outputStream.write(formatHelp());
            continue;
          }
          if (command === 'clear') {
            outputStream.write('\x1bc');
            continue;
          }

          result = await runtime.dispatchCommand(command, { prompt: rest.join(' '), agent: rest[0], id: rest[0] });
        } else {
          // Spinner during thinking (like claude-code's Spinner component)
          const spinner = json ? null : createSpinner('Thinking');
          spinner?.start();

          let firstChunk = true;
          result = await runtime.run(line, {
            onTextChunk: json ? undefined : (chunk) => {
              if (firstChunk) {
                spinner?.stop();
                outputStream.write(renderStreamPrefix(true));
                firstChunk = false;
              }
              streamed = true;
              outputStream.write(chunk);
            },
            onToolUse: json ? undefined : (tool) => {
              spinner?.update(`Using ${tool.name}`);
            },
            onToolResult: json ? undefined : (tool) => {
              // Could show tool results inline
            },
          });

          if (!streamed) spinner?.stop();
        }

        transcript.push({ line, result });
        emit(line, result);

        if (!json) {
          if (typeof result?.finalText === 'string' && result.finalText) {
            if (streamed) {
              outputStream.write('\n');
            } else {
              // Render with ⎿ prefix and markdown
              const rendered = renderMarkdown(result.finalText);
              const lines = rendered.split('\n');
              outputStream.write('\n');
              for (const l of lines) {
                outputStream.write(formatResponseLine(l) + '\n');
              }
            }
          } else if (result != null) {
            const text = formatResult(result);
            outputStream.write(`\n${text}\n`);
          }
          showStatusLine(result);
          outputStream.write('\n');
        }
      } catch (error) {
        emit(line, null, error);
        if (!json) {
          outputStream.write(`${formatError(error)}\n\n`);
        }
      }
    }
  } finally {
    rl.close();
    input.pause();
  }
  return transcript;
}
