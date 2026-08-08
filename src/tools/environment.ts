import { FullConfig } from "../config/loader";
import { executeSSHCommand } from "../ssh/client";
import { getProject } from "./workspace";

export function listEnvironments(config: FullConfig, projectName: string) {
  const prj = getProject(config, projectName);
  return Object.entries(prj.environments)
    .filter(([_, data]) => data !== null)
    .map(([env, data]) => ({
      environment: env,
      sshAlias: data!.sshAlias,
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
    sshAlias: envData.sshAlias,
    remotePath: envData.remotePath,
    policy: environment === "testing" ? prj.policy.readTesting : prj.policy.readProduction,
  };
}

export async function compareEnvironments(
  config: FullConfig,
  projectName: string
): Promise<{ testingRevision: string; productionRevision: string; diffMessage: string }> {
  const prj = getProject(config, projectName);
  const testing = prj.environments.testing;
  const production = prj.environments.production;

  let testingRevision = "not_configured";
  let productionRevision = "not_configured";

  if (testing) {
    try {
      const res = await executeSSHCommand(
        testing.sshAlias,
        `cd "${testing.remotePath}" && git rev-parse HEAD`
      );
      if (res.code === 0) testingRevision = res.stdout;
    } catch {
      testingRevision = "unreachable";
    }
  }

  if (production) {
    try {
      const res = await executeSSHCommand(
        production.sshAlias,
        `cd "${production.remotePath}" && git rev-parse HEAD`
      );
      if (res.code === 0) productionRevision = res.stdout;
    } catch {
      productionRevision = "unreachable";
    }
  }

  let diffMessage = "";
  if (testingRevision === "unreachable" || productionRevision === "unreachable") {
    diffMessage = "Cannot compare revisions due to unreachable environment(s).";
  } else if (testingRevision === "not_configured" || productionRevision === "not_configured") {
    diffMessage = "Comparison needs both Testing and Production environments configured.";
  } else if (testingRevision === productionRevision) {
    diffMessage = "Testing and Production are synchronized (same Git revision).";
  } else {
    diffMessage = `Testing (${testingRevision.substring(0, 7)}) differs from Production (${productionRevision.substring(0, 7)}).`;
  }

  return {
    testingRevision,
    productionRevision,
    diffMessage,
  };
}
