#!/usr/bin/env node
import { createRuntime } from './kernel/runtime.js';

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'blueprint';
  const commandArg = argv[1];

  const runtime = await createRuntime({
    session: { goal: 'bootstrap StarkHarness', mode: 'interactive' },
    resumeSessionId: command === 'resume' ? commandArg : undefined,
  });

  try {
    const commandName = command === 'resume' ? 'resume' : command;
    const result = await runtime.dispatchCommand(commandName);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
