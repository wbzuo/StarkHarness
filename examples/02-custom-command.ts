// Demonstrates registering a custom command at runtime
import { createRuntime } from '../src/kernel/runtime.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'command demo' },
});

// Register a custom command
runtime.commands.register({
  name: 'greet',
  description: 'Say hello',
  async execute(rt, args) {
    return { message: `Hello from session ${rt.session.id}!`, args };
  },
});

const result = await runtime.dispatchCommand('greet', { name: 'world' });
console.log(JSON.stringify(result, null, 2));
