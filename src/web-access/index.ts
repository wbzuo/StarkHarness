import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const readyCache = new Map();

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWebAccessDir(cwd = process.cwd()) {
  const bundledDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'web-access');
  const candidates = [
    path.join(cwd, 'skills', 'web-access'),
    bundledDir,
  ];

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'SKILL.md'))) {
      return candidate;
    }
  }

  throw new Error('web-access skill is not available. Expected skills/web-access in the workspace or bundled with the repo.');
}

function proxyBaseUrl(env = process.env) {
  const host = env.CDP_PROXY_HOST ?? '127.0.0.1';
  const port = env.CDP_PROXY_PORT ?? '3456';
  return `http://${host}:${port}`;
}

export async function describeWebAccess({ cwd = process.cwd(), env = process.env } = {}) {
  try {
    const skillDir = await resolveWebAccessDir(cwd);
    const checkDepsScript = path.join(skillDir, 'scripts', 'check-deps.mjs');
    const cdpProxyScript = path.join(skillDir, 'scripts', 'cdp-proxy.mjs');
    const matchSiteScript = path.join(skillDir, 'scripts', 'match-site.mjs');
    return {
      available: true,
      skillDir,
      proxyUrl: proxyBaseUrl(env),
      scripts: {
        checkDeps: await pathExists(checkDepsScript),
        cdpProxy: await pathExists(cdpProxyScript),
        matchSite: await pathExists(matchSiteScript),
      },
    };
  } catch (error) {
    return {
      available: false,
      skillDir: null,
      proxyUrl: proxyBaseUrl(env),
      scripts: {
        checkDeps: false,
        cdpProxy: false,
        matchSite: false,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function ensureWebAccessReady({ cwd = process.cwd(), env = process.env } = {}) {
  const skillDir = await resolveWebAccessDir(cwd);
  const cacheKey = `${skillDir}:${env.CDP_PROXY_HOST ?? '127.0.0.1'}:${env.CDP_PROXY_PORT ?? '3456'}`;
  if (!readyCache.has(cacheKey)) {
    readyCache.set(cacheKey, (async () => {
      const scriptPath = path.join(skillDir, 'scripts', 'check-deps.mjs');
      await execFileAsync(process.execPath, [scriptPath], {
        cwd,
        env: {
          ...process.env,
          ...env,
          CLAUDE_SKILL_DIR: skillDir,
        },
      });
      return skillDir;
    })());
  }
  return readyCache.get(cacheKey);
}

export async function callWebAccessProxy(pathname, { method = 'GET', body, env = process.env } = {}) {
  const url = `${proxyBaseUrl(env)}${pathname}`;
  const init = { method, headers: {} };
  if (body !== undefined) {
    if (typeof body === 'string') {
      init.body = body;
      init.headers['Content-Type'] = 'text/plain; charset=utf-8';
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let payload = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}

  if (!response.ok) {
    throw new Error(`web-access proxy error ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }

  return {
    status: response.status,
    data: payload,
  };
}

export async function loadSiteContext(query, { cwd = process.cwd(), env = process.env } = {}) {
  const skillDir = await resolveWebAccessDir(cwd);
  const scriptPath = path.join(skillDir, 'scripts', 'match-site.mjs');
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, query], {
    cwd,
    env: {
      ...process.env,
      ...env,
      CLAUDE_SKILL_DIR: skillDir,
    },
  });
  return {
    skillDir,
    context: stdout.trim(),
  };
}

export async function getWebAccessStatus({ cwd = process.cwd(), env = process.env, ensure = false } = {}) {
  const described = await describeWebAccess({ cwd, env });
  if (!described.available || ensure !== true) {
    return {
      ...described,
      ready: false,
    };
  }

  try {
    await ensureWebAccessReady({ cwd, env });
    return {
      ...described,
      ready: true,
    };
  } catch (error) {
    return {
      ...described,
      ready: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
