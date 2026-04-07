import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  bold, dim, cyan, green, yellow, red, gray, FIGURES,
} from './theme.js';
import { formatPermissionPrompt } from './renderer.js';

export function attachInteractivePrompts(runtime, rl) {
  if (!runtime.requestPermission) {
    runtime.requestPermission = async ({ toolName, capability, toolInput, gate }) => {
      // Claude-code style permission prompt with structured display
      const display = formatPermissionPrompt({ toolName, capability, toolInput, gate });
      const stream = rl.output ?? process.stderr;
      stream.write(`\n${display}\n`);

      const answer = (await rl.question(`  ${dim('>')} `)).trim().toLowerCase();

      if (answer === 'a' || answer === 'always') {
        // Persist allow for this tool
        return 'always';
      }
      if (answer === 's' || answer === 'session') {
        return 'session';
      }
      return answer === 'y' || answer === 'yes';
    };
  }

  if (!runtime.askUserQuestion) {
    runtime.askUserQuestion = async ({ question, choices = [] }) => {
      const stream = rl.output ?? process.stderr;
      stream.write(`\n  ${cyan(FIGURES.info)} ${bold(question)}\n`);
      if (choices.length > 0) {
        for (let i = 0; i < choices.length; i += 1) {
          stream.write(`  ${dim(`${i + 1}.`)} ${choices[i]}\n`);
        }
      }
      const answer = await rl.question(`  ${dim('>')} `);
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
