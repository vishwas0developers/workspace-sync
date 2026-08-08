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

    const output = runCli(["doctor"], scratch);
    assert.ok(/Installed skills are from v0\.0\.1/.test(output), "expected a stale-skills warning from doctor");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
