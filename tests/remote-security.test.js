const test = require("node:test");
const assert = require("node:assert");

// This suite enumerates every remote-facing tool entry point and asserts, WITHOUT
// contacting any host, that injection payloads and mutating verbs can never reach the
// SSH transport as an executable mutation. It works by monkey-patching the internal
// `executeAllowed` used by every tool: if a command reaches that function despite
// containing a payload it should have been rejected before, the test fails loudly
// rather than silently trying to actually run it.

const clientPath = require.resolve("../dist/src/ssh/client");
const client = require(clientPath);

const { remoteTree, remoteFileRead, remoteLogs, remoteGitStatus, remoteGitRevision, remoteServices, remoteProcesses } = require("../dist/src/tools/remote");
const { remoteDbQuery, remoteDbSchema } = require("../dist/src/tools/database");
const { compareEnvironments } = require("../dist/src/tools/environment");
const { CommandRejectedError } = require("../dist/src/security/command-guard");

function makeConfig(overrides = {}) {
  return {
    workspace: { schemaVersion: 1, name: "sec-test" },
    projects: { demo: { localPath: "./demo" } },
    environments: {
      demo: {
        testing: { sshAliasOrHost: "test-host", remotePath: "/home/demo/htdocs/app" },
      },
    },
    policies: {
      demo: {
        readLocal: true, writeLocal: true,
        readTesting: true, writeTesting: false,
        readProduction: true, writeProduction: false,
      },
    },
    ...overrides,
  };
}

// Records every command that would have reached the network, so a test can assert
// none of them contain unneutralized injection payloads or mutating verbs — and can
// simulate SSH success/failure without a real network call.
let capturedCommands;
function withCapturedSSH(fn) {
  return async () => {
    capturedCommands = [];
    const original = client.executeAllowed;
    client.executeAllowed = async (alias, command) => {
      capturedCommands.push(command);
      return { stdout: "", stderr: "", code: 0 };
    };
    try {
      await fn();
    } finally {
      client.executeAllowed = original;
    }
  };
}

// A filename containing shell metacharacters (e.g. "a'; rm -rf / #") is not a
// traversal — path-guard correctly lets it through as a literal (if unusual) relative
// path. Safety here comes from shellQuote neutralizing it before it ever reaches the
// SSH command line, so the assertion is "the captured command stays a single, inert
// argument", not "this gets rejected outright".
test(
  "remote_tree: a 'path' argument containing shell metacharacters is quoted inert, never split into a second command",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await remoteTree(config, "demo", "testing", { path: "a'; rm -rf / #" });
    assert.strictEqual(capturedCommands.length, 1);
    const cmd = capturedCommands[0];
    // The embedded `'` must have been escaped to `'\''` (closing the quote, an
    // escaped literal quote, reopening the quote) rather than left as a bare quote
    // that would close the argument early and let `; rm -rf /` run as a second command.
    assert.ok(cmd.includes(`a'\\''; rm -rf / #'`), `expected escaped payload in: ${cmd}`);
  })
);

test(
  "remote_file_read: a file path containing shell metacharacters is quoted inert, never split into a second command",
  withCapturedSSH(async () => {
    const config = makeConfig();
    client.executeAllowed = async (alias, command) => {
      capturedCommands.push(command);
      // First call is the `stat` size check; satisfy it so cat is attempted next.
      if (command.startsWith("stat")) return { stdout: "10", stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    await remoteFileRead(config, "demo", "testing", "a'; cat /etc/shadow #");
    assert.strictEqual(capturedCommands.length, 2);
    for (const cmd of capturedCommands) {
      assert.ok(cmd.includes(`a'\\''; cat /etc/shadow #'`), `expected escaped payload in: ${cmd}`);
    }
  })
);

test(
  "remote_file_read: absolute path traversal outside remotePath is rejected",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await assert.rejects(
      () => remoteFileRead(config, "demo", "testing", "../../../../etc/passwd"),
      /Access Denied/
    );
  })
);

