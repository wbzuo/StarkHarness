import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validatePluginManifest } from './loader.js';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeLocalHeader(nameBuffer, dataBuffer) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc32(dataBuffer), 14);
  header.writeUInt32LE(dataBuffer.length, 18);
  header.writeUInt32LE(dataBuffer.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function makeCentralHeader(nameBuffer, dataBuffer, localOffset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(crc32(dataBuffer), 16);
  header.writeUInt32LE(dataBuffer.length, 20);
  header.writeUInt32LE(dataBuffer.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(localOffset, 42);
  return header;
}

function makeEocd(entryCount, centralSize, centralOffset) {
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(EOCD_SIGNATURE, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(entryCount, 8);
  footer.writeUInt16LE(entryCount, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  footer.writeUInt16LE(0, 20);
  return footer;
}

function findEocd(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function parseZipEntries(buffer) {
  const eocdOffset = findEocd(buffer);
  if (eocdOffset === -1) throw new Error('invalid-dxt-package:eocd-not-found');
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error('invalid-dxt-package:central-directory-corrupt');
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString('utf8');
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const compressionMethod = buffer.readUInt16LE(offset + 10);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const content = buffer.slice(dataOffset, dataOffset + compressedSize);

    entries.push({
      name,
      compressionMethod,
      size: compressedSize,
      content,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

export async function packagePluginAsDxt({ manifestPath, outputPath, include = [] } = {}) {
  if (!manifestPath) throw new Error('manifestPath is required');
  const manifestContent = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  validatePluginManifest(manifest);

  const baseDir = path.dirname(manifestPath);
  const entries = [{
    name: 'plugin.json',
    data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
  }];

  for (const file of include) {
    const absolute = path.resolve(baseDir, file);
    const data = await readFile(absolute);
    entries.push({
      name: file.split(path.sep).join('/'),
      data,
    });
  }

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const localHeader = makeLocalHeader(nameBuffer, entry.data);
    localParts.push(localHeader, nameBuffer, entry.data);
    centralParts.push(makeCentralHeader(nameBuffer, entry.data, localOffset), nameBuffer);
    localOffset += localHeader.length + nameBuffer.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const archive = Buffer.concat([
    ...localParts,
    centralDirectory,
    makeEocd(entries.length, centralDirectory.length, localOffset),
  ]);

  const target = path.resolve(outputPath ?? path.join(baseDir, `${manifest.name}.dxt`));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, archive);
  return {
    ok: true,
    filePath: target,
    entries: entries.map((entry) => entry.name),
    manifest,
  };
}

export async function validateDxtPackage(input) {
  const filePath = typeof input === 'string' ? input : input?.packagePath ?? input?.filePath;
  const buffer = await readFile(filePath);
  const entries = parseZipEntries(buffer);
  const pluginEntry = entries.find((entry) => entry.name === 'plugin.json');
  if (!pluginEntry) throw new Error('invalid-dxt-package:plugin-json-missing');
  if (pluginEntry.compressionMethod !== 0) {
    throw new Error('invalid-dxt-package:unsupported-compression');
  }
  const manifest = JSON.parse(pluginEntry.content.toString('utf8'));
  validatePluginManifest(manifest);
  return {
    ok: true,
    manifest,
    entries: entries.map(({ name, size, compressionMethod }) => ({ name, size, compressionMethod })),
  };
}

export async function installDxtPackage({ filePath, packagePath, targetDir, pluginsDir } = {}) {
  const validated = await validateDxtPackage(packagePath ?? filePath);
  const manifestPath = path.join(path.resolve(targetDir ?? pluginsDir ?? process.cwd()), `${validated.manifest.name}.json`);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(validated.manifest, null, 2), 'utf8');
  return {
    ok: true,
    manifest: validated.manifest,
    manifestPath,
    entries: validated.entries,
  };
}
