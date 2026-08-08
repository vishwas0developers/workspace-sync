---
name: workspace-sync-inspect-production
description: "Inspect files, logs, processes, or Git status on the Production VPS environment."
---

# WorkspaceSync Production Inspection Skill

Use this skill when inspecting the Production VPS environment for a project.

## When to Use
- Fetching Production logs (`remote_logs` on production).
- Inspecting directories and files on Production VPS (`remote_tree`, `remote_file_read` on production).
- Checking active processes or services on Production VPS (`remote_processes`, `remote_services` on production).
- Viewing git status on Production VPS (`remote_git_status` on production).

## Required MCP Tools
- `remote_tree`
- `remote_file_read`
- `remote_git_status`
- `remote_logs`
- `remote_services`
- `remote_processes`

## Safety Rules
- **Zero Write Policy**: Production is strictly read-only. Never run mutate commands or execute restarts.
