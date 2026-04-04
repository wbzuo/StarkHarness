---
description: Validate a release candidate before shipping
allowed-tools: [read_file, search, glob, shell]
model: inherit
---

Run through the release checklist:
1. All tests pass (npm test or equivalent)
2. No TODO/FIXME/HACK comments in changed files
3. CHANGELOG/README updated if needed
4. No console.log/debug statements left in
5. Dependencies are locked (lockfile up to date)
6. No secrets or credentials in committed files
7. Version numbers bumped if applicable
