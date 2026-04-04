// Demonstrates the full agent run loop (requires ANTHROPIC_API_KEY)
import { createRuntime } from '../src/kernel/runtime.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('Set ANTHROPIC_API_KEY to run this example');
  console.log('Example: ANTHROPIC_API_KEY=sk-ant-... node examples/04-agent-run.js');
  process.exit(0);
}

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'agent run demo' },
  permissions: { read: 'allow', write: 'allow' },
});

const result = await runtime.run('What files are in the src/kernel directory? List them briefly.');
console.log('Final answer:', result.finalText);
console.log('Tool turns:', result.turns.length);
console.log('Stop reason:', result.stopReason);
