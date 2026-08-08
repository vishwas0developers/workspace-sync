---
name: workspace-sync-project-management
description: "Manage workspace projects: register, rename, or remove projects, check configuration status."
---

# WorkspaceSync Project Management Skill

Use this skill when managing the workspace configuration and projects registry.

## When to Use
- Registering a new project (`workspace-sync add-project`).
- Removing an existing project (`workspace-sync remove-project`).
- Renaming a registered project (`workspace-sync rename-project`).
- Checking local status and registered environments (`workspace-sync status`).

## Safety Rules
- `remove-project` is fail-closed. Ensure you provide the exact resolved project name.
- Non-existent or empty project target will abort and make no changes. No wildcards allowed.
- Displays the target project name and path before requesting confirmation.
