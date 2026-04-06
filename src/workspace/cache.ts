import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.starkharness') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) results.push(...(await walkFiles(fullPath)));
    else results.push(fullPath);
  }
  return results;
}

export class FileStateCache {
  #files = new Map();
  #listings = new Map();
  #stats = {
    fileHits: 0,
    fileMisses: 0,
    listingHits: 0,
    listingMisses: 0,
    writes: 0,
    invalidations: 0,
    revision: 0,
  };

  async readText(filePath) {
    const absolute = path.resolve(filePath);
    const metadata = await stat(absolute);
    const current = this.#files.get(absolute);
    if (current && current.mtimeMs === metadata.mtimeMs && current.size === metadata.size) {
      this.#stats.fileHits += 1;
      return current.content;
    }

    const content = await readFile(absolute, 'utf8');
    this.#files.set(absolute, {
      content,
      mtimeMs: metadata.mtimeMs,
      size: metadata.size,
      updatedAt: new Date().toISOString(),
    });
    this.#stats.fileMisses += 1;
    return content;
  }

  async writeText(filePath, content) {
    const absolute = path.resolve(filePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
    const metadata = await stat(absolute);
    this.#files.set(absolute, {
      content,
      mtimeMs: metadata.mtimeMs,
      size: metadata.size,
      updatedAt: new Date().toISOString(),
    });
    this.#stats.writes += 1;
    this.invalidatePath(absolute);
    return absolute;
  }

  invalidatePath(filePath) {
    const absolute = path.resolve(filePath);
    this.#files.delete(absolute);
    this.#listings.clear();
    this.#stats.invalidations += 1;
    this.#stats.revision += 1;
  }

  async listFiles(rootDir) {
    const absolute = path.resolve(rootDir);
    const key = `${absolute}:${this.#stats.revision}`;
    const current = this.#listings.get(key);
    if (current) {
      this.#stats.listingHits += 1;
      return [...current];
    }

    const files = await walkFiles(absolute);
    this.#listings.clear();
    this.#listings.set(key, files);
    this.#stats.listingMisses += 1;
    return [...files];
  }

  clear() {
    this.#files.clear();
    this.#listings.clear();
    this.#stats.revision += 1;
    this.#stats.invalidations += 1;
  }

  status() {
    return {
      ...this.#stats,
      cachedFiles: this.#files.size,
      cachedListings: this.#listings.size,
    };
  }
}
