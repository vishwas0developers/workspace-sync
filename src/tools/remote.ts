import * as posix from "path/posix";
import { FullConfig } from "../config/loader";
import { enforcePermission, PermissionType } from "../security/permissions";
import { resolveSafePath, normalizeRemoteRoot } from "../security/path-guard";
import { shellQuote, assertSafeIdentifier, assertPositiveInt, CommandRejectedError } from "../security/command-guard";
import { redactSecrets } from "../security/redact";
import { executeAllowed } from "../ssh/client";
import { getEnvironment } from "./environment";

const MAX_TREE_LINES = 500;
const MAX_FILE_READ_BYTES = 2 * 1024 * 1024; // 2 MB — generous for source/config, refuses binaries/archives.
const MAX_LOG_LIMIT = 5000;

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

function permissionFor(environment: "testing" | "production"): PermissionType {
  return environment === "testing" ? "readTesting" : "readProduction";
}

export async function remoteTree(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  options: { path?: string; depth?: number; showHidden?: boolean } = {}
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, permissionFor(environment));
  const root = normalizeRemoteRoot(env.remotePath);
  const target = options.path ? resolveSafePath(root, options.path) : root;
  const depth = assertPositiveInt(options.depth ?? 2, "depth", 6);
  const hiddenFilter = options.showHidden ? "" : `-not -path '*/.*'`;

  const result = await executeAllowed(
    env.sshAliasOrHost,
    `find ${shellQuote(target)} -maxdepth ${depth} ${hiddenFilter}`.trim()
  );

  if (result.code !== 0) {
    throw new Error(`Failed to list remote tree at '${target}': ${result.stderr || "unknown error"}`);
  }

  // Normalize absolute remotePath to relative for output readability, and preserve
  // the separator (previous version dropped it, producing paths that could never be
  // fed back into remote_file_read: ".git" -> ".<remotePath-with-trailing-slash>").
  const rootWithSep = root.endsWith("/") ? root : root + "/";
  let lines = result.stdout.split("\n").map((line) => {
    if (line === root) return ".";
    if (line.startsWith(rootWithSep)) return "./" + line.substring(rootWithSep.length);
    return line;
  });

  let truncated = "";
  if (lines.length > MAX_TREE_LINES) {
    truncated = `\n\n[TRUNCATED: showing ${MAX_TREE_LINES} of ${lines.length} entries. Narrow with 'path' or a smaller 'depth'.]`;
    lines = lines.slice(0, MAX_TREE_LINES);
  }

  return lines.join("\n") + truncated;
}

export async function remoteFileRead(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  filePath: string,
  options: { offset?: number; limit?: number } = {}
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, permissionFor(environment));

  // Extension and name denylist to protect credentials/keys
  const fileName = posix.basename(filePath).toLowerCase();
  const denylist = [".env", ".key", ".pem", ".p12", ".pfx", "id_rsa", "id_ed25519", "id_ecdsa", ".crt"];
  const isBlocked = denylist.some(blocked => fileName === blocked || fileName.endsWith(blocked));

  if (isBlocked) {
    throw new Error(`Access Denied: File '${filePath}' is blocked under the credential security denylist.`);
  }

  // Guard path traversal (posix-safe — see security/path-guard.ts)
  const safeRemotePath = resolveSafePath(normalizeRemoteRoot(env.remotePath), filePath);
  const quotedPath = shellQuote(safeRemotePath);

  // Size guard: stat before cat, so a large binary/archive can't blow the SSH buffer
  // or the caller's context window.
  const statResult = await executeAllowed(env.sshAliasOrHost, `stat -c %s ${quotedPath}`);
  if (statResult.code !== 0) {
    throw new Error(`Failed to read remote file '${filePath}': ${statResult.stderr || "file not found"}`);
  }
  const size = parseInt(statResult.stdout, 10);
  if (Number.isFinite(size) && size > MAX_FILE_READ_BYTES && options.offset === undefined && options.limit === undefined) {
    throw new Error(
      `Access Denied: '${filePath}' is ${size} bytes, over the ${MAX_FILE_READ_BYTES} byte read cap. Pass 'offset'/'limit' to read a line range instead.`
    );
  }

  let command: string;
  if (options.offset !== undefined || options.limit !== undefined) {
    const offset = assertPositiveInt(options.offset ?? 1, "offset", 10_000_000);
    const limit = assertPositiveInt(options.limit ?? 2000, "limit", 100_000);
    command = `tail -n +${offset} ${quotedPath}`;
    // Compose with head to bound the range; both are allowlisted verbs, joined here
    // as a single pre-validated template rather than assembled from raw user input.
    const result = await executeAllowed(env.sshAliasOrHost, command);
    if (result.code !== 0) {
      throw new Error(`Failed to read remote file '${filePath}': ${result.stderr}`);
    }
    const limited = result.stdout.split("\n").slice(0, limit).join("\n");
    return redactSecrets(limited);
  }

  const result = await executeAllowed(env.sshAliasOrHost, `cat ${quotedPath}`);

  if (result.code !== 0) {
    throw new Error(`Failed to read remote file '${filePath}': ${result.stderr}`);
  }

  // Redact secrets
  return redactSecrets(result.stdout);
}

export async function remoteGitStatus(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, permissionFor(environment));
  const root = normalizeRemoteRoot(env.remotePath);

  const result = await executeAllowed(env.sshAliasOrHost, buildGitCommand(root, "status --porcelain"));
  return finishGitResult(result, root, "status");
}

export async function remoteGitRevision(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, permissionFor(environment));
  const root = normalizeRemoteRoot(env.remotePath);

  const result = await executeAllowed(env.sshAliasOrHost, buildGitCommand(root, "rev-parse HEAD"));
  return finishGitResult(result, root, "revision");
}

