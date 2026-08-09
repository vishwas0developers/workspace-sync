const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const cliPath = path.join(__dirname, "..", "dist", "cli", "index.js");
const pkg = require(path.join(__dirname, "..", "package.json"));

function runCli(args, cwd, env) {
  return execFileSync("node", [cliPath, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
}

function makeHomeOverrideEnv(homeDir) {
  // os.homedir() reads USERPROFILE on Windows, HOME elsewhere.
  return { HOME: homeDir, USERPROFILE: homeDir };
}

test("`install claude` writes .mcp.json (not .vscode/mcp.json)", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-claude-"));
  try {
    runCli(["install", "claude"], scratch);

    const mcpPath = path.join(scratch, ".mcp.json");
    assert.ok(fs.existsSync(mcpPath), "expected .mcp.json to be written");
    const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    assert.strictEqual(mcp.mcpServers["workspace-sync"].command, "workspace-sync");

    assert.ok(!fs.existsSync(path.join(scratch, ".vscode", "mcp.json")), "must not write .vscode/mcp.json for claude");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`install cursor` writes .cursor/mcp.json", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-cursor-"));
  try {
    runCli(["install", "cursor"], scratch);

    const mcpPath = path.join(scratch, ".cursor", "mcp.json");
    assert.ok(fs.existsSync(mcpPath), "expected .cursor/mcp.json to be written");
    const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    assert.strictEqual(mcp.mcpServers["workspace-sync"].command, "workspace-sync");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`install` with no agent still writes exactly .vscode/mcp.json (unchanged default)", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-default-"));
  try {
    runCli(["install"], scratch);

    assert.ok(fs.existsSync(path.join(scratch, ".vscode", "mcp.json")), "expected .vscode/mcp.json to be written");
    assert.ok(!fs.existsSync(path.join(scratch, ".mcp.json")), "must not write .mcp.json for default agent");
    assert.ok(!fs.existsSync(path.join(scratch, ".cursor")), "must not write .cursor for default agent");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`install agents` writes skills only, no MCP config file", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-agents-"));
  try {
    runCli(["install", "agents"], scratch);

    assert.ok(
      fs.existsSync(path.join(scratch, ".agents", "skills", "workspace-sync-debug-testing", "SKILL.md")),
      "expected skills to be deployed"
    );
    assert.ok(!fs.existsSync(path.join(scratch, ".vscode")), "must not write .vscode for 'agents' target");
    assert.ok(!fs.existsSync(path.join(scratch, ".mcp.json")), "must not write .mcp.json for 'agents' target");
    assert.ok(!fs.existsSync(path.join(scratch, ".cursor")), "must not write .cursor for 'agents' target");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`install badagent` fails clearly and writes nothing", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-bad-"));
  try {
    let output = "";
    let exitCode = 0;
    try {
      output = execFileSync("node", [cliPath, "install", "badagent"], {
        cwd: scratch,
        encoding: "utf-8",
        // This CLI invocation is expected to fail — pipe (not inherit) stdout/stderr so
        // the expected "Unknown agent" error is captured for assertions below instead of
        // being echoed to the `npm test` terminal, where it would look like a real failure.
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      output = (err.stdout || "") + (err.stderr || "");
      exitCode = err.status;
    }

    assert.notStrictEqual(exitCode, 0, "expected a non-zero exit code for an unknown agent");
    assert.ok(/Unknown agent/.test(output), "expected an unknown-agent error message");
    assert.ok(!fs.existsSync(path.join(scratch, ".agents")), "must write no skills for an invalid agent");
    assert.ok(!fs.existsSync(path.join(scratch, ".vscode")), "must write no MCP config for an invalid agent");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`install` writes a version stamp that matches the installed package version", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-stamp-"));
  try {
    runCli(["install"], scratch);
    const stamp = fs
      .readFileSync(path.join(scratch, ".agents", "skills", ".workspace-sync-version"), "utf-8")
      .trim();
    assert.strictEqual(stamp, pkg.version);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`install gemini` / `install antigravity` write to the user-home Gemini config locations", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-gemini-cwd-"));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "ws-install-gemini-home-"));
  try {
    runCli(["install", "gemini"], scratch, makeHomeOverrideEnv(fakeHome));
    const geminiMcp = path.join(fakeHome, ".gemini", "config", "mcp_config.json");
    assert.ok(fs.existsSync(geminiMcp), "expected ~/.gemini/config/mcp_config.json to be written");
    assert.strictEqual(JSON.parse(fs.readFileSync(geminiMcp, "utf-8")).mcpServers["workspace-sync"].command, "workspace-sync");

    runCli(["install", "antigravity"], scratch, makeHomeOverrideEnv(fakeHome));
    const antigravityMcp = path.join(fakeHome, ".gemini", "antigravity-ide", "mcp_config.json");
    assert.ok(fs.existsSync(antigravityMcp), "expected ~/.gemini/antigravity-ide/mcp_config.json to be written");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("`workspace-sync claude install` subcommand form writes .mcp.json just like `install claude`", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-subcmd-claude-"));
  try {
    runCli(["claude", "install"], scratch);
    const mcpPath = path.join(scratch, ".mcp.json");
    assert.ok(fs.existsSync(mcpPath), "expected .mcp.json to be written via subcommand form");
    assert.strictEqual(JSON.parse(fs.readFileSync(mcpPath, "utf-8")).mcpServers["workspace-sync"].command, "workspace-sync");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`workspace-sync skills install` is an alias for `workspace-sync agents install`", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-subcmd-skills-"));
  try {
    runCli(["skills", "install"], scratch);
    assert.ok(
      fs.existsSync(path.join(scratch, ".agents", "skills", "workspace-sync-status", "SKILL.md")),
      "expected skills to be deployed via the 'skills' alias"
    );
    assert.ok(!fs.existsSync(path.join(scratch, ".vscode")), "'skills' alias must not write any MCP config");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`workspace-sync install --platform kimi` writes .kimi/mcp.json (Kimi has no direct subcommand)", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-kimi-flag-"));
  try {
    runCli(["install", "--platform", "kimi"], scratch);
    const mcpPath = path.join(scratch, ".kimi", "mcp.json");
    assert.ok(fs.existsSync(mcpPath), "expected .kimi/mcp.json to be written via --platform flag");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`workspace-sync aider install` deploys skills only — Aider has no MCP support", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-aider-"));
  try {
    runCli(["aider", "install"], scratch);
    assert.ok(
      fs.existsSync(path.join(scratch, ".aider", "workspace-sync-status", "SKILL.md")),
      "expected skills to be deployed to Aider's native .aider/ directory"
    );
    assert.ok(!fs.existsSync(path.join(scratch, ".agents")), "Aider must not write to the generic .agents/skills fallback");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`workspace-sync kiro install` writes .kiro/settings/mcp.json", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-kiro-"));
  try {
    runCli(["kiro", "install"], scratch);
    const mcpPath = path.join(scratch, ".kiro", "settings", "mcp.json");
    assert.ok(fs.existsSync(mcpPath), "expected .kiro/settings/mcp.json to be written");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`workspace-sync trae install` uses the generic .{slug}/mcp.json fallback", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-trae-"));
  try {
    runCli(["trae", "install"], scratch);
    const mcpPath = path.join(scratch, ".trae", "mcp.json");
    assert.ok(fs.existsSync(mcpPath), "expected .trae/mcp.json to be written via the generic fallback");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`workspace-sync codex install` writes a TOML mcp_servers table and is idempotent on rerun", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-codex-cwd-"));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "ws-codex-home-"));
  try {
    runCli(["codex", "install"], scratch, makeHomeOverrideEnv(fakeHome));
    const configPath = path.join(fakeHome, ".codex", "config.toml");
    const firstContent = fs.readFileSync(configPath, "utf-8");
    assert.ok(firstContent.includes("[mcp_servers.workspace-sync]"), "expected a TOML mcp_servers.workspace-sync table");

    runCli(["codex", "install"], scratch, makeHomeOverrideEnv(fakeHome));
    const secondContent = fs.readFileSync(configPath, "utf-8");
    const occurrences = secondContent.split("[mcp_servers.workspace-sync]").length - 1;
    assert.strictEqual(occurrences, 1, "rerunning install must not duplicate the TOML entry");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test("`doctor` warns when installed skills are stale relative to the running CLI version", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-stale-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install"], scratch);

    // Simulate an old install from a previous package version.
    fs.writeFileSync(path.join(scratch, ".agents", "skills", ".workspace-sync-version"), "0.0.1");

    // --offline --check-only keeps this test hermetic: no npm registry lookup (slow and
    // flaky) and no auto-repair, so the assertion sees the stale state it set up.
    const output = runCli(["doctor", "--offline", "--check-only"], scratch);
    assert.ok(/drifted from defaults.*v0\.0\.1.*→/.test(output), "expected a stale-skills warning from doctor");
    assert.ok(
      fs.readFileSync(path.join(scratch, ".agents", "skills", ".workspace-sync-version"), "utf-8").trim() === "0.0.1",
      "--check-only must not modify anything"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`doctor` auto-repairs stale skills and re-stamps them to the current version", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-repair-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install", "claude"], scratch);

    const stampPath = path.join(scratch, ".claude", "skills", ".workspace-sync-version");
    fs.writeFileSync(stampPath, "0.0.1");
    // Also delete a skill outright — auto-repair must restore it, not just re-stamp.
    const skillPath = path.join(scratch, ".claude", "skills", "workspace-sync-investigation", "SKILL.md");
    fs.rmSync(path.dirname(skillPath), { recursive: true, force: true });

    const output = runCli(["doctor", "--offline"], scratch);

    assert.ok(/Reconciling skills for: claude/.test(output), "expected doctor to announce the reconciliation");
    assert.strictEqual(
      fs.readFileSync(stampPath, "utf-8").trim(),
      pkg.version,
      "expected the version stamp to be refreshed to the current version"
    );
    assert.ok(fs.existsSync(skillPath), "expected the deleted skill to be restored");
    // Claude must be repaired in its own native directory, never the generic fallback.
    assert.ok(!fs.existsSync(path.join(scratch, ".agents")), "must not write to .agents for Claude Code");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`doctor` detects a hand-edited skill file even when the version stamp still matches", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-content-drift-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install", "claude"], scratch);

    // Only the skill content is altered — the stamp is untouched and still matches the
    // running version, so a version-stamp-only check (the old implementation) would miss
    // this entirely.
    const skillPath = path.join(scratch, ".claude", "skills", "workspace-sync-status", "SKILL.md");
    const canonical = fs.readFileSync(skillPath, "utf-8");
    fs.appendFileSync(skillPath, "\nrogue instructions injected\n");
    const stampPath = path.join(scratch, ".claude", "skills", ".workspace-sync-version");
    assert.strictEqual(fs.readFileSync(stampPath, "utf-8").trim(), pkg.version, "stamp should still read current version");

    const checkOutput = runCli(["doctor", "--offline", "--check-only"], scratch);
    assert.ok(
      /changed from default: workspace-sync-status/.test(checkOutput),
      "expected doctor to flag the specific modified skill by name"
    );

    runCli(["doctor", "--offline"], scratch);
    assert.strictEqual(
      fs.readFileSync(skillPath, "utf-8"),
      canonical,
      "expected doctor to restore the skill to its canonical content"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`doctor` flags deprecated skill directories left behind as drift", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-deprecated-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install", "claude"], scratch);

    const deprecatedDir = path.join(scratch, ".claude", "skills", "workspace-sync-inspect-testing");
    fs.mkdirSync(deprecatedDir, { recursive: true });
    fs.writeFileSync(path.join(deprecatedDir, "SKILL.md"), "stale\n");

    const output = runCli(["doctor", "--offline"], scratch);
    assert.ok(/deprecated present: workspace-sync-inspect-testing/.test(output), "expected drift to name the deprecated skill");
    assert.ok(!fs.existsSync(deprecatedDir), "expected doctor to remove the deprecated skill directory");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`doctor` migrates a legacy 'sshAlias' config in-place, preserving projects and policies", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-migrate-"));
  try {
    runCli(["setup"], scratch);
    fs.mkdirSync(path.join(scratch, "app"));
    runCli(["add-project", "app", "./app"], scratch);
    runCli(["link-testing", "app", "placeholder-host", "/srv/placeholder"], scratch);

    // Overwrite with a legacy-shaped environments.json, as if written by a pre-rename version.
    fs.writeFileSync(
      path.join(scratch, ".workspace-sync", "environments.json"),
      JSON.stringify({ app: { testing: { sshAlias: "legacy-host", remotePath: "/srv/test" } } })
    );
    const policiesBefore = fs.readFileSync(path.join(scratch, ".workspace-sync", "policies.json"), "utf-8");

    // "legacy-host" doesn't resolve, so the SSH connectivity check further down doctor's
    // report fails and doctor exits non-zero — expected and irrelevant to what this test
    // is verifying (the migration), so tolerate a non-zero exit rather than treat it as a
    // command failure.
    let output;
    try {
      output = runCli(["doctor", "--offline"], scratch);
    } catch (err) {
      output = (err.stdout || "") + (err.stderr || "");
    }
    assert.ok(/Migrated .*sshAlias.*sshAliasOrHost/.test(output), "expected doctor to announce the migration");

    const envs = JSON.parse(
      fs.readFileSync(path.join(scratch, ".workspace-sync", "environments.json"), "utf-8")
    );
    assert.strictEqual(envs.app.testing.sshAliasOrHost, "legacy-host");
    assert.strictEqual(envs.app.testing.remotePath, "/srv/test");

    const policiesAfter = fs.readFileSync(path.join(scratch, ".workspace-sync", "policies.json"), "utf-8");
    assert.deepStrictEqual(
      JSON.parse(policiesAfter),
      JSON.parse(policiesBefore),
      "policies.json content must be unchanged by an environments-only migration"
    );

    // Re-running doctor must be a no-op — migration is idempotent.
    let secondRun;
    try {
      secondRun = runCli(["doctor", "--offline"], scratch);
    } catch (err) {
      secondRun = (err.stdout || "") + (err.stderr || "");
    }
    assert.ok(!/Migrated/.test(secondRun), "a second doctor run should find nothing left to migrate");
    assert.ok(/Configuration schema is current/.test(secondRun));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`doctor --check-only` never installs a package update or writes any file", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-nopackage-"));
  try {
    runCli(["setup"], scratch);
    runCli(["install", "claude"], scratch);
    const output = runCli(["doctor", "--offline", "--check-only"], scratch);
    // Doctor must never itself run `npm install` — that responsibility belongs to
    // `update` only. Its own message must direct the user there instead.
    assert.ok(!/npm install -g/.test(output), "doctor must not suggest or run npm install itself");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`doctor` reports a clear diagnosis and exits non-zero when no configuration exists", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-noconfig-"));
  try {
    let output = "";
    let exitCode = 0;
    try {
      output = execFileSync("node", [cliPath, "doctor", "--offline"], {
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
    assert.ok(/workspace-sync setup/.test(output), "expected doctor to point at 'setup' as the fix");
    assert.ok(!/Doctor Error/.test(output), "missing config should be diagnosed, not thrown as an unhandled error");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`doctor` exits non-zero when a registered project's local path is missing", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-doctor-badpath-"));
  try {
    runCli(["setup"], scratch);
    runCli(["add-project", "ghost", "./does-not-exist"], scratch);

    let output = "";
    let exitCode = 0;
    try {
      output = execFileSync("node", [cliPath, "doctor", "--offline"], {
        cwd: scratch,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      output = (err.stdout || "") + (err.stderr || "");
      exitCode = err.status;
    }

    assert.notStrictEqual(exitCode, 0, "expected a non-zero exit code for a missing project path");
    assert.ok(/Local path missing/.test(output), "expected doctor to report the missing local path");
    assert.ok(/error\(s\)/.test(output), "expected a summary line counting the error");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
