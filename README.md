# WorkspaceSync

> **Simple, security-hardened tool** that gives AI coding assistants a reliable map of your multi-project workspace and testing/production servers—without ever exposing your SSH keys or credentials to the AI.

WorkspaceSync maps your local project paths and links them to remote servers over SSH. An AI agent using WorkspaceSync can query status, inspect logs, and compare environment commits automatically, keeping configuration secure and developers in control.

For detailed architecture, configuration files, and developer guides, see [DEVELOPER.md](docs/DEVELOPER.md).

---

## Installation

Install WorkspaceSync globally using npm:

```bash
npm install -g workspace-sync
```

Verify the installation:

```bash
workspace-sync --version
# workspace-sync 0.1.0
```

---

## Quick Start Workflow

Set up a workspace, register a project, link a remote testing server, and install configurations in minutes:

```bash
# 1. Initialize WorkspaceSync in your workspace root
cd /path/to/your-workspace
workspace-sync init --name "MyWorkspace"

# 2. Register your local project
workspace-sync add-project api ./api-service --git https://github.com/org/api.git

# 3. Link your remote testing environment using an SSH alias
workspace-sync link-testing api my-testing-vps /var/www/api

# 4. Run diagnostics to verify setup
workspace-sync doctor

# 5. Install MCP settings and AI agent skills
workspace-sync install
```

---

## CLI Command Reference

All commands must be executed from your workspace root.

### `init`
Initialize the `.workspace-sync/` configuration directory.
```bash
workspace-sync init [options]

Options:
  -n, --name <name>   Workspace display name (defaults to folder name)
```

### `add-project`
Register a local project directory.
```bash
workspace-sync add-project <name> <localPath> [options]

Options:
  -g, --git <url>     Git repository URL
```

### `remove-project`
Safely unregister a project from WorkspaceSync.
```bash
workspace-sync remove-project <project> [options]

Options:
  -y, --yes           Skip confirmation prompt
```
*Note: This command only removes metadata registry configs. It never deletes local files or remote resources.*

### `rename-project`
Rename a registered project identifier.
```bash
workspace-sync rename-project <current-name> <new-name>
```

### `link-testing` / `link-production`
Link a testing or production server location using an SSH alias.
```bash
workspace-sync link-testing <project> <sshAlias> <remotePath>
workspace-sync link-production <project> <sshAlias> <remotePath>
```
*Note: Use SSH aliases defined in your `~/.ssh/config` file (never pass raw passwords or keys).*

### `status`
Display a live overview of all projects and linked environments.
```bash
workspace-sync status
```

### `undo`
Revert the last reversible WorkspaceSync operation.
```bash
workspace-sync undo [options]

Options:
  -y, --yes           Skip confirmation prompt
```

### `doctor`
Verify local project paths and check SSH connections to remote servers.
```bash
workspace-sync doctor
```

### `install`
Install the stdio Model Context Protocol (MCP) server settings and modular agent skills into the workspace.
```bash
workspace-sync install
```