// `git <verb>` is allowlisted; `-C <dir>` is the standard, injection-safe way to point
// git at a directory without a shell `cd &&` chain (which would itself require the `&&`
// metacharacter the guard forbids). The directory is always shell-quoted.
function buildGitCommand(root: string, subcommand: string): string {
  return `git -C ${shellQuote(root)} ${subcommand}`;
}

function finishGitResult(result: { code: number; stdout: string; stderr: string }, root: string, what: "status" | "revision"): string {
  if (result.code !== 0) {
    const notARepo = /not a git repository/i.test(result.stderr);
    if (notARepo) {
      throw new Error(
        `Failed to read remote git ${what}: '${root}' is not a Git repository root. ` +
        `The configured remotePath may point above the actual repository — check for a ` +
        `single subdirectory under it that does contain a '.git' folder and re-link with the corrected path.`
      );
    }
    throw new Error(`Failed to read remote git ${what}: ${result.stderr || "unknown error"}`);
  }
  return what === "status" ? (result.stdout || "Clean") : result.stdout;
}

const SERVICE_KIND = {
  file: /^file:/,
  pm2: /^pm2:/,
  docker: /^docker:/,
  syslog: /^syslog$/,
};

export async function remoteLogs(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  service: string,
  limit: number = 200,
  options: { grep?: string } = {}
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, permissionFor(environment));
  const safeLimit = assertPositiveInt(limit, "limit", MAX_LOG_LIMIT);

  let cmd: string;
  if (SERVICE_KIND.syslog.test(service)) {
    cmd = `tail -n ${safeLimit} /var/log/syslog`;
  } else if (SERVICE_KIND.file.test(service)) {
    // File-backed logs (Laravel, nginx, etc.) — the gap that made `remote_logs` useless
    // for this stack. Resolved relative to the project's remotePath, or against a small
    // absolute allowlist of common system log roots.
    const rel = service.slice("file:".length);
    const target = posix.isAbsolute(rel)
      ? assertAllowedAbsoluteLogPath(rel)
      : resolveSafePath(normalizeRemoteRoot(env.remotePath), rel);
    cmd = `tail -n ${safeLimit} ${shellQuote(target)}`;
  } else if (SERVICE_KIND.pm2.test(service)) {
    const pm2App = assertSafeIdentifier(service.split(":")[1], "pm2 app name");
    cmd = `pm2 logs ${shellQuote(pm2App)} --lines ${safeLimit} --nostream`;
  } else if (SERVICE_KIND.docker.test(service)) {
    const container = assertSafeIdentifier(service.split(":")[1], "docker container name");
    cmd = `docker logs --tail ${safeLimit} ${shellQuote(container)}`;
  } else {
    const unit = assertSafeIdentifier(service, "systemd unit name");
    cmd = `journalctl -u ${shellQuote(unit)} -n ${safeLimit} --no-pager`;
  }

  const result = await executeAllowed(env.sshAliasOrHost, cmd);
  if (result.code !== 0) {
    throw new Error(`Failed to fetch logs for '${service}': ${result.stderr || "unknown error"}`);
  }

  if (result.stdout.trim().length === 0) {
    return `-- No entries returned for '${service}'. This may mean the unit/file produced no output, or that '${service}' does not exist on this host — verify with remote_services or remote_tree before assuming there is nothing to find. --`;
  }

  let output = redactSecrets(result.stdout);
  if (options.grep) {
    const needle = options.grep.toLowerCase();
    output = output.split("\n").filter((line) => line.toLowerCase().includes(needle)).join("\n");
  }
  return output;
}

const ALLOWED_ABSOLUTE_LOG_ROOTS = ["/var/log/"];

function assertAllowedAbsoluteLogPath(absolutePath: string): string {
  const normalized = posix.normalize(absolutePath);
  const allowed = ALLOWED_ABSOLUTE_LOG_ROOTS.some((root) => normalized.startsWith(root));
  if (!allowed) {
    throw new CommandRejectedError(
      `Access Denied: Absolute log path '${absolutePath}' is outside the allowed roots (${ALLOWED_ABSOLUTE_LOG_ROOTS.join(", ")}). Use a project-relative 'file:<path>' instead.`
    );
  }
  return normalized;
}

export async function remoteServices(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, permissionFor(environment));

  const unitsResult = await executeAllowed(env.sshAliasOrHost, `systemctl list-units --type=service --state=running --no-pager`);
  if (unitsResult.code !== 0) {
    throw new Error(`Failed to read remote services status: ${unitsResult.stderr}`);
  }

  let pm2Section = "";
  const pm2Result = await executeAllowed(env.sshAliasOrHost, `pm2 jlist`).catch(() => null);
  if (pm2Result && pm2Result.code === 0 && pm2Result.stdout) {
    pm2Section = `\n\n-- pm2 --\n${pm2Result.stdout}`;
  }

  const unitLines = unitsResult.stdout.split("\n").slice(0, 40).join("\n");
  return redactSecrets(unitLines + pm2Section);
}

export async function remoteProcesses(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment, permissionFor(environment));

  // `ps aux --sort=-%cpu` is a fixed, pre-validated template — the previous version's
  // pipe to `grep -v` is dropped here in favor of head-only output, since arbitrary
  // pipe composition is exactly what the allowlist forbids callers from constructing.
  const result = await executeAllowed(env.sshAliasOrHost, `ps aux --sort=-%cpu`);

  if (result.code !== 0) {
    throw new Error(`Failed to read remote processes: ${result.stderr}`);
  }

  const filtered = result.stdout
    .split("\n")
    .filter((line) => !line.includes("["))
    .slice(0, 50)
    .join("\n");

  return redactSecrets(filtered);
}
