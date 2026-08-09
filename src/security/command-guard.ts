// Read-only remote command boundary.
//
// This is the actual security boundary for everything WorkspaceSync runs over SSH.
// Quoting alone is not sufficient — a caller that fully controls a quoted argument can
// still choose which *verb* runs. Every remote invocation must therefore be assembled
// from one of the fixed, pre-validated OPERATIONS below; there is no code path from a
// tool argument to a free-form shell string.
//
// Layering:
//   1. Construction — callers pick a named operation + typed args (this file's public API).
//   2. Validation & quoting — every interpolated value is charset-checked and/or shell-quoted.
//   3. Allowlist enforcement — the assembled command's leading verb (and, where relevant,
//      subcommand) is checked against ALLOWED_VERBS before anything is sent to `ssh`.
//
// Nothing here can be satisfied by "quote harder" — an unknown or mutating verb is
// rejected outright, deny-by-default.

export class CommandRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandRejectedError";
  }
}

// ---------------------------------------------------------------------------
// Layer 2: quoting and charset validation
// ---------------------------------------------------------------------------

// POSIX single-quote shell escaping: wrap in '...' and turn any embedded ' into '\''.
// This neutralizes every shell metacharacter (;, &&, ||, |, `, $(...), >, <, &, newlines)
// inside the quoted value — none of them are special inside single quotes.
export function shellQuote(value: string): string {
  if (typeof value !== "string") {
    throw new CommandRejectedError(`Refusing to quote non-string value: ${typeof value}`);
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Conservative charset for identifiers that name a systemd unit, docker container, or
// pm2 process — never need shell metacharacters, so reject anything containing them
// instead of relying purely on quoting.
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:\-]{0,127}$/;

export function assertSafeIdentifier(value: string, label: string): string {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    throw new CommandRejectedError(
      `Access Denied: '${label}' must be a plain identifier (letters, digits, '.', '_', '-', '@', ':'); got '${value}'.`
    );
  }
  return value;
}

