# WorkspaceSync

> Security-hardened local Model Context Protocol (MCP) server & CLI tool that provides AI coding assistants with a persistent map of your workspace projects and remote servers over SSH aliases.

For complete installation, prerequisite checks, and initial workspace setup, see the **[SETUP.md](SETUP.md)** guide.  
For technical architecture, MCP tool schemas, and internal developer notes, see **[docs/DEVELOPER.md](docs/DEVELOPER.md)**.  
For contribution guidelines, see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Command Reference

All commands are executed from your workspace root directory.

### `workspace-sync init`

**Purpose:** Initialize the `.workspace-sync/` configuration directory and generate initial agent memory.

**Syntax:**
```bash
workspace-sync init [options]
```

**Options:**
- `-n, --name "<name>"`: Custom workspace display name (defaults to current folder name).

**Example:**
```bash
workspace-sync init --name "MyWorkspace"
```

---

### `workspace-sync status`

**Purpose:** Display a live summary of all registered projects, local Git statuses, and linked VPS environment paths.

**Syntax:**
```bash
workspace-sync status
```

---

### `workspace-sync add-project`

**Purpose:** Register a local project directory in the workspace configuration map.

**Syntax:**
```bash
workspace-sync add-project "<name>" "<localPath>" [options]
```

**Arguments:**
- `"<name>"`: Unique project identifier.
- `"<localPath>"`: Relative or absolute path to the local project directory.

**Options:**
- `-g, --git "<repository>"`: Git remote repository URL or identifier.

**Example:**
```bash
workspace-sync add-project "admin" "./admin-panel" -g "https://github.com/org/admin.git"
```

---

### `workspace-sync remove-project`

**Purpose:** Safely unregister project metadata and configuration mappings from WorkspaceSync.

**Syntax:**
```bash
workspace-sync remove-project "<project>" [options]
```

**Arguments:**
- `"<project>"`: Name of the project to remove.

**Options:**
- `-y, --yes`: Skip confirmation prompt.

> [!NOTE]
> This command only removes WorkspaceSync metadata configuration. It does **not** delete local source code files, Git repositories, remote server files, or SSH settings.

**Example:**
```bash
workspace-sync remove-project "admin" -y
```

---

### `workspace-sync rename-project`

**Purpose:** Rename an existing registered project configuration without modifying any files or directories on disk.

**Syntax:**
```bash
workspace-sync rename-project "<currentName>" "<newName>"
```

**Arguments:**
- `"<currentName>"`: Existing project identifier.
- `"<newName>"`: New project identifier.

**Example:**
```bash
workspace-sync rename-project "old-admin" "admin-panel"
```

---

### `workspace-sync link-testing`

**Purpose:** Link a project's Testing VPS environment via a local SSH alias and remote directory path.

**Syntax:**
```bash
workspace-sync link-testing "<project>" "<sshAlias>" "<remotePath>"
```

**Arguments:**
- `"<project>"`: Registered project identifier.
- `"<sshAlias>"`: SSH alias name from `~/.ssh/config` (never raw passwords or keys).
- `"<remotePath>"`: Absolute path to project root on remote server.

**Example:**
```bash
workspace-sync link-testing "admin" "test-vps" "/var/www/admin"
```

---

### `workspace-sync link-production`

**Purpose:** Link a project's Production VPS environment via a local SSH alias and remote directory path (strictly read-only).

**Syntax:**
```bash
workspace-sync link-production "<project>" "<sshAlias>" "<remotePath>"
```

**Arguments:**
- `"<project>"`: Registered project identifier.
- `"<sshAlias>"`: SSH alias name from `~/.ssh/config`.
- `"<remotePath>"`: Absolute path to project root on remote server.

**Example:**
```bash
workspace-sync link-production "admin" "prod-vps" "/var/www/admin"
```

---

### `workspace-sync doctor`

**Purpose:** Perform a self-diagnostic check on configuration integrity, local directory existence, and SSH connectivity to linked VPS hosts.

**Syntax:**
```bash
workspace-sync doctor
```

---

### `workspace-sync install`

**Purpose:** Write VS Code MCP settings (`.vscode/mcp.json`) and deploy task-specific AI agent skills into `.agents/skills/`.

**Syntax:**
```bash
workspace-sync install
```

---

### `workspace-sync undo`

**Purpose:** Perform a single-step atomic rollback of the last reversible workspace operation (`add-project`, `remove-project`, `rename-project`, `link-testing`, `link-production`).

**Syntax:**
```bash
workspace-sync undo [options]
```

**Options:**
- `-y, --yes`: Skip confirmation prompt.

**Example:**
```bash
workspace-sync remove-project "admin" -y
workspace-sync undo -y
```

---

### `workspace-sync mcp`

**Purpose:** Start the stdio Model Context Protocol (MCP) server for IDE and AI agent connections.

**Syntax:**
```bash
workspace-sync mcp
```

> [!NOTE]
> This command is invoked automatically by VS Code or your MCP client via `.vscode/mcp.json`. Do not run manually during normal usage.

---

## Documentation Links

- **Setup Guide:** [SETUP.md](SETUP.md)
- **Developer & Architecture Docs:** [docs/DEVELOPER.md](docs/DEVELOPER.md)
- **Contribution Guide:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **License:** [MIT License](LICENSE)

---

## Contributing

Contributions are welcome! If you would like to help improve WorkspaceSync, please check out the step-by-step guide in [CONTRIBUTING.md](CONTRIBUTING.md) to learn how to fork, clone, set up, test, and open a Pull Request.
