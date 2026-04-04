#!/usr/bin/env node
import { createRuntime, createBlueprintDocument } from './kernel/runtime.js';
import { runHarnessTurn } from './kernel/loop.js';

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'blueprint';
  const runtime = createRuntime({
    session: { goal: 'bootstrap StarkHarness', mode: 'interactive' },
  });

  switch (command) {
    case 'blueprint': {
      console.log(JSON.stringify(createBlueprintDocument(runtime), null, 2));
      return;
    }
    case 'doctor': {
      const report = {
        ok: true,
        providers: runtime.providers.list().length,
        tools: runtime.tools.list().length,
        commands: runtime.commands.length,
        capabilityDomains: Object.keys(runtime.capabilities).length,
      };
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    case 'run': {
      const result = await runHarnessTurn(runtime, {
        tool: 'read_file',
        input: { path: 'README.md' },
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main();
