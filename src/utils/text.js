export function tokenizeForStreaming(text) {
  return String(text).split(/(\s+)/).filter(Boolean);
}
