---
name: code-review
description: Systematic code review with structured output
version: 0.1.0
---

# Code Review Skill

Review code changes systematically:

1. **Read** all changed files
2. **Categorize** findings: critical / important / suggestion
3. **Report** with file path, line number, and remediation

Focus areas:
- Correctness: logic errors, edge cases, off-by-ones
- Security: injection, path traversal, secret exposure
- Style: naming, dead code, unnecessary complexity
- Testing: uncovered paths, brittle assertions
