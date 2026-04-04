---
name: Coding Style Preferences
description: Code style rules — small files, no premature abstractions, DRY at 3+
type: feedback
---

Prefer small, focused files over large monoliths.
Don't add abstractions until duplication reaches 3+ instances.
Three similar lines of code is better than a premature utility.

**Why:** Premature abstractions create coupling and reduce clarity.
**How to apply:** When tempted to extract a helper, check if there are truly 3+ call sites.
