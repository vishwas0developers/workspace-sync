const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const cliPath = path.join(__dirname, "..", "dist", "cli", "index.js");
const pkg = require(path.join(__dirname, "..", "package.json"));

function runCli(args, cwd) {
  return execFileSync("node", [cliPath, ...args], { cwd, encoding: "utf-8" });
}

// All tests here use --offline: hitting the real npm registry would be slow, flaky, and
// could trigger an actual `npm install -g` on the machine running the test suite. With
// --offline, `update` skips the package-fetch step entirely and only exercises the
// project sync (skills + config) it shares with `doctor` via reconcileProject — this is
// still real coverage of update's own responsibilities, just not the network I/O.

test("`update --offline --check-only` reports drift without changing any file", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-update-check-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install", "claude"], scratch);

    const skillPath = path.join(scratch, ".claude", "skills", "workspace-sync-status", "SKILL.md");
    const before = fs.readFileSync(skillPath, "utf-8");
    fs.appendFileSync(skillPath, "\nhand-edited\n");

    const output = runCli(["update", "--offline", "--check-only"], scratch);

    assert.ok(/drifted from defaults/.test(output), "expected update --check-only to report the drift");
    assert.ok(/Nothing was changed/.test(output), "expected update --check-only to say nothing changed");
    assert.strictEqual(
      fs.readFileSync(skillPath, "utf-8"),
      before + "\nhand-edited\n",
      "--check-only must not modify the skill file"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`update --offline` reconciles drifted skills back to the current defaults", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-update-repair-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install", "claude"], scratch);

    const skillPath = path.join(scratch, ".claude", "skills", "workspace-sync-status", "SKILL.md");
    const canonical = fs.readFileSync(skillPath, "utf-8");
    fs.appendFileSync(skillPath, "\nhand-edited\n");

    const output = runCli(["update", "--offline"], scratch);

    assert.ok(/Reconciling skills for: claude/.test(output), "expected update to announce reconciliation");
    assert.ok(/fully up to date/.test(output), "expected a success verdict after reconciling");
    assert.strictEqual(
      fs.readFileSync(skillPath, "utf-8"),
      canonical,
      "expected the hand-edited skill to be restored to the canonical content"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`update --offline` migrates a legacy 'sshAlias' config while preserving its value and other project data", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-update-migrate-"));
  try {
    runCli(["setup"], scratch);
    fs.mkdirSync(path.join(scratch, "app"));
    runCli(["add-project", "app", "./app"], scratch);
    fs.writeFileSync(
      path.join(scratch, ".workspace-sync", "environments.json"),
      JSON.stringify({ app: { testing: { sshAlias: "legacy-host", remotePath: "/srv/test" } } })
    );

    const output = runCli(["update", "--offline"], scratch);
    assert.ok(/Migrated .*sshAlias.*sshAliasOrHost/.test(output), "expected update to announce the config migration");

    const envs = JSON.parse(
      fs.readFileSync(path.join(scratch, ".workspace-sync", "environments.json"), "utf-8")
    );
    assert.strictEqual(envs.app.testing.sshAliasOrHost, "legacy-host", "expected the alias value to be preserved");
    assert.strictEqual(envs.app.testing.remotePath, "/srv/test", "expected remotePath to be preserved");
    assert.ok(!("sshAlias" in envs.app.testing), "expected the legacy key to be gone after migration");

    const projects = JSON.parse(
      fs.readFileSync(path.join(scratch, ".workspace-sync", "projects.json"), "utf-8")
    );
    assert.strictEqual(projects.app.localPath, "./app", "project registration must survive a config migration untouched");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`update --offline --check-only` does NOT migrate a legacy config", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-update-migrate-check-"));
  try {
    runCli(["setup"], scratch);
    fs.mkdirSync(path.join(scratch, "app"));
    runCli(["add-project", "app", "./app"], scratch);
    const envPath = path.join(scratch, ".workspace-sync", "environments.json");
    const legacy = { app: { testing: { sshAlias: "legacy-host", remotePath: "/srv/test" } } };
    fs.writeFileSync(envPath, JSON.stringify(legacy));

    const output = runCli(["update", "--offline", "--check-only"], scratch);
    assert.ok(/legacy field name/.test(output), "expected update --check-only to report the legacy field");
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(envPath, "utf-8")),
      legacy,
      "--check-only must not migrate the config file"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`update --offline` with no installed agents warns but does not crash", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-update-noagents-"));
  try {
    runCli(["setup"], scratch);
    const output = runCli(["update", "--offline"], scratch);
    assert.ok(/No agents installed/.test(output), "expected a no-agents warning");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`update` reports a clear diagnosis and exits non-zero when no configuration exists", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-update-noconfig-"));
  try {
    let output = "";
    let exitCode = 0;
    try {
      output = execFileSync("node", [cliPath, "update", "--offline"], {
        cwd: scratch,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      output = (err.stdout || "") + (err.stderr || "");
      exitCode = err.status;
    }

    assert.notStrictEqual(exitCode, 0, "expected a non-zero exit code when configuration is missing");
    assert.ok(/No WorkspaceSync configuration found/.test(output), "expected a clear missing-config diagnosis");
    assert.ok(/workspace-sync setup/.test(output), "expected update to point at 'setup' as the fix");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`update --offline` leaves an already up-to-date project reporting success with no changes", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-update-clean-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install", "claude"], scratch);

    const output = runCli(["update", "--offline"], scratch);
    assert.ok(/fully up to date/.test(output), "expected a clean project to report fully up to date");
    assert.ok(!/Reconciling skills/.test(output), "a clean project should not trigger any reconciliation");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