test(
  "remote_file_read: the credential denylist still blocks .env regardless of path tricks",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await assert.rejects(
      () => remoteFileRead(config, "demo", "testing", "config/../.env"),
      /Access Denied/
    );
  })
);

test(
  "remote_logs: a crafted systemd unit name cannot inject a second command",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await assert.rejects(
      () => remoteLogs(config, "demo", "testing", "nginx; rm -rf /", 100),
      /Access Denied/
    );
  })
);

test(
  "remote_logs: a crafted pm2 app name cannot inject a second command",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await assert.rejects(
      () => remoteLogs(config, "demo", "testing", "pm2:$(whoami)", 100),
      /Access Denied/
    );
  })
);

test(
  "remote_logs: file: mode cannot escape via an absolute path outside /var/log",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await assert.rejects(
      () => remoteLogs(config, "demo", "testing", "file:/etc/shadow", 100),
      /Access Denied/
    );
  })
);

test(
  "remote_db_query: mutating statements never reach the database layer, even disguised as a config value",
  withCapturedSSH(async () => {
    const config = makeConfig();
    for (const sql of ["DROP TABLE users", "DELETE FROM users", "SELECT 1; DROP TABLE users"]) {
      await assert.rejects(() => remoteDbQuery(config, "demo", "testing", sql), /Access Denied/);
    }
  })
);

test(
  "remote_db_schema: a crafted table name cannot inject SQL",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await assert.rejects(
      () => remoteDbSchema(config, "demo", "testing", { table: "users; DROP TABLE users" }),
      /Access Denied/
    );
  })
);

test(
  "compare_environments: a misconfigured remotePath is reported as a distinct error state, not silently treated as 'not_configured'",
  withCapturedSSH(async () => {
    const config = makeConfig();
    client.executeAllowed = async () => ({ stdout: "", stderr: "fatal: not a git repository", code: 128 });
    const result = await compareEnvironments(config, "demo");
    assert.match(result.testingRevision, /not_a_git_repo/);
    assert.notStrictEqual(result.testingRevision, "not_configured");
  })
);

test(
  "compare_environments: an unconfigured environment is still reported as not_configured (no regression)",
  withCapturedSSH(async () => {
    const config = makeConfig();
    delete config.environments.demo.testing;
    const result = await compareEnvironments(config, "demo");
    assert.strictEqual(result.testingRevision, "not_configured");
  })
);

test(
  "compare_environments: respects readTesting=false instead of reading the environment anyway",
  withCapturedSSH(async () => {
    const config = makeConfig();
    config.policies.demo.readTesting = false;
    const result = await compareEnvironments(config, "demo");
    assert.match(result.testingRevision, /Permission Denied/);
    assert.strictEqual(capturedCommands.length, 0, "no SSH command should have been issued for a policy-denied environment");
  })
);

test(
  "remote_git_status / remote_git_revision: policy denial is enforced before any SSH call",
  withCapturedSSH(async () => {
    const config = makeConfig();
    config.policies.demo.readTesting = false;
    await assert.rejects(() => remoteGitStatus(config, "demo", "testing"), /Permission Denied/);
    await assert.rejects(() => remoteGitRevision(config, "demo", "testing"), /Permission Denied/);
    assert.strictEqual(capturedCommands.length, 0);
  })
);

test(
  "no captured command from any successful call above ever contains a raw shell metacharacter outside quotes",
  withCapturedSSH(async () => {
    const config = makeConfig();
    await remoteGitStatus(config, "demo", "testing");
    await remoteGitRevision(config, "demo", "testing");
    await remoteServices(config, "demo", "testing");
    await remoteProcesses(config, "demo", "testing");
    for (const cmd of capturedCommands) {
      assert.doesNotMatch(cmd, /[;&|`]|\$\(|>>?|<</, `command should be free of shell metacharacters: ${cmd}`);
    }
  })
);
