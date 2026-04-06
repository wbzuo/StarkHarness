import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const CORE_ENTRY = resolve(__dirname, '../../../../src/main.ts');

async function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input, output });
  const display = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  const answer = await rl.question(display);
  rl.close();
  return answer.trim() || defaultValue || '';
}

/**
 * Executes the StarkHarness core with the given command and arguments.
 */
function delegateToCore(command: string, args: string[] = []) {
  const nodeArgs = ['--import', 'tsx', CORE_ENTRY, command, ...args];
  
  const child = spawn('node', nodeArgs, { 
    stdio: 'inherit',
    env: { ...process.env, NODE_NO_WARNINGS: '1' }
  });

  child.on('error', (err) => {
    console.error('❌ Failed to launch core:', err.message);
  });
}

async function init() {
  console.log('\n⚡️ StarkHarness Agent OS - Initializer\n');

  const name = await ask('Project Name', 'my-stark-agent');
  const type = await ask('Architecture (ts/js)', 'ts');
  
  const targetDir = resolve(process.cwd(), name);
  console.log(`\n🚀 Scaffolding project in ${targetDir}...`);

  try {
    await mkdir(targetDir, { recursive: true });
    await mkdir(join(targetDir, 'skills'), { recursive: true });
    await mkdir(join(targetDir, 'commands'), { recursive: true });
    await mkdir(join(targetDir, '.starkharness'), { recursive: true });

    const pkg = {
      name,
      version: '0.1.0',
      type: 'module',
      scripts: {
        "start": "stark tui",
        "chat": "stark run",
        "serve": "stark serve",
        "doctor": "stark doctor"
      },
      dependencies: {
        "tsx": "^4.21.0"
      }
    };
    await writeFile(join(targetDir, 'package.json'), JSON.stringify(pkg, null, 2));

    const config = {
      name,
      type,
      features: { mcp: true, multiAgent: true, tui: true },
      createdAt: new Date().toISOString()
    };
    await writeFile(join(targetDir, 'stark.config.json'), JSON.stringify(config, null, 2));
    await writeFile(join(targetDir, '.env'), 'ANTHROPIC_API_KEY=your_key_here\n');

    console.log('\n✅ Project created successfully!');
    console.log(`\nNext steps:\n  cd ${name}\n  stark tui\n`);

  } catch (error) {
    console.error('❌ Failed:', error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  const command = process.argv[2];
  const remainingArgs = process.argv.slice(3);

  switch (command) {
    case 'init':
      await init();
      break;
    case 'run':
    case 'chat':
      const prompt = remainingArgs[0] && !remainingArgs[0].startsWith('--') 
        ? [`--prompt=${remainingArgs[0]}`] 
        : remainingArgs;
      delegateToCore('run', prompt);
      break;
    case 'tui':
      console.log('🖥  Launching StarkHarness TUI...');
      delegateToCore('tui', remainingArgs);
      break;
    case 'serve':
    case 'dev':
      console.log('🌐 Starting StarkHarness Bridge...');
      delegateToCore('serve', remainingArgs);
      break;
    case 'inspect':
      console.log('👀 Starting Web Inspector...');
      delegateToCore('serve', remainingArgs);
      console.log('Open your browser at: http://127.0.0.1:3000/inspect');
      break;
    case 'doctor':
      delegateToCore('doctor', remainingArgs);
      break;
    case 'registry':
      delegateToCore('registry', remainingArgs);
      break;
    case 'sessions':
      delegateToCore('sessions', remainingArgs);
      break;
    case 'playback':
      delegateToCore('playback', remainingArgs);
      break;
    case 'replay':
      delegateToCore('replay-runner', remainingArgs);
      break;
    case 'providers':
      delegateToCore('providers', remainingArgs);
      break;
    case 'version':
      console.log('StarkHarness CLI v0.1.0 (Enterprise Codex)');
      break;
    default:
      console.log('\n⚡️ StarkHarness CLI');
      console.log('Usage: stark <command> [options]\n');
      console.log('Commands:');
      console.log('  init              Initialize a new agent project');
      console.log('  tui               Launch the full Terminal UI');
      console.log('  run [prompt]      Execute an agent turn (alias: chat)');
      console.log('  serve             Start the HTTP/WebSocket bridge');
      console.log('  inspect           Start the bridge and open Web Inspector');
      console.log('  sessions          List all persisted agent sessions');
      // Added new pro commands to help
      console.log('  playback          Summarize recent transcript events');
      console.log('  replay            Run the deterministic replay engine');
      console.log('  providers         Check model provider status');
      console.log('  doctor            Perform system health check');
      console.log('  registry          Show all registered tools and plugins');
      console.log('  version           Show CLI version\n');
      console.log('Options:');
      console.log('  --port=3000       Port for the bridge server');
      console.log('  --token=xyz       Auth token for security');
      console.log('  --json=true       Machine-readable output\n');
  }
}

main().catch(console.error);
