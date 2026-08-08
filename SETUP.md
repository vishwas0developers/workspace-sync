# WorkspaceSync Setup Guide

This guide provides complete, step-by-step instructions for installing, configuring, and verifying WorkspaceSync in your development environment.

---

## 1. Prerequisites

Before installing WorkspaceSync, ensure your environment meets the following requirements:

| Component | Required Version | Verification Command |
|---|---|---|
| **Node.js** | `18+` | `node --version` |
| **npm** | `9+` | `npm --version` |
| **Git** | Any version | `git --version` |
| **System SSH** | Standard SSH client | `ssh -V` |

> [!NOTE]
> **Windows Users**: An active SSH agent (such as OpenSSH for Windows or Pageant) is required. The system `ssh` binary must be available on your system PATH.

---

## 2. Installation

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

## 3. First-Time Setup & Workflow

Follow these steps in your workspace root directory:

### Step 1: Initialize Workspace
Navigate to your workspace root directory and initialize the `.workspace-sync/` configuration folder:
```bash
cd "/path/to/your-workspace"
workspace-sync init --name "MyWorkspace"
```

### Step 2: Register Local Projects
Add local project directories to WorkspaceSync tracking:
```bash
workspace-sync add-project "admin" "./admin-panel" -g "https://github.com/org/admin.git"
workspace-sync add-project "api" "./api-service" -g "https://github.com/org/api.git"
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
