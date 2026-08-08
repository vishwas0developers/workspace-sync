import * as fs from "fs";
import * as path from "path";

// Generic implementation to copy skills metadata and write target MCP server references to the current workspace configuration
export function installWorkspaceSync(targetDir: string = process.cwd()): void {
  const mcpConfigPath = path.join(targetDir, ".vscode", "mcp.json");
  const mcpDir = path.dirname(mcpConfigPath);

  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true });
  }

  // Load existing or initialize mcp config
  let mcpConfig: any = { mcpServers: {} };
  if (fs.existsSync(mcpConfigPath)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
    } catch {
      // Empty config
    }
  }

  if (!mcpConfig.mcpServers) {
    mcpConfig.mcpServers = {};
  }

  // Register stdio MCP tool mapping using global bin or npx wrapper
  mcpConfig.mcpServers["workspace-sync"] = {
    type: "stdio",
    command: "workspace-sync",
    args: ["mcp"],
  };

  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
  console.log(`✓ Configured VS Code workspace MCP: ${mcpConfigPath}`);

  // Clean up the old monolithic skill if it exists
  const oldSkillDir = path.join(targetDir, ".agents", "skills", "workspace-sync");
  const oldSkillFile = path.join(oldSkillDir, "SKILL.md");
  if (fs.existsSync(oldSkillFile)) {
    try {
      fs.unlinkSync(oldSkillFile);
      fs.rmdirSync(oldSkillDir);
    } catch {
      // Ignore if folder not empty or unlink fails
    }
  }

  // Define modular skills to deploy
  const skills = [
    {
      name: "workspace-sync-project-management",
      content: `---
name: workspace-sync-project-management
description: "Manage workspace projects: register, rename, or remove projects, check configuration status."
---

# WorkspaceSync Project Management Skill

Use this skill when managing the workspace configuration and projects registry.

## When to Use
- Registering a new project (\`workspace-sync add-project\`).
- Removing an existing project (\`workspace-sync remove-project\`).
- Renaming a registered project (\`workspace-sync rename-project\`).
- Checking local status and registered environments (\`workspace-sync status\`).

## Safety Rules
- \`remove-project\` is fail-closed. Ensure you provide the exact resolved project name.
- Non-existent or empty project target will abort and make no changes. No wildcards allowed.
- Displays the target project name and path before requesting confirmation.
`
    },
    {
      name: "workspace-sync-inspect-testing",
      content: `---
name: workspace-sync-inspect-testing
description: "Inspect files, logs, processes, or Git status on the Testing VPS environment."
---

# WorkspaceSync Testing Inspection Skill

Use this skill when inspecting the Testing VPS environment for a project.

## When to Use
- Fetching Testing logs (\`remote_logs\` on testing).
- Inspecting directories and files on Testing VPS (\`remote_tree\`, \`remote_file_read\` on testing).
- Checking active processes or services on Testing VPS (\`remote_processes\`, \`remote_services\` on testing).
- Viewing git status on Testing VPS (\`remote_git_status\` on testing).

## Required MCP Tools
- \`remote_tree\`
- \`remote_file_read\`
- \`remote_git_status\`
- \`remote_logs\`
- \`remote_services\`
- \`remote_processes\`

## Safety Rules
- **Zero Write Policy**: Testing is strictly read-only. Never run mutate commands or execute restarts.
`
    },
    {
      name: "workspace-sync-inspect-production",
      content: `---
name: workspace-sync-inspect-production
description: "Inspect files, logs, processes, or Git status on the Production VPS environment."
---

# WorkspaceSync Production Inspection Skill

Use this skill when inspecting the Production VPS environment for a project.

## When to Use
- Fetching Production logs (\`remote_logs\` on production).
- Inspecting directories and files on Production VPS (\`remote_tree\`, \`remote_file_read\` on production).
- Checking active processes or services on Production VPS (\`remote_processes\`, \`remote_services\` on production).
- Viewing git status on Production VPS (\`remote_git_status\` on production).

## Required MCP Tools
- \`remote_tree\`
- \`remote_file_read\`
- \`remote_git_status\`
- \`remote_logs\`
- \`remote_services\`
- \`remote_processes\`

## Safety Rules
- **Zero Write Policy**: Production is strictly read-only. Never run mutate commands or execute restarts.
`
    },
    {
      name: "workspace-sync-compare-environments",
      content: `---
name: workspace-sync-compare-environments
description: "Compare Git revisions and commits between local, testing, and production environments."
---

# WorkspaceSync Environment Comparison Skill

Use this skill when comparing commits or checking deployment synchronicity across environments.

## When to Use
- Comparing Git commit hashes across local repository, Testing VPS, and Production VPS (\`compare_environments\`).
- Fetching current deployed Git revision on a remote environment (\`remote_git_revision\`).

## Required MCP Tools
- \`compare_environments\`
- \`remote_git_revision\`
`
    }
  ];

  for (const skill of skills) {
    const skillDir = path.join(targetDir, ".agents", "skills", skill.name);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill.content.trim() + "\n", "utf-8");
    console.log(`✓ Skill configured at: ${skillDir}`);
  }
}
