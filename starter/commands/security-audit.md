---
description: Audit workspace for common security vulnerabilities
allowed-tools: [read_file, search, glob]
model: inherit
---

Audit the workspace for OWASP Top 10 vulnerabilities and Node.js-specific security issues:
1. Command injection (child_process, exec, eval)
2. Path traversal (unsanitized user paths)
3. SQL/NoSQL injection
4. XSS in any HTML/template output
5. Sensitive data exposure (hardcoded secrets, .env in git)
6. Insecure dependencies (if package.json exists)

Report each finding with file path, line, severity, and remediation.
