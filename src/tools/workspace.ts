import * as fs from "fs";
import * as path from "path";
import { FullConfig } from "../config/loader";

// Detects the project's own `.git` directory at its configured localPath. Previously
// `git` was always reported as "none" (schema.ts has no such field and nothing ever
// populated it at runtime), which misled agents into treating version-controlled
// projects — like 1.admin-iticareer.kdhakar.com, which does have its own repo — as
// unmanaged.
function detectLocalGit(localPath: string): string {
  try {
    const resolved = path.isAbsolute(localPath) ? localPath : path.resolve(process.cwd(), localPath);
    return fs.existsSync(path.join(resolved, ".git")) ? "detected" : "none";
  } catch {
    return "none";
  }
}

export interface ProjectInfo {
  name: string;
  localPath: string;
  git: string;
  environments: {
    testing: string | null;
    production: string | null;
  };
}

export function workspaceInfo(config: FullConfig) {
  return {
    name: config.workspace.name,
    schemaVersion: config.workspace.schemaVersion,
    projectCount: Object.keys(config.projects).length,
    workspaceRoot: process.cwd(),
  };
}

export function listProjects(config: FullConfig): ProjectInfo[] {
  return Object.entries(config.projects).map(([name, prj]) => {
    const envs = config.environments[name] || {};
    return {
      name,
      localPath: prj.localPath,
      git: prj.git || detectLocalGit(prj.localPath),
      environments: {
        testing: envs.testing ? envs.testing.sshAliasOrHost : null,
        production: envs.production ? envs.production.sshAliasOrHost : null,
      },
    };
  });
}

export function getProject(config: FullConfig, projectName: string) {
  const prj = config.projects[projectName];
  if (!prj) {
    throw new Error(`Project '${projectName}' not found in workspace configuration.`);
  }

  const envs = config.environments[projectName] || {};
  const policy = config.policies[projectName] || {};

  return {
    name: projectName,
    localPath: prj.localPath,
    git: prj.git || "none",
    environments: {
      testing: envs.testing ? { sshAliasOrHost: envs.testing.sshAliasOrHost, remotePath: envs.testing.remotePath } : null,
      production: envs.production ? { sshAliasOrHost: envs.production.sshAliasOrHost, remotePath: envs.production.remotePath } : null,
    },
    policy: {
      readLocal: policy.readLocal,
      writeLocal: policy.writeLocal,
      readTesting: policy.readTesting,
      writeTesting: policy.writeTesting,
      readProduction: policy.readProduction,
      writeProduction: policy.writeProduction,
    },
  };
}

export function workspaceContext(config: FullConfig) {
  const projectsList = Object.keys(config.projects).map((name) => getProject(config, name));
  return {
    workspace: {
      name: config.workspace.name,
      schemaVersion: config.workspace.schemaVersion,
      workspaceRoot: process.cwd(),
      projectCount: projectsList.length,
    },
    projects: projectsList,
  };
}
