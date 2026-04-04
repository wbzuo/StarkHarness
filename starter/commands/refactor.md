---
description: Refactor code for clarity and maintainability
allowed-tools: [read_file, write_file, edit_file, search, glob]
model: inherit
---

Refactor the specified code to improve clarity and maintainability while preserving all behavior.
Follow these principles:
- Extract only when duplication is real (3+ instances)
- Prefer smaller, focused files over large ones
- Don't add abstractions for hypothetical future needs
- Ensure tests still pass after every change
