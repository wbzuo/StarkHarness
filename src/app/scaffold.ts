import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const starterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'starter');

const baseMappings = [
  { from: path.join(starterRoot, 'commands'), to: 'commands' },
  { from: path.join(starterRoot, 'hooks'), to: 'hooks' },
  { from: path.join(starterRoot, 'skills'), to: 'skills' },
  { from: path.join(starterRoot, 'config'), to: 'config' },
  { from: path.join(starterRoot, 'plugins'), to: 'plugins' },
  { from: path.join(starterRoot, 'memory', 'CLAUDE.md'), to: 'CLAUDE.md' },
  { from: path.join(starterRoot, 'memory', 'memory'), to: '.starkharness/memory' },
  { from: path.join(starterRoot, 'deploy', 'Dockerfile'), to: 'Dockerfile' },
  { from: path.join(starterRoot, 'deploy', 'docker-compose.yml'), to: 'docker-compose.yml' },
  { from: path.join(starterRoot, 'deploy', '.dockerignore'), to: '.dockerignore' },
  { from: path.join(starterRoot, 'deploy', '.env.example'), to: '.env.example' },
];

async function pathExists(targetPath) {
  try {
    await readdir(targetPath);
    return true;
  } catch {
    try {
      await readFile(targetPath, 'utf8');
      return true;
    } catch {
      return false;
    }
  }
}

export async function listStarterApps() {
  const appsDir = path.join(starterRoot, 'apps');
  const entries = await readdir(appsDir, { withFileTypes: true }).catch(() => []);
  const apps = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(appsDir, entry.name, 'starkharness.app.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    apps.push({
      id: entry.name,
      name: manifest.name ?? entry.name,
      description: manifest.description ?? '',
      startup: manifest.startup ?? {},
      features: manifest.features ?? {},
    });
  }
  return apps;
}

async function copyIntoTarget(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true, force: true });
}

export async function scaffoldApp({ targetDir, template = 'browser-research', force = false } = {}) {
  const resolvedTarget = path.resolve(process.cwd(), targetDir ?? '.');
  const apps = await listStarterApps();
  const selected = apps.find((app) => app.id === template);
  if (!selected) {
    throw new Error(`Unknown starter app: ${template}`);
  }

  await mkdir(resolvedTarget, { recursive: true });
  const existingEntries = await readdir(resolvedTarget).catch(() => []);
  if (existingEntries.length > 0 && force !== true) {
    throw new Error(`Target directory is not empty: ${resolvedTarget}. Re-run with force=true to overwrite starter files.`);
  }

  for (const mapping of baseMappings) {
    await copyIntoTarget(mapping.from, path.join(resolvedTarget, mapping.to));
  }

  const appTemplateDir = path.join(starterRoot, 'apps', template);
  await cp(appTemplateDir, resolvedTarget, { recursive: true, force: true });

  const manifestPath = path.join(resolvedTarget, 'starkharness.app.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.name = manifest.name ?? template;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return {
    ok: true,
    template,
    targetDir: resolvedTarget,
    manifestPath,
    files: [
      'starkharness.app.json',
      'CLAUDE.md',
      'commands/',
      'hooks/',
      'skills/',
      'config/',
      'plugins/',
      '.starkharness/memory/',
      'Dockerfile',
      'docker-compose.yml',
      '.dockerignore',
      '.env.example',
    ],
  };
}
