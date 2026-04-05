// Demonstrates registering a PreToolUse hook that guards shell commands
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'hook demo' },
  permissions: { exec: 'allow' },
  hooks: {
    PreToolUse: {
      matcher: 'shell',
      handler: async ({ toolInput }) => {
        console.log(`[hook] Shell command requested: ${toolInput.command}`);
        if (toolInput.command.includes('rm')) {
          console.log('[hook] Blocked dangerous command');
          return { decision: 'deny', reason: 'rm commands blocked' };
        }
        return { decision: 'allow' };
      },
    },
  },
});

// This will succeed
const ok = await runHarnessTurn(runtime, { tool: 'shell', input: { command: 'echo hello' } });
console.log('echo result:', ok.ok, ok.stdout?.trim());

// This will be denied by the hook
const denied = await runHarnessTurn(runtime, { tool: 'shell', input: { command: 'rm -rf /tmp/test' } });
console.log('rm result:', denied.ok, denied.reason);
