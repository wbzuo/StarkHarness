// Demonstrates loading a plugin with custom tools and commands
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'plugin demo' },
  plugins: [
    {
      name: 'demo-pack',
      version: '0.1.0',
      capabilities: ['format'],
      tools: [{ name: 'format_code', capability: 'write', output: 'formatted' }],
      commands: [{ name: 'plugin:status', description: 'Plugin status', output: 'active' }],
    },
  ],
});

// Use plugin tool
const toolResult = await runHarnessTurn(runtime, { tool: 'format_code', input: { lang: 'js' } });
console.log('Plugin tool:', toolResult);

// Use plugin command
const cmdResult = await runtime.dispatchCommand('plugin:status');
console.log('Plugin command:', cmdResult);

// Show diagnostics
const plugins = await runtime.dispatchCommand('plugins');
console.log('Plugins:', JSON.stringify(plugins, null, 2));
