import { execFile } from "child_process";
import { assertAllowedCommand, CommandRejectedError } from "../security/command-guard";

export interface SSHResult {
  stdout: string;
  stderr: string;
  code: number;
}

// 20 MB — generous for logs/trees/file reads while still bounding worst-case memory.
// The previous default (Node's 1 MB `maxBuffer`) threw `ENOBUFS` on ordinary `tail`/
// `find` output against real deployments.
const DEFAULT_MAX_BUFFER = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_CONNECT_TIMEOUT_S = 8;

// Internal, unexported: the only function in this module that actually shells out.
// `command` MUST already have passed `assertAllowedCommand` — every exported entry
// point below enforces that before calling this. There is deliberately no exported
// "run this raw string" API: a tool cannot reach the remote host except through the
// named, pre-validated operations further down this file.
function runSSH(
  aliasOrHost: string,
  command: string,
  opts: { timeoutMs?: number; maxBuffer?: number } = {}
): Promise<SSHResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;

  return new Promise((resolve, reject) => {
    const args = [
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", `ConnectTimeout=${DEFAULT_CONNECT_TIMEOUT_S}`,
      aliasOrHost,
      command,
    ];

    execFile(
      "ssh",
      args,
      { timeout: timeoutMs, maxBuffer },
      (error, stdout, stderr) => {
        if (error) {
          const anyErr = error as NodeJS.ErrnoException & { signal?: string };

          if (anyErr.code === "ENOENT") {
            return reject(new Error(`SSH executable not found on PATH. Install OpenSSH client and ensure 'ssh' is runnable.`));
          }
          if (anyErr.signal === "SIGTERM" || (anyErr as NodeJS.ErrnoException & { killed?: boolean }).killed) {
            return reject(new Error(`SSH execution timed out after ${timeoutMs}ms for host '${aliasOrHost}'.`));
          }
          if (/ENOBUFS|maxBuffer/i.test(anyErr.message || "")) {
            return reject(new Error(`Remote output exceeded the ${maxBuffer} byte buffer for host '${aliasOrHost}'. Narrow the query (smaller limit/depth).`));
          }

          // A numeric exit code (the normal "remote command failed" case) is not an
          // exceptional condition — surface it as a structured result, not a throw.
          const exitCode = typeof anyErr.code === "number" ? anyErr.code : 1;
          return resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: exitCode });
        }

        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: 0 });
      }
    );
  });
}

// The only way to reach `runSSH`: every command is validated against the read-only
// allowlist (Layer 3) immediately before dispatch, regardless of which typed helper
// below assembled it. This makes the allowlist check impossible to accidentally skip.
async function executeAllowed(
  aliasOrHost: string,
  command: string,
  opts?: { timeoutMs?: number; maxBuffer?: number }
): Promise<SSHResult> {
  assertAllowedCommand(command);
  return runSSH(aliasOrHost, command, opts);
}

// Retained for callers (e.g. `doctor`'s connectivity probe) that only ever send a
// fixed, hardcoded, already-safe string — never one built from tool/user input. Still
// routed through the allowlist so it can't silently drift into something unsafe.
export async function executeSSHCommand(
  aliasOrHost: string,
  command: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<SSHResult> {
  return executeAllowed(aliasOrHost, command, { timeoutMs });
}

export { CommandRejectedError };
export { executeAllowed };

// Fixed, code-authored template for read-only database inspection (item 6b). This is
// the one deliberate exception to "every command matches a simple allowlisted prefix":
// it necessarily composes several steps (read env file -> extract DB_* vars -> invoke a
// client) in a single remote invocation. It bypasses `assertAllowedCommand`'s generic
// prefix/metacharacter check because that check cannot distinguish "attacker-controlled
// shell metacharacters" from "the pipes/subshells this specific, hand-written script
// needs" — instead, safety here comes entirely from the two values substituted in being
// independently validated and escaped before this function is ever called:
//   - `envFile` has already passed through `resolveSafePath` (posix-safe, root-contained)
//   - `sql` has already passed through `assertReadOnlySql` (SELECT/SHOW/DESCRIBE/EXPLAIN
//     only, no stacked statements, no mutating keywords)
// No other caller may add new invocations of this function without equivalent
// validation — it is not exported for general use, only through src/tools/database.ts.
//
// Credentials never leave the remote host: DB_PASSWORD is exported as MYSQL_PWD (so it
// never appears in `ps` output either) and substituted only inside the remote script,
// never returned to or logged by this process.
export async function executeDbTemplate(
  aliasOrHost: string,
  envFile: string,
  sql: string
): Promise<SSHResult> {
  // Base64-encode the whole script and decode it remotely instead of nesting shell
  // quoting layers (bash -c "..." containing single-quoted values containing SQL that
  // may itself contain quotes). Base64 output is guaranteed free of shell
  // metacharacters, so this sidesteps escaping bugs entirely rather than trying to get
  // nested quoting right by hand.
  const quotedSql = shellQuoteForScript(sql);
  const quotedEnvFile = shellQuoteForScript(envFile);

  const script =
    `set -a; ` +
    `source <(grep -E '^(DB_CONNECTION|DB_HOST|DB_PORT|DB_DATABASE|DB_USERNAME|DB_PASSWORD)=' ${quotedEnvFile} 2>/dev/null); ` +
    `set +a; ` +
    `if [ "$DB_CONNECTION" = "pgsql" ]; then ` +
    `PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "${"${DB_PORT:-5432}"}" -U "$DB_USERNAME" -d "$DB_DATABASE" ` +
    `-v ON_ERROR_STOP=1 -c "SET TRANSACTION READ ONLY" -c ${quotedSql}; ` +
    `else ` +
    `MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "${"${DB_PORT:-3306}"}" -u "$DB_USERNAME" "$DB_DATABASE" ` +
    `--batch --raw --init-command="SET SESSION TRANSACTION READ ONLY" -e ${quotedSql}; ` +
    `fi`;

  const encoded = Buffer.from(script, "utf-8").toString("base64");
  return runSSH(aliasOrHost, `bash -c "echo ${encoded} | base64 -d | bash"`, {});
}

// Single-quote escaping used only inside the DB template script above (kept distinct
// from the exported `shellQuote` in command-guard.ts, which quotes a value for direct
// placement on an ssh command line rather than inside an already-composed script).
function shellQuoteForScript(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
