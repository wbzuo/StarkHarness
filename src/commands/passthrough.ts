import { listSandboxProfiles } from '../permissions/profiles.js';
import { listStarterApps } from '../app/scaffold.js';
import { describeVoice } from '../voice/index.js';
import { PROVIDER_ENV_KEYS } from '../config/provider-keys.js';

function resolve(runtime, dotPath) {
  return dotPath.split('.').reduce((obj, key) => obj?.[key], runtime);
}

const PASSTHROUGH = {
  'sessions':          { desc: 'List persisted sessions',                    path: 'state.listSessions' },
  'providers':         { desc: 'List registered providers',                  path: 'providers.list' },
  'provider-config':   { desc: 'Show loaded provider configuration summary', path: 'providers.describeConfig' },
  'tasks':             { desc: 'List persisted tasks',                       path: 'tasks.list' },
  'agents':            { desc: 'List persisted agents',                      path: 'agents.list' },
  'workers':           { desc: 'List active agent inbox workers',            path: 'listWorkers' },
  'todos':             { desc: 'List persisted user-facing todos',           path: 'state.loadTodos' },
  'cron-list':         { desc: 'List persisted cron schedules',              path: 'state.loadCrons' },
  'app-status':        { desc: 'Show the currently loaded app manifest',     path: 'app', call: false },
  'resume':            { desc: 'Load the current session snapshot',          exec: (rt) => rt.state.loadSession(rt.session.id) },
  'profiles':          { desc: 'List available sandbox profiles',            fn: listSandboxProfiles },
  'starter-apps':      { desc: 'List available starter app templates',       fn: listStarterApps },
  'file-cache-status': { desc: 'Show workspace file-cache statistics',       exec: (rt) => rt.fileCache?.status?.() ?? null },
  'file-cache-clear':  { desc: 'Clear the workspace file state cache',       exec: (rt) => { rt.fileCache?.clear?.(); return rt.fileCache?.status?.() ?? null; } },
  'remote-status':     { desc: 'Show remote bridge client status',           exec: (rt) => rt.describeRemoteBridge?.() ?? null },
  'remote-connect':    { desc: 'Start the remote bridge polling client',     exec: (rt) => rt.startRemoteBridge?.() },
  'remote-disconnect': { desc: 'Stop the remote bridge polling client',      exec: (rt) => rt.stopRemoteBridge?.() },
  'remote-poll':       { desc: 'Poll the remote bridge endpoint once',       exec: (rt) => rt.pollRemoteBridge?.() },
  'voice-status':      { desc: 'Show configured voice provider status',      exec: (rt) => rt.voice ?? describeVoice(rt.env) },
  'feature-flags':     { desc: 'Show current merged feature flags',          exec: (rt) => rt.featureFlags?.getAll?.() ?? {} },
  'observability-status': { desc: 'Show enterprise observability status',    exec: (rt) => ({ observability: rt.observability?.status?.() ?? null, telemetry: rt.env?.telemetry ?? null }) },
  'mailbox':           { desc: 'Show mailbox queue diagnostics',             path: 'inbox.stats' },
  'login-status': {
    desc: 'Show provider/login readiness',
    exec: (rt) => rt.env
      ? Object.fromEntries(Object.keys(PROVIDER_ENV_KEYS).map((id) => [id, {
        configured: Boolean(rt.env.providers[id]?.apiKey),
        baseUrl: rt.env.providers[id]?.baseUrl ?? null,
        model: rt.env.providers[id]?.model ?? null,
      }]))
      : null,
  },
  'env-status': {
    desc: 'Show loaded environment configuration and feature switches',
    exec: (rt) => rt.env ? {
      filePath: rt.env.filePath ?? null,
      features: rt.env.features,
      bridge: rt.env.bridge,
      telemetry: rt.env.telemetry,
      providers: Object.fromEntries(
        Object.entries(rt.env.providers).map(([pid, p]) => [pid, {
          configured: Boolean(p.apiKey),
          baseUrl: p.baseUrl ?? null,
          model: p.model ?? null,
        }]),
      ),
    } : null,
  },
};

export function createPassthroughCommands() {
  return Object.entries(PASSTHROUGH).map(([name, def]) => ({
    name,
    description: def.desc,
    async execute(runtime) {
      if (def.fn) return def.fn();
      if (def.exec) return def.exec(runtime);
      const target = resolve(runtime, def.path);
      if (def.call === false) return target;
      return typeof target === 'function' ? target.call(resolve(runtime, def.path.split('.').slice(0, -1).join('.') || 'this')) : target;
    },
  }));
}
