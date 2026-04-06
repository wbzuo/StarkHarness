import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function attachInteractivePrompts(runtime, rl) {
  if (!runtime.requestPermission) {
    runtime.requestPermission = async ({ toolName, capability, toolInput, gate }) => {
      const summary = toolName === 'shell'
        ? (toolInput?.command ?? '')
        : (toolInput?.path ?? toolInput?.file ?? JSON.stringify(toolInput ?? {}));
      const answer = (await rl.question(
        `Permission required for ${toolName} (${capability})\nReason: ${gate.reason ?? gate.source ?? 'policy'}\nInput: ${summary}\nAllow? [y/N] `,
      )).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    };
  }

  if (!runtime.askUserQuestion) {
    runtime.askUserQuestion = async ({ question, choices = [] }) => {
      const hint = choices.length > 0 ? `\nChoices: ${choices.join(', ')}` : '';
      const answer = await rl.question(`${question}${hint}\n> `);
      return answer.trim();
    };
  }

  return runtime;
}

export function createInteractivePromptSession(runtime, { inputStream = input, outputStream = output } = {}) {
  const rl = readline.createInterface({
    input: inputStream,
    output: outputStream,
    historySize: 0,
  });

  attachInteractivePrompts(runtime, rl);

  return {
    rl,
    close() {
      rl.close();
    },
  };
}
