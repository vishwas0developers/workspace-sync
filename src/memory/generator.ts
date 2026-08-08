import * as fs from "fs";
import * as path from "path";
import { FullConfig, getConfigDir } from "../config/loader";

export function generateAgentMemory(config: FullConfig, cwd: string = process.cwd()): void {
  const configDir = getConfigDir(cwd);
  const memoryPath = path.join(configDir, "AGENT_MEMORY.md");

  const projectSections = Object.entries(config.projects).map(([name, prj]) => {
    const envs = config.environments[name] || {};
    const policy = config.policies[name] || {
      readLocal: true,
      writeLocal: true,
      readTesting: true,
      writeTesting: false,
      readProduction: true,
      writeProduction: false,
    };

    const testingDetails = envs.testing
      ? `${envs.testing.sshAlias}:${envs.testing.remotePath} (Policy: readTesting=${policy.readTesting}, writeTesting=${policy.writeTesting})`
      : "not configured";

    const productionDetails = envs.production
      ? `${envs.production.sshAlias}:${envs.production.remotePath} (Policy: readProduction=${policy.readProduction}, writeProduction=${policy.writeProduction})`
      : "not configured";

    return `
### Project: ${name}
- **Map Chain**: LOCAL (${prj.localPath}) → GIT (${prj.git || "none"}) → TESTING (${envs.testing ? envs.testing.sshAlias : "none"}) → PRODUCTION (${envs.production ? envs.production.sshAlias : "none"})
- **Local Path**: \`${prj.localPath}\`
- **Git Repo**: \`${prj.git || "none"}\`
- **Testing Link**: \`${testingDetails}\`
- **Production Link**: \`${productionDetails}\`
`;
  }).join("\n");

  const content = `# Workspace Context

## Workspace
- **Name**: ${config.workspace.name}
- **Root Path**: ${path.resolve(cwd)}
- **Schema Version**: ${config.workspace.schemaVersion}

## Projects Map Context
${projectSections || "No projects configured yet."}

## Agent Directives: Progressive Disclosure Context Loading
You must load context and files progressively:
1. **Minimal Initial Context**: Start by calling \`workspace_context\` to load the workspace, projects, and environments layout.
2. **Identify Task-Specific Skill**: Only load the specific skill that matches the current operation:
   - For project registration, deletion, or renaming: load only \`workspace-sync-project-management\`.
   - For Testing VPS inspection: load only \`workspace-sync-inspect-testing\`.
   - For Production VPS inspection: load only \`workspace-sync-inspect-production\`.
   - For environment comparison: load only \`workspace-sync-compare-environments\`.
3. **No Automatic Reading**: Never automatically read \`README.md\`, other markdown files, entire directory trees, or unrelated skill files on startup.
4. **Targeted Investigations**: Only open, read, or inspect source code files, logs, or schemas when explicitly required to fulfill the active task.
`;

  fs.writeFileSync(memoryPath, content.trim() + "\n", "utf-8");
}
