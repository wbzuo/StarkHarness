import path from 'node:path';

export function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegExp(pattern) {
  const normalized = normalizePathForMatch(pattern);
  let regex = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      regex += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      regex += '[^/]*';
      continue;
    }
    if (char === '?') {
      regex += '[^/]';
      continue;
    }
    regex += escapeRegex(char);
  }
  regex += '$';
  return new RegExp(regex);
}

export function normalizePathForMatch(filePath) {
  return filePath.split(path.sep).join('/');
}

export function matchesGlob(filePath, pattern, cwd) {
  if (!pattern) return true;
  const relative = normalizePathForMatch(path.relative(cwd, filePath));
  const base = normalizePathForMatch(path.basename(filePath));
  const regex = globToRegExp(pattern);
  return regex.test(relative) || (!pattern.includes('/') && regex.test(base));
}
