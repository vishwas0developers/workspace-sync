import { execFile } from "child_process";
import * as path from "path";

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr.trim() || error.message));
      }
      resolve(stdout.trim());
    });
  });
}

export interface GitInfo {
  branch: string;
  revision: string;
  status: string;
  remoteUrl: string;
  isDirty: boolean;
  /** True when `git status`/`revision` resolved through an *enclosing* repository
   * rather than one rooted at the project's own path — e.g. a project directory with
   * no `.git` of its own, sitting inside a monorepo checkout one level up. Reported
   * explicitly rather than silently, since the git info in that case describes the
   * whole monorepo's state, not this project's. */
  belongsToEnclosingRepo: boolean;
  gitRoot: string;
}

export async function getLocalGitInfo(projectPath: string, workspaceRoot: string): Promise<GitInfo> {
  // Resolve absolute path
  const absolutePath = path.isAbsolute(projectPath)
    ? projectPath
    : path.resolve(workspaceRoot, projectPath);

  try {
    const gitRootPromise = runGit(["rev-parse", "--show-toplevel"], absolutePath);
    const branchPromise = runGit(["rev-parse", "--abbrev-ref", "HEAD"], absolutePath);
    const revisionPromise = runGit(["rev-parse", "HEAD"], absolutePath);
    const statusPromise = runGit(["status", "--porcelain"], absolutePath);
    const remotePromise = runGit(["remote", "get-url", "origin"], absolutePath).catch(() => "none");

    const [gitRoot, branch, revision, statusRaw, remoteUrl] = await Promise.all([
      gitRootPromise,
      branchPromise,
      revisionPromise,
      statusPromise,
      remotePromise,
    ]);

    const isDirty = statusRaw.length > 0;
    const normalizedRoot = path.resolve(gitRoot);
    const belongsToEnclosingRepo = normalizedRoot !== path.resolve(absolutePath);

    return {
      branch,
      revision,
      status: statusRaw || "Clean",
      remoteUrl,
      isDirty,
      belongsToEnclosingRepo,
      gitRoot: normalizedRoot,
    };
  } catch (err: any) {
    throw new Error(`Failed to read Git info for path '${projectPath}': ${err.message}`);
  }
}
