# Command Reference

Full syntax, arguments, options, and examples for every WorkspaceSync **terminal** command. For the high-level Agent vs. Terminal support matrix, see the [Command Support table](../README.md#-command-support) in the README.

All commands are executed from your workspace root directory, **without a leading slash** (a leading slash is a skill-trigger shortcut used only inside an AI agent's own chat interface — see the README for details). Most users only need `workspace-sync setup` plus the matching `workspace-sync install "agent"` command; the rest are for advanced/manual use.

---

## Command Details

Every command below is documented as a single self-contained block: purpose, syntax, arguments/options, and examples together — no separate narrative sections.

> ### 0. `workspace-sync setup`
>
> 📌 **Purpose:** One-command **project** setup (recommended). Detects the current workspace and project folders, initializes `.workspace-sync/` (or preserves it if it already exists), auto-registers detected projects, and generates `AGENT_MEMORY.md` — all with minimal interaction. Does **not** write any AI agent or MCP configuration; run `workspace-sync install "agent"` separately for that.
>
> 💻 **Syntax:**
>
> ```bash
> npx workspace-sync setup
> ```
>
> 💡 **Note:**
> Safe to re-run at any time — existing configuration and manually registered projects are preserved, not overwritten.

---

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
> - `-n, --name "name"`: Custom workspace display name (defaults to current folder name).
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
> workspace-sync add-project "name" "localPath" [options]
> ```
>
> 📥 **Arguments:**
>
> - `"name"`: Unique project identifier.
> - `"localPath"`: Relative or absolute path to the local project directory.
>
> ⚙️ **Options:**
>
> - `-g, --git "repository"`: Git remote repository URL or identifier.
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
> workspace-sync remove-project "project" [options]
> ```
>
> 📥 **Arguments:**
>
> - `"project"`: Name of the project to remove.
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
> workspace-sync rename-project "currentName" "newName"
> ```
>
> 📥 **Arguments:**
>
> - `"currentName"`: Existing project identifier.
> - `"newName"`: New project identifier.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync rename-project "old-admin" "admin-panel"
> ```

---

> ### 6. `workspace-sync link-testing`
>
> 📌 **Purpose:** Link a project's Testing VPS environment via an SSH alias (or hostname) and remote directory path.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync link-testing "project" "sshAliasOrHost" "remotePath"
> ```
>
> 📥 **Arguments:**
>
> - `"project"`: Registered project identifier.
> - `"sshAliasOrHost"`: an SSH alias defined in `~/.ssh/config`, or a hostname (never raw passwords or keys).
> - `"remotePath"`: Absolute path to project root on remote server.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync link-testing "admin" "test-vps" "/var/www/admin"
> ```

---

> ### 7. `workspace-sync link-production`
>
> 📌 **Purpose:** Link a project's Production VPS environment via an SSH alias (or hostname) and remote directory path (strictly read-only).
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync link-production "project" "sshAliasOrHost" "remotePath"
> ```
>
> 📥 **Arguments:**
>
> - `"project"`: Registered project identifier.
> - `"sshAliasOrHost"`: an SSH alias defined in `~/.ssh/config`, or a hostname.
> - `"remotePath"`: Absolute path to project root on remote server.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync link-production "admin" "prod-vps" "/var/www/admin"
> ```

---

> ### 8. `workspace-sync doctor`
>
> 📌 **Purpose:** Diagnose and repair drift against the **currently installed** WorkspaceSync version — never installs a newer package (see [`update`](#12-workspace-sync-update) for that). Checks configuration integrity (migrating a legacy field name if found, without changing its value), reconciles each installed agent's skills back to the current version's defaults (restoring hand-edited, deleted, or never-fully-installed skill files), and checks local directory existence and SSH connectivity to linked VPS hosts. Registered projects, environment links, and policies are never touched beyond a safe schema migration.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync doctor
> ```
>
> ⚙️ **Options:**
>
> - `--check-only`: Report drift without repairing anything.
> - `--offline`: Skip the (informational-only) check for a newer published version.
>
> 💡 **Note:**
> Safe to run anytime — it's read-only for project-specific settings and only rewrites skill files/MCP config back to the current version's defaults. `doctor` vs. `update`: `doctor` never installs a new package version, it only repairs drift against whatever version is already installed; `update` installs the latest package first (see below), then repairs drift the same way. Registered projects, environment links, and policies are never touched by either command beyond a safe schema migration.

---

> ### 9. `workspace-sync install "agent"`
>
> 📌 **Purpose:** Write MCP settings for a specific AI agent and deploy WorkspaceSync skills into that agent's skills directory (`.claude/skills/` for Claude Code, `.agents/skills/` for everything else). See the [🔌 Agent Installation](../README.md#-agent-installation) table in the README for the full agent → command mapping. Omitting `"agent"` (bare `workspace-sync install`) targets VS Code (`.vscode/mcp.json`) for backward compatibility.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync install "agent"
> ```
>
> 📥 **Arguments:**
>
> - `"agent"`: See the [🔌 Agent Installation](../README.md#-agent-installation) table for the full list. Kimi Code is reachable only via `workspace-sync install --platform kimi`.
>
> 📝 **Example:**
>
> ```bash
> workspace-sync install claude
> npx workspace-sync install antigravity
> ```
>
> 💡 **Note:**
> Merges into any existing MCP config file rather than overwriting it, and is safe to re-run any time (`workspace-sync doctor` and `workspace-sync update` also refresh skills, without you needing to name the agent again). A per-agent subcommand form also exists (`workspace-sync "agent" install`, e.g. `workspace-sync claude install`) but has been unreliable over `npx` in some environments — prefer `install "agent"` shown above.

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

> ### 12. `workspace-sync update`
>
> 📌 **Purpose:** Install the **latest published WorkspaceSync version** (runs `npm install -g workspace-sync@latest` internally), then run the same drift repair `doctor` does (skills + configuration schema) against that new version. See [`doctor`](#8-workspace-sync-doctor) above for the full distinction — `doctor` never installs a new package, `update` always tries to.
>
> 💻 **Syntax:**
>
> ```bash
> workspace-sync update
> ```
>
> ⚙️ **Options:**
>
> - `--check-only`: Report what would change without installing or writing anything.
> - `--offline`: Skip the npm registry check; only sync skills/config against whatever version is currently installed.
>
> 📝 **Manual alternative:** If you'd rather update the npm package by hand instead of through `workspace-sync update`, that also works:
>
> ```bash
> npm install -g workspace-sync@latest
> ```
>
> 💡 **Note:**
> If a newer version was just installed, skill/config syncing is deferred to the next run — a running Node process can't hot-swap its own already-loaded code — so run `workspace-sync update` a second time to complete the sync. If you were already on the latest version, it syncs immediately in one run. Registered projects, environment links, and policies are never touched beyond a safe schema migration.

---

## Agent Skills (for reference)

Skills are **not** terminal commands — they only run inside an AI agent, invoked with a leading slash (e.g. `/workspace-sync-status`). See the [Command Support table](../README.md#-command-support) in the README for the full Agent vs. Terminal matrix, and [🧠 Deployed Skills](../README.md#-deployed-skills) for what each one does.

The **`workspace-sync-investigation`** skill is the master entry point whenever a bug, incident, or regression is reported and the cause is unknown. Point your AI assistant at it (for example: *"use the workspace-sync investigation skill — the login page is failing in production"*). It tells the assistant, in one place:

- **What tools it has** — the full MCP tool surface, and that all remote access goes through the SSH aliases you already configured (it never handles hosts, keys, or credentials itself).
- **What order to look in** — orient on the workspace map, check for deployed-version drift first (a large share of "works locally, breaks in prod" is simply the wrong commit deployed), then read the live logs, then check services/processes, then inspect the specific deployed files the evidence points at.
- **When to stop** — it works top-down and stops as soon as the evidence identifies the cause, rather than mechanically running every check or crawling your repository.
- **How to report** — symptom, root cause with the evidence that proves it (log line, revision hash, file path), the required fix, and an honest statement of confidence rather than a guess presented as a finding.

> [!IMPORTANT]
> Investigation is **read-only**. The skill explicitly forbids mutating Testing or Production — no edits, deploys, restarts, or "let me just try a fix" on a live server. It proposes the fix; a human applies it through the normal local → review → deploy path. It also treats everything returned from a server (logs, file contents, process output) as untrusted **data**, so text on a server that looks like an instruction is reported, never executed.
