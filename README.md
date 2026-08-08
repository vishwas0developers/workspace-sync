# WorkspaceSync

> Security-hardened local Model Context Protocol (MCP) server & CLI tool that provides AI coding assistants with a persistent map of your workspace projects and remote servers over SSH aliases.

---

## 📋 Requirements

Before installing WorkspaceSync, ensure your environment meets the following requirements:

| Component      | Required Version    | Verification Command |
| :------------- | :------------------ | :------------------- |
| **Node.js**    | `18+`               | `node --version`     |
| **npm**        | `9+`                | `npm --version`      |
| **Git**        | Any version         | `git --version`      |
| **System SSH** | Standard SSH client | `ssh -V`             |

> [!NOTE]
> **Windows Users**: An active SSH agent (such as OpenSSH for Windows or Pageant) is required. The system `ssh` binary must be available on your system PATH.

---

## 🚀 Installation

Install WorkspaceSync globally using npm:

```bash
npm install -g workspace-sync
```

Verify that the CLI binary is available:

```bash
workspace-sync --version
# Output: workspace-sync 0.1.0
```

---

## 🏁 Getting Started

Follow these steps in your workspace root directory to configure WorkspaceSync:

### Step 1: Initialize Workspace

Initialize the `.workspace-sync/` configuration folder in your workspace root directory:

```bash
workspace-sync init --name "MyWorkspace"
```

### Step 2: Register Local Projects

Add local project directories to WorkspaceSync tracking:

```bash
workspace-sync add-project "admin" "./admin-panel" -g "https://github.com/org/admin.git"
```

### Step 3: Link Remote VPS Environments

Link your Testing and Production servers using SSH aliases configured in your `~/.ssh/config`:

```bash
workspace-sync link-testing "admin" "test-vps" "/var/www/admin"
workspace-sync link-production "admin" "prod-vps" "/var/www/admin"
```

### Step 4: Run Diagnostics

Verify local path resolution and test SSH host connectivity:

```bash
workspace-sync doctor
```

### Step 5: Install Agent Skills & IDE Settings

Configure `.vscode/mcp.json` and deploy modular AI agent skills into `.agents/skills/`:

```bash
workspace-sync install
```

Your workspace is now fully configured and ready for your AI assistant.

---

## 🛠️ Command Reference

All commands are executed from your workspace root directory.

### Command Overview Table

