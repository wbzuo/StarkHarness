---
name: refactor
description: Refactor code following DRY, YAGNI, and single-responsibility
version: 0.1.0
---

# Refactor Skill

Guide refactoring decisions:

1. **Identify** what to change and why
2. **Extract** only when duplication is real (3+ sites)
3. **Split** files that exceed ~300 lines or have multiple responsibilities
4. **Verify** tests pass after every change
5. **Commit** in small, reviewable chunks

Rules:
- Don't add abstractions for hypothetical future needs
- Three similar lines is better than a premature abstraction
- Follow existing patterns in the codebase
