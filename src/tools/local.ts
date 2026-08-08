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
}

export async function getLocalGitInfo(projectPath: string, workspaceRoot: string): Promise<GitInfo> {
  // Resolve absolute path
  const absolutePath = path.isAbsolute(projectPath)
    ? projectPath
    : path.resolve(workspaceRoot, projectPath);

  try {
    const branchPromise = runGit(["rev-parse", "--abbrev-ref", "HEAD"], absolutePath);
    const revisionPromise = runGit(["rev-parse", "HEAD"], absolutePath);
    const statusPromise = runGit(["status", "--porcelain"], absolutePath);
    const remotePromise = runGit(["remote", "get-url", "origin"], absolutePath).catch(() => "none");

    const [branch, revision, statusRaw, remoteUrl] = await Promise.all([
      branchPromise,
      revisionPromise,
      statusPromise,
      remotePromise,
    ]);

    const isDirty = statusRaw.length > 0;

    return {
      branch,
      revision,
      status: statusRaw || "Clean",
      remoteUrl,
      isDirty,
    };
  } catch (err: any) {
    throw new Error(`Failed to read Git info for path '${projectPath}': ${err.message}`);
  }
}