| Command                                                               | Description                                                               |
| :-------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| [`workspace-sync init`](#1-workspace-sync-init)                       | Initialize the `.workspace-sync/` configuration directory.                |
| [`workspace-sync status`](#2-workspace-sync-status)                   | Display a live summary of all registered projects and environments.       |
| [`workspace-sync add-project`](#3-workspace-sync-add-project)         | Register a local project directory in the workspace configuration map.    |
| [`workspace-sync remove-project`](#4-workspace-sync-remove-project)   | Safely unregister project configuration mappings.                         |
| [`workspace-sync rename-project`](#5-workspace-sync-rename-project)   | Rename an existing registered project configuration.                      |
| [`workspace-sync link-testing`](#6-workspace-sync-link-testing)       | Link a project's Testing VPS environment via an SSH alias.                |
| [`workspace-sync link-production`](#7-workspace-sync-link-production) | Link a project's Production VPS environment via an SSH alias (read-only). |
| [`workspace-sync doctor`](#8-workspace-sync-doctor)                   | Run diagnostics on local paths and SSH host connectivity.                 |
| [`workspace-sync install`](#9-workspace-sync-install)                 | Write VS Code MCP settings and deploy modular AI agent skills.            |
| [`workspace-sync undo`](#10-workspace-sync-undo)                      | Roll back the last reversible configuration change in one step.           |
| [`workspace-sync mcp`](#11-workspace-sync-mcp)                        | Start the stdio Model Context Protocol (MCP) server for AI connections.   |

---

### Command Details

> ### 1. `workspace-sync init`
>
> 📌 **Purpose:** Initialize the `.workspace-sync/` configuration directory and generate initial agent memory.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync init [options]
> ```
>
> ⚙️ **Options:**
>
> - `-n, --name "<name>"`: Custom workspace display name (defaults to current folder name).
>
> 📝 **Example:**
>
> ```bash
> workspace-sync init --name "MyWorkspace"
> ```

---

> ### 2. `workspace-sync status`
>
> 📌 **Purpose:** Display a live summary of all registered projects, local Git statuses, and linked VPS environment paths.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync status
> ```

---

> ### 3. `workspace-sync add-project`
>
> 📌 **Purpose:** Register a local project directory in the workspace configuration map.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync add-project "<name>" "<localPath>" [options]
> ```
>
> 📥 **Arguments:**
>
> - `"<name>"`: Unique project identifier.
> - `"<localPath>"`: Relative or absolute path to the local project directory.
>
> ⚙️ **Options:**
>
> - `-g, --git "<repository>"`: Git remote repository URL or identifier.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync add-project "admin" "./admin-panel" -g "https://github.com/org/admin.git"
> ```

---

> ### 4. `workspace-sync remove-project`
>
> 📌 **Purpose:** Safely unregister project metadata and configuration mappings from WorkspaceSync.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync remove-project "<project>" [options]
> ```
>
> 📥 **Arguments:**
>
> - `"<project>"`: Name of the project to remove.
>
> ⚙️ **Options:**
>
> - `-y, --yes`: Skip confirmation prompt.
>
> 💡 **Note:**
> This command only removes WorkspaceSync metadata configuration. It does **not** delete local source code files, Git repositories, remote server files, or SSH settings.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync remove-project "admin" -y
> ```

---

> ### 5. `workspace-sync rename-project`
>
> 📌 **Purpose:** Rename an existing registered project configuration without modifying any files or directories on disk.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync rename-project "<currentName>" "<newName>"
> ```
>
> 📥 **Arguments:**
>
> - `"<currentName>"`: Existing project identifier.
> - `"<newName>"`: New project identifier.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync rename-project "old-admin" "admin-panel"
> ```

---

> ### 6. `workspace-sync link-testing`
>
> 📌 **Purpose:** Link a project's Testing VPS environment via a local SSH alias and remote directory path.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync link-testing "<project>" "<sshAlias>" "<remotePath>"
> ```
>
> 📥 **Arguments:**
>
> - `"<project>"`: Registered project identifier.
> - `"<sshAlias>"`: SSH alias name from `~/.ssh/config` (never raw passwords or keys).
> - `"<remotePath>"`: Absolute path to project root on remote server.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync link-testing "admin" "test-vps" "/var/www/admin"
> ```

---

> ### 7. `workspace-sync link-production`
>
> 📌 **Purpose:** Link a project's Production VPS environment via a local SSH alias and remote directory path (strictly read-only).
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync link-production "<project>" "<sshAlias>" "<remotePath>"
> ```
>
> 📥 **Arguments:**
>
> - `"<project>"`: Registered project identifier.
> - `"<sshAlias>"`: SSH alias name from `~/.ssh/config`.
> - `"<remotePath>"`: Absolute path to project root on remote server.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync link-production "admin" "prod-vps" "/var/www/admin"
> ```

---

> ### 8. `workspace-sync doctor`
>
> 📌 **Purpose:** Perform a self-diagnostic check on configuration integrity, local directory existence, and SSH connectivity to linked VPS hosts.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync doctor
> ```

---

> ### 9. `workspace-sync install`
>
> 📌 **Purpose:** Write VS Code MCP settings (`.vscode/mcp.json`) and deploy task-specific AI agent skills into `.agents/skills/`.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync install
> ```

---

> ### 10. `workspace-sync undo`
>
> 📌 **Purpose:** Perform a single-step atomic rollback of the last reversible workspace operation (`add-project`, `remove-project`, `rename-project`, `link-testing`, `link-production`).
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync undo [options]
> ```
>
> ⚙️ **Options:**
>
> - `-y, --yes`: Skip confirmation prompt.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync remove-project "admin" -y
> workspace-sync undo -y
> ```

---

> ### 11. `workspace-sync mcp`
>
> 📌 **Purpose:** Start the stdio Model Context Protocol (MCP) server for IDE and AI agent connections.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync mcp
> ```
>
> 💡 **Note:**
> This command is invoked automatically by VS Code or your MCP client via `.vscode/mcp.json`. Do not run manually during normal usage.

---

## 📚 Documentation Links

- **Developer & Architecture Docs:** [docs/DEVELOPER.md](docs/DEVELOPER.md)
- **Contribution Guide:** [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- **License:** [MIT License](LICENSE)

---

## 🤝 Contributing

Contributions are welcome! If you would like to help improve WorkspaceSync, please check out the step-by-step guide in [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) to learn how to fork, clone, set up, test, and open a Pull Request.
