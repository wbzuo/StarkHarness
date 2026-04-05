import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MANIFEST = 'starkharness.app.json';

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveMaybe(rootDir, maybePath) {
  if (!maybePath) return null;
  return path.resolve(rootDir, maybePath);
}

async function resolveIfExists(rootDir, maybePath) {
  const resolved = resolveMaybe(rootDir, maybePath);
  return resolved && await exists(resolved) ? resolved : null;
}

export async function resolveAppManifestPath({ cwd = process.cwd(), appPath = null } = {}) {
  const candidate = appPath ? path.resolve(cwd, appPath) : path.join(cwd, DEFAULT_MANIFEST);
  return await exists(candidate) ? candidate : null;
}

export async function loadAppManifest({ cwd = process.cwd(), appPath = null } = {}) {
  const manifestPath = await resolveAppManifestPath({ cwd, appPath });
  if (!manifestPath) return null;

  const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  const rootDir = path.dirname(manifestPath);
  const paths = raw.paths ?? {};

  return {
    name: raw.name ?? path.basename(rootDir),
    description: raw.description ?? '',
    version: raw.version ?? '0.1.0',
    rootDir,
    manifestPath,
    startup: {
      mode: raw.startup?.mode ?? 'serve',
      port: Number(raw.startup?.port ?? 3000),
      host: raw.startup?.host ?? '127.0.0.1',
    },
    automation: {
      defaultPrompt: raw.automation?.defaultPrompt ?? '',
      defaultCommand: raw.automation?.defaultCommand ?? '',
      streamOutput: raw.automation?.streamOutput !== false,
    },
    features: {
      webAccess: raw.features?.webAccess !== false,
    },
    paths: {
      commandsDir: resolveMaybe(rootDir, paths.commandsDir ?? 'commands'),
      skillsDir: resolveMaybe(rootDir, paths.skillsDir ?? 'skills'),
      hooksDir: resolveMaybe(rootDir, paths.hooksDir ?? 'hooks'),
      policyPath: await resolveIfExists(rootDir, paths.policyPath ?? 'config/policy.json'),
      providerConfigPath: await resolveIfExists(rootDir, paths.providerConfigPath ?? 'config/providers.json'),
      pluginManifestPath: await resolveIfExists(rootDir, paths.pluginManifestPath ?? 'plugins/browser-pack.json'),
      envPath: await resolveIfExists(rootDir, paths.envPath ?? '.env'),
    },
    raw,
  };
}
