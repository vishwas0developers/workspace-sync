import { FullConfig } from "../config/loader";
import { enforcePermission, PermissionType } from "../security/permissions";
import { resolveSafePath, normalizeRemoteRoot } from "../security/path-guard";
import { assertReadOnlySql, CommandRejectedError } from "../security/command-guard";
import { redactSecrets } from "../security/redact";
import { executeDbTemplate } from "../ssh/client";
import { getEnvironment } from "./environment";

const DEFAULT_QUERY_LIMIT = 200;
const MAX_QUERY_LIMIT = 10000;

function permissionFor(environment: "testing" | "production"): PermissionType {
  return environment === "testing" ? "readTesting" : "readProduction";
}

function getRemoteConfig(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production"
) {
  const env = getEnvironment(config, projectName, environment);
  const policy = config.policies[projectName];
  if (!policy) {
    throw new Error(`Policy not configured for project '${projectName}'.`);
  }
  enforcePermission(projectName, policy, permissionFor(environment));
  return env;
}

// Credentials are read from the deployed app's own env file, server-side, inside the
// single SSH invocation below — they are substituted directly into a mysql client
// call on the remote host and are never returned to the caller, logged, or persisted
// anywhere on this side. `redactSecrets` still runs over all returned output as a
// second layer in case a query result happens to echo something secret-shaped.
async function runQuery(
  sshAliasOrHost: string,
  remotePath: string,
  envFile: string,
  sql: string,
  limit: number
): Promise<string> {
  const root = normalizeRemoteRoot(remotePath);
  const safeEnvFile = resolveSafePath(root, envFile);
  const finalSql = assertReadOnlySql(sql, limit);

  const result = await executeDbTemplate(sshAliasOrHost, safeEnvFile, finalSql);

  if (result.code !== 0) {
    throw new Error(`Database query failed: ${redactSecrets(result.stderr || "unknown error")}`);
  }
  if (result.stdout.trim().length === 0) {
    return "-- Query returned no rows. --";
  }
  return redactSecrets(result.stdout);
}

export async function remoteDbSchema(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  options: { table?: string; envFile?: string } = {}
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment);
  const envFile = options.envFile ?? ".env";

  const sql = options.table
    ? `DESCRIBE \`${options.table.replace(/[^A-Za-z0-9_]/g, "")}\``
    : `SHOW TABLES`;

  if (options.table && !/^[A-Za-z0-9_]+$/.test(options.table)) {
    throw new CommandRejectedError(`Access Denied: '${options.table}' is not a valid table name.`);
  }

  return runQuery(env.sshAliasOrHost, env.remotePath, envFile, sql, DEFAULT_QUERY_LIMIT);
}

export async function remoteDbQuery(
  config: FullConfig,
  projectName: string,
  environment: "testing" | "production",
  sql: string,
  options: { limit?: number; envFile?: string } = {}
): Promise<string> {
  const env = getRemoteConfig(config, projectName, environment);
  const envFile = options.envFile ?? ".env";
  const limit = Math.min(options.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);

  return runQuery(env.sshAliasOrHost, env.remotePath, envFile, sql, limit);
}
