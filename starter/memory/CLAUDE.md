# CLAUDE.md

## Project

This project uses StarkHarness as its agent runtime.

## Conventions

- Zero dependencies — use Node.js built-ins only
- All tests use `node:test` and `node:assert/strict`
- Run `node --test` to execute the test suite
- Commit messages follow conventional commits (feat:, fix:, docs:)

## Permissions

- Read tools: always allowed
- Write/exec tools: ask before executing
- Shell commands: review before running
