#!/usr/bin/env node
import { createRuntime } from './kernel/runtime.js';

function parseCommandArgs(argv) {
  const parsed = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = 'true'] = item.slice(2).split('=');
    parsed[key] = value;
  }
  return parsed;
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'blueprint';
  const commandArg = argv[1];
  const extraArgs = parseCommandArgs(argv.slice(1));

  const runtime = await createRuntime({
    session: { goal: 'bootstrap StarkHarness', mode: 'interactive' },
    resumeSessionId: command === 'resume' ? commandArg : undefined,
    policyPath: extraArgs.policy,
    pluginManifestPath: extraArgs.plugin,
    sandboxProfile: extraArgs.profile,
  });

  try {
    const commandName = command === 'resume' ? 'resume' : command;
    const result = await runtime.dispatchCommand(commandName, {
      ...extraArgs,
      provider: extraArgs.provider,
      prompt: extraArgs.prompt,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
