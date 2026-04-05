function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function parseBingSearchResults(html) {
  const results = [];
  const blocks = [...html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)];
  for (const blockMatch of blocks) {
    const block = blockMatch[0];
    const linkMatch = block.match(/<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/<p>([\s\S]*?)<\/p>/i);
    results.push({
      title: stripTags(linkMatch[2]),
      url: decodeHtml(linkMatch[1]),
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : '',
    });
  }
  return results;
}

export async function webSearch({ query, envConfig, count } = {}) {
  const provider = envConfig?.search?.provider ?? 'bing';
  if (provider !== 'bing') {
    throw new Error(`Unsupported web search provider: ${provider}`);
  }
  const baseUrl = envConfig?.search?.baseUrl ?? 'https://www.bing.com/search';
  const limit = Number(count ?? envConfig?.search?.count ?? 8);
  const market = envConfig?.search?.market ?? 'en-US';
  const url = `${baseUrl}?q=${encodeURIComponent(query)}&count=${encodeURIComponent(String(limit))}&setlang=${encodeURIComponent(market)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StarkHarness/0.1; +https://github.com/wbzuo/StarkHarness)',
      'Accept-Language': market,
    },
  });
  const html = await response.text();
  return {
    provider,
    query,
    results: parseBingSearchResults(html).slice(0, limit),
    status: response.status,
  };
}
