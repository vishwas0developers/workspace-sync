---
name: workspace-sync-compare-environments
description: "Compare Git revisions and commits between local, testing, and production environments."
---

# WorkspaceSync Environment Comparison Skill

Use this skill when comparing commits or checking deployment synchronicity across environments.

## When to Use
- Comparing Git commit hashes across local repository, Testing VPS, and Production VPS (`compare_environments`).
- Fetching current deployed Git revision on a remote environment (`remote_git_revision`).

## Required MCP Tools
- `compare_environments`
- `remote_git_revision`
