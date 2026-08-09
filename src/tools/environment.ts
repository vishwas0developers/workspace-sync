import { FullConfig } from "../config/loader";
import { enforcePermission } from "../security/permissions";
import { executeAllowed } from "../ssh/client";
import { normalizeRemoteRoot } from "../security/path-guard";
import { shellQuote } from "../security/command-guard";
import { getProject } from "./workspace";

export function listEnvironments(config: FullConfig, projectName: string) {
  const prj = getProject(config, projectName);
  return Object.entries(prj.environments)
    .filter(([_, data]) => data !== null)
    .map(([env, data]) => ({
      environment: env,
      sshAliasOrHost: data!.sshAliasOrHost,
      remotePath: data!.remotePath,
    }));
}

export function getEnvironment(config: FullConfig, projectName: string, environment: "testing" | "production") {
  const prj = getProject(config, projectName);
  const envData = prj.environments[environment];

  if (!envData) {
    throw new Error(`Environment '${environment}' is not configured for project '${projectName}'.`);
  }

  return {
    project: projectName,
    environment,
    sshAliasOrHost: envData.sshAliasOrHost,
    remotePath: envData.remotePath,
    policy: environment === "testing" ? prj.policy.readTesting : prj.policy.readProduction,
  };
}

// One revision lookup's outcome. Distinguishing these states (rather than collapsing
// everything into "not_configured") is the fix for the bug that misdirected an
// investigation: a reachable host whose git command failed was previously reported
// identically to an environment that was never linked at all.
type RevisionState =
  | { status: "not_configured" }
  | { status: "unreachable"; detail: string }
  | { status: "not_a_git_repo"; detail: string }
  | { status: "error"; detail: string }
  | { status: "ok"; revision: string };

async function probeRevision(
  env: { sshAliasOrHost: string; remotePath: string } | undefined
): Promise<RevisionState> {
  if (!env) return { status: "not_configured" };

  const root = normalizeRemoteRoot(env.remotePath);
  try {
    const res = await executeAllowed(env.sshAliasOrHost, `git -C ${shellQuote(root)} rev-parse HEAD`);
    if (res.code === 0) return { status: "ok", revision: res.stdout };
    if (/not a git repository/i.test(res.stderr)) {
      return { status: "not_a_git_repo", detail: `'${root}' is not a Git repository root.` };
    }
    return { status: "error", detail: res.stderr || "unknown error" };
  } catch (err: any) {
    return { status: "unreachable", detail: err.message };
  }
}

function describe(state: RevisionState): string {
  switch (state.status) {
    case "not_configured": return "not_configured";
    case "unreachable": return `unreachable: ${state.detail}`;
    case "not_a_git_repo": return `not_a_git_repo: ${state.detail}`;
    case "error": return `error: ${state.detail}`;
    case "ok": return state.revision;
  }
}

export async function compareEnvironments(
  config: FullConfig,
  projectName: string
): Promise<{ testingRevision: string; productionRevision: string; diffMessage: string }> {
  const prj = getProject(config, projectName);
  const policy = config.policies[projectName];
  if (!policy) {
    throw new Error(`Policy not configured for project '${projectName}'.`);
  }

  const testingEnv = prj.environments.testing;
  const productionEnv = prj.environments.production;

  // Previously this function read both environments unconditionally, bypassing the
  // readTesting/readProduction policy every other remote tool respects. Only probe an
  // environment the caller is actually permitted to read; treat a policy-denied
  // environment as its own distinct state rather than silently skipping it.
  const testingState: RevisionState = testingEnv
    ? policy.readTesting
      ? await probeRevision(testingEnv)
      : { status: "error", detail: "Permission Denied: readTesting is not allowed by policy." }
    : { status: "not_configured" };

  const productionState: RevisionState = productionEnv
    ? policy.readProduction
      ? await probeRevision(productionEnv)
      : { status: "error", detail: "Permission Denied: readProduction is not allowed by policy." }
    : { status: "not_configured" };

  const testingRevision = describe(testingState);
  const productionRevision = describe(productionState);

  let diffMessage: string;
  if (testingState.status === "not_configured" && productionState.status === "not_configured") {
    diffMessage = "Comparison needs both Testing and Production environments configured.";
  } else if (testingState.status === "not_configured" || productionState.status === "not_configured") {
    diffMessage = `Only one environment is configured (${testingState.status === "not_configured" ? "Production" : "Testing"} only) — nothing to compare against.`;
  } else if (testingState.status !== "ok" || productionState.status !== "ok") {
    diffMessage = `Cannot compare revisions: Testing=${testingRevision}; Production=${productionRevision}.`;
  } else if (testingState.revision === productionState.revision) {
    diffMessage = "Testing and Production are synchronized (same Git revision).";
  } else {
    diffMessage = `Testing (${testingState.revision.substring(0, 7)}) differs from Production (${productionState.revision.substring(0, 7)}).`;
  }

  return { testingRevision, productionRevision, diffMessage };
}
