#!/usr/bin/env node
import path from 'node:path';
import { createRuntime } from './kernel/runtime.js';
import { loadAppManifest } from './app/manifest.js';
import { listStarterApps, scaffoldApp } from './app/scaffold.js';
import { loadRuntimeEnv } from './config/env.js';
import { createInteractivePromptSession } from './ui/prompts.js';

function parseCommandArgs(argv) {
  const parsed = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = 'true'] = item.slice(2).split('=');
    parsed[key] = value;
  }
  return parsed;
}

async function finalizeCli(runtime, code = 0) {
  process.stdin.pause();
  await runtime.shutdown().catch(() => {});
  await new Promise((resolve) => process.stdout.write('', resolve));
  await new Promise((resolve) => process.stderr.write('', resolve));
  process.exit(code);
}

async function main(argv = process.argv.slice(2)) {
  const rawCommand = argv[0] ?? null;
  const commandArg = argv[1];
  const extraArgs = parseCommandArgs(argv.slice(1));

  if (rawCommand === 'starter-apps') {
    console.log(JSON.stringify(await listStarterApps(), null, 2));
    return;
  }

  if (rawCommand === 'init') {
    console.log(JSON.stringify(await scaffoldApp({
      targetDir: extraArgs.target ?? '.',
      template: extraArgs.template ?? 'browser-research',
      force: extraArgs.force === 'true',
    }), null, 2));
    return;
  }

  const app = await loadAppManifest({
    cwd: process.cwd(),
    appPath: extraArgs.app ?? null,
  });
  const envConfig = await loadRuntimeEnv({
    cwd: app?.rootDir ?? process.cwd(),
    envFilePath: extraArgs.env ?? app?.paths?.envPath ?? null,
  });
  const command = rawCommand ?? ((app?.startup?.mode === 'auto' || envConfig.features.autoMode) ? 'auto' : 'blueprint');

  const runtime = await createRuntime({
    session: { goal: 'bootstrap StarkHarness', mode: 'interactive', cwd: app?.rootDir ?? process.cwd() },
    resumeSessionId: command === 'resume' ? commandArg : undefined,
    app,
    envConfig,
    projectDir: app?.rootDir ?? process.cwd(),
    policyPath: extraArgs.policy ?? app?.paths?.policyPath,
    pluginManifestPath: extraArgs.plugin ?? app?.paths?.pluginManifestPath,
    sandboxProfile: extraArgs.profile,
    providerConfigPath: extraArgs.providers ?? app?.paths?.providerConfigPath,
    skillsDir: app?.paths?.skillsDir,
    commandDirs: app?.paths?.commandsDir ? [path.join(app.rootDir, '.starkharness', 'commands'), app.paths.commandsDir] : undefined,
    hookDirs: app?.paths?.hooksDir ? [path.join(app.rootDir, '.starkharness', 'hooks'), app.paths.hooksDir] : undefined,
  });
  const promptSession = process.stdin.isTTY
    && process.stdout.isTTY
    && !['repl', 'chat', 'serve', 'dev', 'pipe', 'tui'].includes(command)
    ? createInteractivePromptSession(runtime)
    : null;

  // Interactive REPL mode
  if (command === 'repl' || command === 'chat') {
    const { startRepl } = await import('./ui/repl.js');
    await startRepl(runtime, { json: extraArgs.json === 'true' });
    await finalizeCli(runtime, 0);
  }

  if (command === 'tui') {
    const { startTui } = await import('./ui/tui.js');
    await startTui(runtime);
    await finalizeCli(runtime, 0);
  }

  // HTTP/WebSocket server mode
  if (command === 'serve' || command === 'dev') {
    const { createHttpBridge } = await import('./bridge/http.js');
    const port = Number(extraArgs.port ?? app?.startup?.port ?? envConfig.bridge.port ?? 3000);
    const host = extraArgs.host ?? app?.startup?.host ?? envConfig.bridge.host ?? '127.0.0.1';
    const authToken = extraArgs.token ?? envConfig.bridge.authToken ?? null;
    const bridge = await createHttpBridge(runtime, {
      port,
      host,
      authToken,
      tokenProfiles: envConfig.bridge.tokenProfiles,
    });
    console.log(`StarkHarness server listening on ${bridge.url}`);
    if (app) {
      console.log(`App: ${app.name} (${app.manifestPath})`);
    }
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

  if (command === 'auto') {
    let stdin = '';
    if (!process.stdin.isTTY) {
      for await (const chunk of process.stdin) stdin += chunk;
    }
    const result = await runtime.dispatchCommand('auto', {
      ...extraArgs,
      stdin: stdin.trim(),
    });
    console.log(JSON.stringify(result, null, 2));
    await finalizeCli(runtime, 0);
  }

  // Pipe mode: read prompt from stdin
  if (command === 'pipe') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const result = await runtime.run(input.trim());
    console.log(JSON.stringify(result, null, extraArgs.pretty === 'true' ? 2 : undefined));
    await finalizeCli(runtime, 0);
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
  } finally {
    promptSession?.close();
    await finalizeCli(runtime, process.exitCode ?? 0);
  }
}

main();
