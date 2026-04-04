---
description: Investigate a bug systematically
allowed-tools: [read_file, search, glob, shell]
model: inherit
---

Investigate the described bug using this process:
1. Reproduce: identify the trigger condition
2. Isolate: narrow to the smallest failing case
3. Trace: follow the execution path from input to bug
4. Root cause: identify what is wrong and why
5. Fix: propose the minimal change that fixes the root cause
6. Verify: confirm the fix works and no regressions
