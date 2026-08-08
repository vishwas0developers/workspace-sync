import * as fs from "fs";
import * as path from "path";
import {
  WorkspaceSchema, Workspace,
  ProjectsSchema, Projects,
  EnvironmentsSchema, Environments,
  PoliciesSchema, Policies, Policy
} from "./schema";

export interface FullConfig {
  workspace: Workspace;
  projects: Projects;
  environments: Environments;
  policies: Policies;
}

export function getConfigDir(cwd: string = process.cwd()): string {
  // Config directory .workspace-sync relative to CWD
  return path.join(cwd, ".workspace-sync");
}

export function loadConfig(cwd: string = process.cwd()): FullConfig {
  const configDir = getConfigDir(cwd);

  if (!fs.existsSync(configDir)) {
    throw new Error(`Configuration directory not found at: ${configDir}\nPlease run 'workspace-sync init' first.`);
  }

  const workspacePath = path.join(configDir, "workspace.json");
  const projectsPath = path.join(configDir, "projects.json");
  const environmentsPath = path.join(configDir, "environments.json");
  const policiesPath = path.join(configDir, "policies.json");

  // Read files with fallback/errors
  if (!fs.existsSync(workspacePath)) {
    throw new Error(`Config file missing: ${workspacePath}`);
  }
  const workspaceData = JSON.parse(fs.readFileSync(workspacePath, "utf-8"));
  const workspace = WorkspaceSchema.parse(workspaceData);

  const projects = fs.existsSync(projectsPath)
    ? ProjectsSchema.parse(JSON.parse(fs.readFileSync(projectsPath, "utf-8")))
    : {};

  const environments = fs.existsSync(environmentsPath)
    ? EnvironmentsSchema.parse(JSON.parse(fs.readFileSync(environmentsPath, "utf-8")))
    : {};

  const policies = fs.existsSync(policiesPath)
    ? PoliciesSchema.parse(JSON.parse(fs.readFileSync(policiesPath, "utf-8")))
    : {};

  // For any projects without explicit policies, fill default policy
  const finalPolicies: Policies = { ...policies };
  for (const prjName of Object.keys(projects)) {
    if (!finalPolicies[prjName]) {
      finalPolicies[prjName] = {
        readLocal: true,
        writeLocal: true,
        readTesting: true,
        writeTesting: false,
        readProduction: true,
        writeProduction: false,
      };
    }
  }

  return {
    workspace,
    projects,
    environments,
    policies: finalPolicies,
  };
}

export function saveConfig(config: Partial<FullConfig>, cwd: string = process.cwd()): void {
  const configDir = getConfigDir(cwd);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (config.workspace) {
    fs.writeFileSync(
      path.join(configDir, "workspace.json"),
      JSON.stringify(config.workspace, null, 2),
      "utf-8"
    );
  }
  if (config.projects) {
    fs.writeFileSync(
      path.join(configDir, "projects.json"),
      JSON.stringify(config.projects, null, 2),
      "utf-8"
    );
  }
  if (config.environments) {
    fs.writeFileSync(
      path.join(configDir, "environments.json"),
      JSON.stringify(config.environments, null, 2),
      "utf-8"
    );
  }
  if (config.policies) {
    fs.writeFileSync(
      path.join(configDir, "policies.json"),
      JSON.stringify(config.policies, null, 2),
      "utf-8"
    );
  }
}
