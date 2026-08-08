const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const cliPath = path.join(__dirname, "..", "dist", "cli", "index.js");

function runCli(args, cwd) {
  return execFileSync("node", [cliPath, ...args], { cwd, encoding: "utf-8" });
}

test("`setup` initializes and auto-registers projects, but never writes agent/MCP configuration", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-setup-"));
  try {
    fs.mkdirSync(path.join(scratch, "frontend"));
    fs.writeFileSync(path.join(scratch, "frontend", "package.json"), "{}");
    fs.mkdirSync(path.join(scratch, "backend"));
    fs.writeFileSync(path.join(scratch, "backend", "package.json"), "{}");

    const output = runCli(["setup"], scratch);

    assert.ok(/Initialized workspace/.test(output), "expected setup to initialize a new workspace");
    assert.ok(/Auto-registered 2 project\(s\)/.test(output), "expected setup to auto-register discovered projects");
    assert.ok(/project setup complete/i.test(output), "expected setup to report completion");

    assert.ok(
      fs.existsSync(path.join(scratch, ".workspace-sync", "workspace.json")),
      "expected workspace.json to be created"
    );
    assert.ok(
      fs.existsSync(path.join(scratch, ".workspace-sync", "AGENT_MEMORY.md")),
      "expected AGENT_MEMORY.md to be generated"
    );

    assert.ok(
      !fs.existsSync(path.join(scratch, ".vscode", "mcp.json")),
      "setup must not write .vscode/mcp.json — that's install's job"
    );
    assert.ok(
      !fs.existsSync(path.join(scratch, ".mcp.json")),
      "setup must not write .mcp.json — that's install's job"
    );
    assert.ok(
      !fs.existsSync(path.join(scratch, ".agents", "skills")),
      "setup must not deploy any skills — that's install's job"
    );

    const projects = JSON.parse(fs.readFileSync(path.join(scratch, ".workspace-sync", "projects.json"), "utf-8"));
    assert.deepStrictEqual(Object.keys(projects).sort(), ["backend", "frontend"]);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("skills/MCP config only appear after an explicit `install [agent]` call following `setup`", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-setup-then-install-"));
  try {
    runCli(["setup"], scratch);
    assert.ok(!fs.existsSync(path.join(scratch, ".agents", "skills")), "no skills right after setup");

    runCli(["install", "claude"], scratch);
    assert.ok(
      fs.existsSync(path.join(scratch, ".mcp.json")),
      "expected .mcp.json to be written after 'install claude'"
    );
    assert.ok(
      fs.existsSync(path.join(scratch, ".agents", "skills", "workspace-sync-compare-environments", "SKILL.md")),
      "expected skills to be deployed after 'install claude'"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("`setup` is idempotent and preserves an existing configuration on rerun", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-setup-idempotent-"));
  try {
    fs.mkdirSync(path.join(scratch, "app"));
    fs.writeFileSync(path.join(scratch, "app", "package.json"), "{}");

    runCli(["setup"], scratch);
    runCli(["add-project", "manual-service", "./manual-service"], scratch);

    const secondRunOutput = runCli(["setup"], scratch);
    assert.ok(
      /Existing WorkspaceSync configuration found — preserving it/.test(secondRunOutput),
      "expected second run to preserve existing configuration instead of reinitializing"
    );

    const projects = JSON.parse(fs.readFileSync(path.join(scratch, ".workspace-sync", "projects.json"), "utf-8"));
    assert.ok(projects["app"], "auto-discovered project from first run should survive rerun");
    assert.ok(projects["manual-service"], "manually added project should be preserved by setup rerun");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
