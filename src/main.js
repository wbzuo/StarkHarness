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
    providerConfigPath: extraArgs.providers,
  });

  // Interactive REPL mode
  if (command === 'repl' || command === 'chat') {
    const { startRepl } = await import('./ui/repl.js');
    await startRepl(runtime, { json: extraArgs.json === 'true' });
    await runtime.shutdown();
    return;
  }

  // HTTP/WebSocket server mode
  if (command === 'serve') {
    const { createHttpBridge } = await import('./bridge/http.js');
    const port = Number(extraArgs.port ?? 3000);
    const bridge = await createHttpBridge(runtime, { port });
    console.log(`StarkHarness server listening on ${bridge.url}`);
    console.log(`WebSocket: ${bridge.wsUrl}`);
    console.log(`POST /run { "prompt": "..." } to chat`);
    console.log(`POST /stream { "prompt": "..." } for SSE streaming`);
    console.log(`GET /health, /session, /providers, /tools, /agents, /tasks, /traces`);
    process.on('SIGINT', async () => {
      await bridge.close();
      await runtime.shutdown();
      process.exit(0);
    });
    return;
  }

  // Pipe mode: read prompt from stdin
  if (command === 'pipe') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const result = await runtime.run(input.trim());
    console.log(JSON.stringify(result, null, extraArgs.pretty === 'true' ? 2 : undefined));
    await runtime.shutdown();
    return;
  }

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
