<p align="center">
  <img src="docs/images/logo.svg" alt="WorkspaceSync Logo" width="600">
</p>

# WorkspaceSync


> Security-hardened local Model Context Protocol (MCP) server & CLI tool that provides AI coding assistants with a persistent map of your workspace projects and remote servers over SSH aliases.

## What does WorkspaceSync do?

When you ask an AI coding assistant for help, it normally only sees the one folder you have open. It has no idea that the same project also runs on a test server and a production server, where those servers are, or which version of your code is live on each. So you end up re-explaining your setup every session — and the assistant still can't go check anything itself.

WorkspaceSync fixes that. You register your projects once and link each one to its Testing and Production servers using SSH connections you've **already** set up. From then on your AI assistant automatically knows which projects exist and where they live on your machine, which servers each one is deployed to, and what is actually running on those servers right now.

The practical payoff: you can ask *"why is the login page broken in production?"* and the assistant can actually go and look — read the live logs, check which commit is deployed, compare it against your local code — instead of guessing.

**Testing and Production are strictly read-only.** WorkspaceSync can inspect your servers but never modify them, so an AI assistant can investigate a live incident with no risk of changing or breaking it.

If you find this project useful, consider giving it a ⭐ on GitHub!

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

## ⚡ Quick Setup Guide (Recommended)

Setup is two explicit steps: install the **project**, then install the **AI agent integration** for whichever agent you use. Keeping these separate means `setup` never guesses or writes agent-specific config on your behalf.

### Step 1: Install the project

```bash
npx workspace-sync setup
```

This one command:
- Detects your current workspace and any local project folders (via `package.json`, `.git`, `go.mod`, and similar markers).
- Initializes WorkspaceSync configuration — or safely preserves it if one already exists.
- Auto-registers discovered projects and generates `AGENT_MEMORY.md`.
- Verifies the result — all with minimal user interaction.

`setup` **only installs the project.** It does not write any AI agent or MCP configuration — that's Step 2.

### Step 2: Install your AI agent integration

