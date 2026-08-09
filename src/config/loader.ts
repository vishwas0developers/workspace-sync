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

// Detects on-disk config using a field name from a prior schema version, without going
// through the zod schema (which already normalizes it in memory on every load — this
// checks the RAW file so callers can decide whether a migration write is actually needed,
// rather than rewriting the file unconditionally on every run).
//
// Currently detects: `sshAlias` (renamed to `sshAliasOrHost`). Add further checks here as
// the schema evolves — each one purely additive, so old configs never need multiple hops.
export function configHasLegacyFields(cwd: string = process.cwd()): boolean {
  const environmentsPath = path.join(getConfigDir(cwd), "environments.json");
  if (!fs.existsSync(environmentsPath)) return false;

  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(environmentsPath, "utf-8"));
  } catch {
    return false; // Unparseable — loadConfig() will surface this as a real error elsewhere.
  }

  for (const projectEnvs of Object.values(raw) as any[]) {
    for (const envKey of ["testing", "production"]) {
      const env = projectEnvs?.[envKey];
      if (env && typeof env === "object" && "sshAlias" in env && !("sshAliasOrHost" in env)) {
        return true;
      }
    }
  }
  return false;
}

// Migrates on-disk config to the current schema by round-tripping it through
// loadConfig (which normalizes legacy field names) and saveConfig (which persists the
// normalized shape). Safe to call unconditionally: a no-op when nothing needs migrating,
// since the round-trip is idempotent — but callers should still prefer to check
// configHasLegacyFields() first so they only report/write when something actually changed.
export function migrateConfig(cwd: string = process.cwd()): void {
  const config = loadConfig(cwd);
  saveConfig(config, cwd);
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
