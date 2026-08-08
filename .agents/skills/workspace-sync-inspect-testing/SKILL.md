---
name: workspace-sync-inspect-testing
description: "Inspect files, logs, processes, or Git status on the Testing VPS environment."
---

# WorkspaceSync Testing Inspection Skill

Use this skill when inspecting the Testing VPS environment for a project.

## When to Use
- Fetching Testing logs (`remote_logs` on testing).
- Inspecting directories and files on Testing VPS (`remote_tree`, `remote_file_read` on testing).
- Checking active processes or services on Testing VPS (`remote_processes`, `remote_services` on testing).
- Viewing git status on Testing VPS (`remote_git_status` on testing).

## Required MCP Tools
- `remote_tree`
- `remote_file_read`
- `remote_git_status`
- `remote_logs`
- `remote_services`
- `remote_processes`

## Safety Rules
- **Zero Write Policy**: Testing is strictly read-only. Never run mutate commands or execute restarts.
