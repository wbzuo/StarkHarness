# Web Search

Web search in StarkHarness currently spans two layers:

1. simple network access through `fetch_url`
2. browser-aware web access through the bundled `web-access` integration

## Browser-Oriented Web Tooling

Built-in tools:

- `browser_targets`
- `browser_open`
- `browser_eval`
- `browser_click`
- `browser_scroll`
- `browser_screenshot`
- `browser_close`
- `web_site_context`

These tools are intended for:

- browser-backed page inspection
- CDP-based navigation
- site-specific guidance lookup

## Current Limitation

Higher-level search strategy is still evolving. V2 provides the primitives and the bundled `web-access` skill, but not yet a full policy engine that automatically chooses between static fetch, search, and browser interaction in every case.
