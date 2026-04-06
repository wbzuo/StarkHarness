import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const TMUX_SWARM_PREFIXES = ['stark-', 'starkharness-'];

function quoteShell(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeTask(task) {
  if (typeof task === 'string') return { prompt: task };
  return task ?? {};
}

function buildTaskCommand(task, { cwd = process.cwd(), cliCommand = '' } = {}) {
  const normalized = normalizeTask(task);
  if (normalized.command) return normalized.command;
  if (normalized.prompt) {
    const baseCommand = cliCommand || `node --import tsx ${quoteShell(path.join(cwd, 'src', 'main.ts'))}`;
    return `${baseCommand} run --prompt=${quoteShell(normalized.prompt)}`;
  }
  return 'printf "idle pane\\n"';
}

export function buildTmuxSwarmPlan({ sessionName, id, cwd = process.cwd(), cliCommand = '', tasks = [] } = {}) {
  const resolvedSession = sessionName ?? (id ? `stark-${id}` : null);
  if (!resolvedSession) throw new Error('tmux-swarm requires id or sessionName');
  if (tasks.length === 0) throw new Error('tmux-swarm requires at least one task');
  const [first, ...rest] = tasks;
  const commands = [
    { cmd: 'tmux', args: ['new-session', '-d', '-s', resolvedSession, '-c', cwd, buildTaskCommand(first, { cwd, cliCommand })], options: { cwd } },
    ...rest.map((task) => ({ cmd: 'tmux', args: ['split-window', '-t', resolvedSession, '-d', '-c', cwd, buildTaskCommand(task, { cwd, cliCommand })], options: { cwd } })),
    { cmd: 'tmux', args: ['select-layout', '-t', resolvedSession, 'tiled'], options: { cwd } },
  ];
  if (cliCommand) {
    commands.push({ cmd: 'tmux', args: ['display-message', '-t', resolvedSession, cliCommand], options: { cwd } });
  }
  return commands;
}

export async function launchTmuxSwarm({ id, sessionName, cwd = process.cwd(), tasks = [], prompts = [], cliPath = '', exec = execFileAsync } = {}) {
  const normalizedTasks = tasks.length > 0 ? tasks : prompts.map((prompt) => ({ prompt }));
  const plan = buildTmuxSwarmPlan({ id, sessionName, cwd, cliCommand: cliPath, tasks: normalizedTasks });
  for (const step of plan) {
    await exec(step.cmd, step.args, step.options);
  }
  return {
    ok: true,
    sessionName: sessionName ?? `stark-${id}`,
    taskCount: normalizedTasks.length,
  };
}

export async function listTmuxSwarms({ exec = execFileAsync } = {}) {
  const { stdout } = await exec('tmux', ['list-sessions', '-F', '#{session_name}']).catch(() => ({ stdout: '' }));
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => TMUX_SWARM_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .map((name) => ({
      backend: 'tmux',
      sessionName: name,
      id: name.startsWith('stark-') ? name.replace(/^stark-/, '') : name.replace(/^starkharness-/, ''),
    }));
}

export async function stopTmuxSwarm(idOrOptions, maybeOptions = {}) {
  const options = typeof idOrOptions === 'object' && idOrOptions !== null
    ? idOrOptions
    : { sessionName: String(idOrOptions), ...maybeOptions };
  const { id, sessionName: rawSessionName, exec = execFileAsync } = options;
  const requested = rawSessionName ?? String(id ?? '');
  const candidates = rawSessionName
    ? [rawSessionName]
    : TMUX_SWARM_PREFIXES.some((prefix) => requested.startsWith(prefix))
      ? [requested]
      : TMUX_SWARM_PREFIXES.map((prefix) => `${prefix}${requested}`);
  let sessionName = candidates[0];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      await exec('tmux', ['kill-session', '-t', candidate]);
      sessionName = candidate;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return {
    ok: true,
    sessionName,
  };
}