Make your AI agent always aware of your workspace map. Run the install command for whichever AI coding agent you use once per project — see the [🔌 Agent Installation](#-agent-installation) table below. For example:

```bash
workspace-sync install claude
```

This writes the MCP server registration for that specific agent and deploys the WorkspaceSync skills to that agent's own native skills directory (e.g. `.claude/skills/` for Claude Code, `.codex/skills/` for Codex, `.opencode/skills/` for OpenCode — see the [🔌 Agent Installation](#-agent-installation) table for the full per-agent mapping).

> [!IMPORTANT]
> Use the `workspace-sync install "agent"` form shown above and in the table below. The alternate `workspace-sync "agent" install` subcommand form (e.g. `workspace-sync claude install`) is also registered but has been unreliable via `npx` in some environments (it can fail with `error: unknown command`) — prefer `install "agent"`.

> [!IMPORTANT]
> These commands intentionally do **not** use `npx` — many AI agents cannot invoke `npx` from inside their own tool-call sandbox. Install WorkspaceSync globally first (`npm install -g workspace-sync`, see [Step 3](#step-3-install-workspacesync-globally-manual) below) so the plain `workspace-sync` binary is directly available, then run the Step 2 command from within your agent.

> [!TIP]
> Run `workspace-sync --help` for a full agent-by-agent reference (install command, skills directory, MCP config location) — it's written to be easy for an AI agent to read and self-identify in. `workspace-sync doctor` will warn you when a project's installed skills are stale.

### Step 3: Install WorkspaceSync globally (manual)

If you'd rather install the CLI once instead of using `npx` each time, install it globally using npm:

```bash
npm install -g workspace-sync
```

Verify that the CLI binary is available:

```bash
workspace-sync --version
# Output: 0.2.0
```

> [!IMPORTANT]
> For full command details, see [docs/COMMANDS.md](docs/COMMANDS.md).

### Step 4: Keep the project updated (manual)

Update the npm package, then run the agent-side update command so everything stays in sync:

```bash
npm update -g workspace-sync
workspace-sync update
```

The individual commands documented in [🏁 Workspace Synchronize Setup](#-manual--advanced-setup) below (`init`, `add-project`, `link-testing`, etc.) remain available for advanced or manual configuration.

---

## 🔌 Agent Installation (Step 2 from Quick Setup Guide)

After running `workspace-sync setup` ([⚡ Quick Setup](#-quick-setup-recommended) Step 1), run the matching command below **inside the AI agent you use** to sync WorkspaceSync's skills and MCP configuration for that agent:

| Platform | Command | Skills Directory |
| :--- | :--- | :--- |
| Claude Code | `workspace-sync install claude` | `.claude/skills/` |
| CodeBuddy | `workspace-sync install codebuddy` | `.codebuddy/skills/` |
| Codex | `workspace-sync install codex` | `.codex/skills/` |
| OpenCode | `workspace-sync install opencode` | `.opencode/skills/` |
| Kilo Code | `workspace-sync install kilo` | `.config/kilo/skills/` |
| GitHub Copilot CLI | `workspace-sync install copilot` | `.copilot/skills/` |
| VS Code Copilot Chat | `workspace-sync install vscode` | `.agents/skills/` (generic; unverified for VS Code) |
| Aider | `workspace-sync install aider` | `.aider/` (no `skills/` subfolder) |
| OpenClaw | `workspace-sync install claw` | `.openclaw/skills/` |
| Factory Droid | `workspace-sync install droid` | `.factory/skills/` |
| Trae | `workspace-sync install trae` | `.trae/skills/` |
| Trae CN | `workspace-sync install trae-cn` | `.trae-cn/skills/` |
| Cursor | `workspace-sync install cursor` | `.agents/skills/` (generic; unverified for Cursor) |
| Gemini CLI | `workspace-sync install gemini` | `.gemini/skills/` |
| Hermes | `workspace-sync install hermes` | `.hermes/skills/` |
| Kimi Code | `workspace-sync install --platform kimi` | `.kimi/skills/` |
| Amp | `workspace-sync install amp` | `.agents/skills/` |
| Agent Skills (cross-framework) | `workspace-sync install agents` (alias `workspace-sync install skills`) | `.agents/skills/` |
| Kiro IDE/CLI | `workspace-sync install kiro` | `.kiro/skills/` |
| Pi coding agent | `workspace-sync install pi` | `.pi/agent/skills/` |
| Devin CLI | `workspace-sync install devin` | `.devin/skills/` |
| Google Antigravity | `workspace-sync install antigravity` | `.agents/skills/` |

Every command is safe to re-run at any time — it merges into any existing MCP config rather than overwriting it, and refreshes skills to the currently installed WorkspaceSync version. `workspace-sync install` with no arguments still works too (defaults to VS Code) for backward compatibility.

> [!NOTE]
> MCP config paths for **Claude Code**, **VS Code Copilot Chat**, **Cursor**, **Gemini CLI**, and **Google Antigravity** are confirmed. **Aider** has no MCP support, so its command deploys skills only. **Codex** writes a TOML `mcp_servers` entry (`~/.codex/config.toml`), not JSON. The remaining platforms' MCP config uses a best-effort `.{platform}/mcp.json` convention (the schema shared by most MCP-compatible editor forks) — if a specific one doesn't take effect, please confirm that agent's actual config location and open an issue so it can be corrected.
>
> **Skills directories are agent-specific**, not a shared cross-framework folder — this keeps each agent's skills isolated so they don't collide and each agent discovers WorkspaceSync's skills natively (see the table above). Only **VS Code Copilot Chat** and **Cursor** currently fall back to the generic `.agents/skills/` location, since no verified dedicated skills folder for them has been confirmed yet — open an issue if you can confirm one.
>
> Each platform above also has a `workspace-sync "agent" install` subcommand form (e.g. `workspace-sync claude install`), but it has proven unreliable via `npx` in some environments. **Use the `workspace-sync install "agent"` form shown in the table** — it's the one verified to work consistently.

---

## 🧠 Deployed Skills (installed after Agent Installation)

Every `install` deploys these skills into your agent's skills directory. Your AI assistant loads whichever one matches the task — it does not read them all up front. See the [📋 Command Support](#-command-support) table below for how to invoke each one.

| Skill | Use it for |
| :--- | :--- |
| **`workspace-sync-investigation`** | **Master command.** The entry point whenever a bug, incident, or regression is reported and the cause is unknown. Read-only — see [docs/COMMANDS.md](docs/COMMANDS.md#agent-skills-for-reference) for the full behavior contract. |
| `workspace-sync-status` | Which projects are registered, their local Git state, and which environments are linked. |
| `workspace-sync-doctor` | Diagnosing configuration, local paths, SSH connectivity, and stale-skill problems. |
| `workspace-sync-debug-testing` | Inspecting files, logs, processes, or Git status on the **Testing** server. |
| `workspace-sync-debug-production` | Inspecting files, logs, processes, or Git status on the **Production** server. |
| `workspace-sync-compare-environments` | Checking whether local, Testing, and Production are on the same commit. |

---

## 🏁 Workspace Synchronize Setup (manually set up or sync your project with its SSH/remote config)

> [!TIP]
> Most users should use `npx workspace-sync setup` (see [⚡ Quick Setup](#-quick-setup-recommended) above) instead of the steps below. Follow these steps only if you need fine-grained, manual control over each part of the configuration.

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

Link your Testing and Production servers using an SSH alias from your `~/.ssh/config`, or a hostname:

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

Configure MCP settings and deploy modular AI agent skills for your specific AI agent — see the [🔌 Agent Installation](#-agent-installation) table for the full list:

```bash
workspace-sync install claude   # or cursor, gemini, antigravity, agents — omit for VS Code
```

Your workspace is now fully configured and ready for your AI assistant.

---

## 📋 Command Support (day-to-day commands used regularly)

Every command WorkspaceSync ships, in one place — whether it runs in the AI **Agent**, the **Terminal**, or both.

| Command | Agent | Terminal | Description |
| :--- | :---: | :---: | :--- |
| `workspace-sync-investigation` | ✅ | ❌ | **Master analysis command.** Root-cause a bug/incident/regression. Agent-only. |
| `workspace-sync-debug-testing` | ✅ | ❌ | Inspect files, logs, processes, or Git status on **Testing**. Agent-only. |
| `workspace-sync-debug-production` | ✅ | ❌ | Inspect files, logs, processes, or Git status on **Production**. Agent-only. |
| `workspace-sync-compare-environments` | ✅ | ❌ | Check whether local, Testing, and Production are on the same commit. Agent-only. |
| `workspace-sync-status` | ✅ | ✅ | Live summary of registered projects, local Git state, and linked environments. |
| `workspace-sync-doctor` | ✅ | ✅ | Diagnose config, local paths, SSH connectivity, and stale-skill drift. |
| `setup` | ❌ | ✅ | One-command project setup: detect, initialize, discover, verify. |
| `init` | ❌ | ✅ | Initialize the `.workspace-sync/` configuration directory. |
| `add-project` | ❌ | ✅ | Register a local project directory in the workspace map. |
| `remove-project` | ❌ | ✅ | Unregister a project's configuration mapping. |
| `rename-project` | ❌ | ✅ | Rename an existing registered project. |
| `link-testing` | ❌ | ✅ | Link a project's Testing VPS via an SSH alias or hostname. |
| `link-production` | ❌ | ✅ | Link a project's Production VPS via an SSH alias or hostname (read-only). |
| `install "agent"` | ❌ | ✅ | Write MCP settings and deploy skills for a specific AI agent. |
| `undo` | ❌ | ✅ | Roll back the last reversible configuration change. |
| `mcp` | ❌ | ✅ | Start the stdio MCP server (invoked automatically, not run by hand). |
| `update` | ❌ | ✅ | Install the latest published package, then repair drift against it. |

**How to run each:**
- **Agent** (✅ in the Agent column): invoke with a leading slash, e.g. `/workspace-sync-status`, `/workspace-sync-investigation`. This only works inside your AI agent's own chat interface.
- **Terminal** (✅ in the Terminal column): run as `workspace-sync <command>` with **no** leading slash, e.g. `workspace-sync status`, `workspace-sync setup`. A slash-prefixed form typed into PowerShell/Bash is not a valid command and will fail.
- **Agent-only rows** (❌ in Terminal): `workspace-sync-investigation` and the three remote debug/compare skills have no terminal equivalent — they drive read-only analysis over MCP and exist **exclusively** inside the agent, by design (they need live agent reasoning over multiple tool calls, not a single CLI invocation).

📖 Full syntax, arguments, options, and examples for every terminal command live in **[docs/COMMANDS.md](docs/COMMANDS.md)**.

---

## 📚 Documentation Links

- **Full Command Reference:** [docs/COMMANDS.md](docs/COMMANDS.md)
- **Developer & Architecture Docs:** [docs/DEVELOPER.md](docs/DEVELOPER.md)
- **Contribution Guide:** [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- **License:** [MIT License](LICENSE)

---

## 🤝 Contributing

Contributions are welcome! If you would like to help improve WorkspaceSync, please check out the step-by-step guide in [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) to learn how to fork, clone, set up, test, and open a Pull Request.

Have an idea, suggestion, or feature request? We'd love to hear it — feel free to open a GitHub Issue or start a Discussion.