// Positive integers only, clamped to a sane range — used for line-count limits, etc.
export function assertPositiveInt(value: number, label: string, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new CommandRejectedError(`Access Denied: '${label}' must be a positive integer.`);
  }
  if (n > max) {
    throw new CommandRejectedError(`Access Denied: '${label}' exceeds the maximum of ${max}.`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Layer 3: allowlist of read-only verbs
// ---------------------------------------------------------------------------
// Each entry is the exact leading token sequence a built command is permitted to start
// with. Matching is against the fully assembled command string, anchored at position 0,
// so `git status` is allowed but `git status; rm -rf /` is not (the allowlist match
// requires the token immediately after the verb to be a recognized flag/arg boundary,
// and any metacharacter listed in FORBIDDEN_METACHARACTERS below fails the command
// outright before the verb check even runs).

const ALLOWED_VERBS: string[] = [
  // Files & source (read-only)
  "cat ", "ls ", "ls\n", "find ", "stat ", "head ", "tail ", "wc ", "file ", "readlink ",
  // Git (read-only subcommands only — enforced further by assertReadOnlyGit below)
  "git -C ", "git rev-parse ", "git status", "git log", "git show ", "git diff",
  "git branch --list", "git config --get ",
  // Services / system (read-only)
  "systemctl list-units", "systemctl status ", "systemctl is-active ",
  "journalctl ", "ps ", "df ", "free", "uptime", "uname", "which ",
  // Containers / process managers (read-only)
  "docker logs ", "docker ps", "pm2 logs ", "pm2 list", "pm2 jlist",
  // Connectivity probe
  "echo ",
  // Database inspection (read-only statements only; further checked by sql-guard)
  "mysql ", "psql ",
];

// Any of these appearing in the assembled command is an automatic reject, independent
// of the verb match — this is what stops a quoted-but-still-adjacent injection like
// `cat 'a' && rm -rf /` (the payload itself is inert once quoted, but a command built
// incorrectly by future code without quoting must still be caught here).
const FORBIDDEN_METACHARACTERS = /[;&|`]|\$\(|>>?|<</;

// Explicit reject patterns for mutating operations, checked even against inputs that
// would otherwise match an allowed prefix (e.g. "git " could be followed by "checkout").
const REJECTED_PATTERNS: RegExp[] = [
  /\brm\b/, /\bmv\b/, /\bcp\b/, /\bmkdir\b/, /\btouch\b/, /\bchmod\b/, /\bchown\b/,
  /\bln\b/, /\bdd\b/, /\btruncate\b/, /\btee\b/, /\bsed\b.*-i\b/, /\bkill\b/, /\bkillall\b/,
  /\bsystemctl\s+(start|stop|restart|enable|disable|reload|mask|unmask)\b/,
  /\bservice\s+\S+\s+(start|stop|restart)\b/,
  /\bdocker\s+(run|exec|rm|stop|restart|kill|rmi|build|push|pull|commit)\b/,
  /\bpm2\s+(restart|stop|delete|kill|reload)\b/,
  /\b(apt|apt-get|yum|dnf|npm|composer|pip|pip3)\b/,
  // Matches mutating git subcommands whether or not a `-C <dir>` selector precedes them.
  /\bgit\s+(-C\s+\S+\s+)?(checkout|pull|fetch|reset|clean|commit|push|merge|rebase|apply|stash|add|rm|mv|tag|update-ref|gc|prune|fsck|config\s+--(unset|replace-all|add))\b/,
  /\bgit\s+branch\s+(-[dD]|--delete)\b/,
  /\bartisan\b/,
  /\bphp\s+artisan\b/,
  /\bshutdown\b/, /\breboot\b/, /\bpasswd\b/, /\buseradd\b/, /\buserdel\b/, /\bcrontab\b/,
];

export function assertAllowedCommand(command: string): string {
  if (typeof command !== "string" || command.trim().length === 0) {
    throw new CommandRejectedError("Access Denied: Empty command.");
  }

  if (FORBIDDEN_METACHARACTERS.test(command)) {
    throw new CommandRejectedError(
      `Access Denied: Command contains a shell metacharacter that could chain or redirect execution: ${command}`
    );
  }

  for (const pattern of REJECTED_PATTERNS) {
    if (pattern.test(command)) {
      throw new CommandRejectedError(
        `Access Denied: Command matches a disallowed mutating/administrative operation: ${command}`
      );
    }
  }

  const matchesAllowed = ALLOWED_VERBS.some((verb) => command.startsWith(verb) || command === verb.trim());
  if (!matchesAllowed) {
    throw new CommandRejectedError(
      `Access Denied: Command does not match any permitted read-only operation: ${command}`
    );
  }

  return command;
}

// ---------------------------------------------------------------------------
// SQL statement guard for remote_db_query / remote_db_schema (item 6b)
// ---------------------------------------------------------------------------

const SQL_ALLOWED_LEADING = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;
// Strips SQL line/block comments before inspection so a comment cannot hide a second
// statement or obfuscate a keyword (e.g. `SEL/**/ECT`, `-- \nDROP TABLE x`).
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ");
}

export function assertReadOnlySql(sql: string, maxLimit: number): string {
  if (typeof sql !== "string" || sql.trim().length === 0) {
    throw new CommandRejectedError("Access Denied: Empty SQL statement.");
  }

  const stripped = stripSqlComments(sql).trim();

  // Reject stacked statements outright rather than trying to split and validate each
  // one — a single semicolon that isn't purely trailing means "more than one statement".
  const withoutTrailingSemicolon = stripped.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    throw new CommandRejectedError("Access Denied: Multiple/stacked SQL statements are not permitted.");
  }

  if (!SQL_ALLOWED_LEADING.test(withoutTrailingSemicolon)) {
    throw new CommandRejectedError(
      "Access Denied: Only SELECT, SHOW, DESCRIBE/DESC, and EXPLAIN statements are permitted."
    );
  }

  const mutatingKeyword = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|SET|CALL|LOAD\s+DATA|REPLACE|MERGE|LOCK)\b/i;
  if (mutatingKeyword.test(withoutTrailingSemicolon)) {
    throw new CommandRejectedError(
      "Access Denied: SQL statement references a mutating keyword and is not permitted."
    );
  }

  let finalSql = withoutTrailingSemicolon;
  if (/^\s*SELECT\b/i.test(finalSql) && !/\bLIMIT\s+\d+\s*$/i.test(finalSql)) {
    finalSql = `${finalSql} LIMIT ${assertPositiveInt(maxLimit, "limit", 10000)}`;
  }

  return finalSql;
}
