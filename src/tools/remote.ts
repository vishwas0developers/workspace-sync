import * as path from "path";
import { FullConfig } from "../config/loader";
import { enforcePermission, PermissionType } from "../security/permissions";
import { resolveSafePath } from "../security/path-guard";
import { redactSecrets } from "../security/redact";
import { executeSSHCommand } from "../ssh/client";
import { getEnvironment } from "./environment";

// Guard helper to validate permissions and settings
function getRemoteConfig(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  requiredPermission: PermissionType
) {
  const env = getEnvironment(config, projectName, environment);
  const policy = config.policies[projectName];

  if (!policy) {
    throw new Error(`Policy not configured for project '${projectName}'.`);
  }

  enforcePermission(projectName, policy, requiredPermission);
  return env;
}

export async function remoteTree(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, environment === "testing" ? "readTesting" : "readProduction");
  
  // Scoped read of directory structure (depth 2 for sanity, list files)
  const result = await executeSSHCommand(
    env.sshAlias,
    `find "${env.remotePath}" -maxdepth 2 -not -path '*/.*'`
  );

  if (result.code !== 0) {
    throw new Error(`Failed to list remote tree: ${result.stderr}`);
  }

  // Normalize absolute remotePath to relative for output readability
  const lines = result.stdout.split("\n");
  const relativeLines = lines.map(line => {
    if (line.startsWith(env.remotePath)) {
      return "." + line.substring(env.remotePath.length);
    }
    return line;
  });

  return relativeLines.join("\n");
}

export async function remoteFileRead(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  filePath: string
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, environment === "testing" ? "readTesting" : "readProduction");
  
  // Extension and name denylist to protect credentials/keys
  const fileName = path.basename(filePath).toLowerCase();
  const denylist = [".env", ".key", ".pem", ".p12", ".pfx", "id_rsa", "id_ed25519", "id_ecdsa", ".crt"];
  const isBlocked = denylist.some(blocked => fileName === blocked || fileName.endsWith(blocked));

  if (isBlocked) {
    throw new Error(`Access Denied: File '${filePath}' is blocked under the credential security denylist.`);
  }

  // Guard path traversal
  const safeRemotePath = resolveSafePath(env.remotePath, filePath);

  const result = await executeSSHCommand(
    env.sshAlias,
    `cat "${safeRemotePath}"`
  );

  if (result.code !== 0) {
    throw new Error(`Failed to read remote file: ${result.stderr}`);
  }

  // Redact secrets
  return redactSecrets(result.stdout);
}

export async function remoteGitStatus(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, environment === "testing" ? "readTesting" : "readProduction");
  
  const result = await executeSSHCommand(
    env.sshAlias,
    `cd "${env.remotePath}" && git status --porcelain`
  );

  if (result.code !== 0) {
    throw new Error(`Failed to inspect remote Git status: ${result.stderr}`);
  }

  return result.stdout || "Clean";
}

export async function remoteGitRevision(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, environment === "testing" ? "readTesting" : "readProduction");

  const result = await executeSSHCommand(
    env.sshAlias,
    `cd "${env.remotePath}" && git rev-parse HEAD`
  );

  if (result.code !== 0) {
    throw new Error(`Failed to fetch remote Git revision: ${result.stderr}`);
  }

  return result.stdout;
}

export async function remoteLogs(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  service: string,
  limit: number = 200
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, environment === "testing" ? "readTesting" : "readProduction");

  // Scoped log fetch command (supports journalctl, pm2, docker, fallback tailing file)
  let cmd = "";
  if (service === "syslog") {
    cmd = `tail -n ${limit} /var/log/syslog`;
  } else if (service.startsWith("pm2:")) {
    const pm2App = service.split(":")[1];
    cmd = `pm2 logs ${pm2App} --lines ${limit} --nostream`;
  } else if (service.startsWith("docker:")) {
    const container = service.split(":")[1];
    cmd = `docker logs --tail ${limit} ${container}`;
  } else {
    // Default journalctl unit logs
    cmd = `journalctl -u ${service} -n ${limit} --no-pager`;
  }

  const result = await executeSSHCommand(env.sshAlias, cmd);
  if (result.code !== 0) {
    throw new Error(`Failed to fetch logs: ${result.stderr}`);
  }

  return redactSecrets(result.stdout);
}

export async function remoteServices(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, environment === "testing" ? "readTesting" : "readProduction");

  // System status check: systemctl listing + pm2 if available
  const result = await executeSSHCommand(
    env.sshAlias,
    `systemctl list-units --type=service --state=running --no-pager | head -n 40 && which pm2 >/dev/null && pm2 list || true`
  );

  if (result.code !== 0) {
    throw new Error(`Failed to read remote services status: ${result.stderr}`);
  }

  return redactSecrets(result.stdout);
}

export async function remoteProcesses(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, environment === "testing" ? "readTesting" : "readProduction");

  // Ps command filtered to exclude kernel threads and reduce context size
  const result = await executeSSHCommand(
    env.sshAlias,
    `ps aux --sort=-%cpu | grep -v "\\[" | head -n 50`
  );

  if (result.code !== 0) {
    throw new Error(`Failed to read remote processes: ${result.stderr}`);
  }

  return redactSecrets(result.stdout);
}
