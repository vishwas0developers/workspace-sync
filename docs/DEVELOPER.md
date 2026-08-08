# WorkspaceSync Developer Documentation

This document contains the technical architecture, internal implementation details, MCP protocols, and development references for WorkspaceSync.

---

## Technical Architecture

```
┌───────────────────────────────────────────────────────────┐
│                     Developer Machine                      │
│                                                           │
│  ┌─────────────┐    stdio    ┌──────────────────────────┐ │
│  │  AI Agent   │◄──────────►│  workspace-sync MCP      │ │
│  │  (VS Code / │            │  server (Node.js)        │ │
│  │  Claude /   │            │                          │ │
│  │  Cline etc) │            │  ┌────────────────────┐  │ │
│  └─────────────┘            │  │ .workspace-sync/   │  │ │
│                             │  │  workspace.json    │  │ │
│  ┌─────────────┐            │  │  projects.json     │  │ │
│  │    CLI      │──writes───►│  │  environments.json │  │ │
│  │  workspace- │            │  │  policies.json     │  │ │
│  │  sync init  │            │  │  .undo.json        │  │ │
│  └─────────────┘            │  │  AGENT_MEMORY.md   │  │ │
│                             │  │  logs/             │  │ │
│                             │  └────────────────────┘  │ │
│                             │                          │ │
│                             │  Security Layer:         │ │
│                             │  ✓ enforcePermission()   │ │
│                             │  ✓ redactSecrets()       │ │
│                             │  ✓ resolveSafePath()     │ │
│                             └──────────┬───────────────┘ │
│                                        │ system ssh       │
└────────────────────────────────────────┼──────────────────┘
                                         │ (reads ~/.ssh/config)
                              ┌──────────┴──────────┐
                              │  ~/.ssh/config       │
                              │  SSH Agent           │
                              └──────────┬──────────┘
                              ┌──────────┴──────────┐
                              │   Testing VPS        │
                              │   Production VPS     │
                              └─────────────────────┘
```

The CLI writes configuration files to `.workspace-sync/`. The stdio MCP server parses these files at runtime and exposes safe tools to AI agents. Security enforcement acts as a middleware wrapping all operations, ensuring:
- Strictly read-only SSH commands.
- Directory isolation checks on remote path parameters.
- Automatic filtering and regex-based redaction of secrets in command execution logs.

---

## Configuration Reference

Configuration files are located in `.workspace-sync/` in the workspace root.

### `workspace.json`
```json
{
  "schemaVersion": 1,
  "name": "ITI-Career"
}
```

### `projects.json`
```json
{
  "admin": {
    "localPath": "./1.admin-iticareer.kdhakar.com",
    "git": "https://github.com/org/admin.git"
  }
}
```

### `environments.json`
```json
{
  "admin": {
    "testing": {
      "sshAliasOrHost": "my-testing-vps",
      "remotePath": "/var/www/admin"
    }
  }
}
```

### `policies.json`
```json
{
  "admin": {
    "readLocal": true,
    "writeLocal": true,
    "readTesting": true,
    "writeTesting": false,
    "readProduction": true,
    "writeProduction": false
  }
}
```

### `.undo.json`
Stores the single-step backup configuration and operation details before executing any state changes. Cleared automatically upon execution of the `undo` command.
```json
{
  "timestamp": "2026-08-08T09:30:00.000Z",
  "operation": "remove-project",
  "description": "Remove project \"admin\"",
  "config": {
    "workspace": { "schemaVersion": 1, "name": "ITI-Career" },
    "projects": {},
    "environments": {},
    "policies": {}
  }
}
```

---

## MCP Tools Protocol & Implementation

The stdio MCP server defines the following schemas for request handling:

### Tools List

- `workspace_context`: Retrieves the overall projects and environments registry map.
- `workspace_undo`: Restores the previous config state from `.undo.json` atomically.
- `local_git_status`: Checks current branch and revision hashes locally.
- `compare_environments`: Formulates Git commit differences between VPS environments.
- `remote_tree` / `remote_file_read`: Safe read-only file system operations on the remote target.
- `remote_logs` / `remote_services` / `remote_processes`: Runs diagnostic tools on the VPS.

### Stdio Communication

Communication is done over standard I/O (stdin/stdout) wrapping JSON-RPC 2.0 payloads structured using the Model Context Protocol SDK.

---

## Secrets Redaction & Audit Logging

Every execution runs through `redactSecrets()` which cleans arguments of patterns matching private keys, passwords, and tokens before appending the output entry to `logs/audit-YYYY-MM-DD.jsonl`.

---

## Development

### Local Build
```bash
npm install
npm run build
```

### Tests
Runs the Node.js test runner against compiled test suites:
```bash
node --test dist/src/test/remove-project.test.js dist/src/test/undo.test.js
```
