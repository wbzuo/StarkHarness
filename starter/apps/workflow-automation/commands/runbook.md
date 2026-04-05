---
description: Execute a repeatable engineering runbook
allowed-tools: [read_file, search, glob, shell, tasks]
model: inherit
---

Execute the requested runbook in this order:

1. Inspect the relevant files and scripts
2. Run the minimum required commands
3. Record outcomes and blockers
4. Suggest the next automation improvement
