const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { loadConfig } = require("../dist/src/config/loader");

function withFsTrace(fn) {
  const reads = [];
  const origReadFileSync = fs.readFileSync;
  const origReaddirSync = fs.readdirSync;

  fs.readFileSync = function (p, ...args) {
    reads.push(String(p));
    return origReadFileSync.call(fs, p, ...args);
  };
  fs.readdirSync = function (p, ...args) {
    reads.push(String(p));
    return origReaddirSync.call(fs, p, ...args);
  };

  try {
    fn();
  } finally {
    fs.readFileSync = origReadFileSync;
    fs.readdirSync = origReaddirSync;
  }

  return reads;
}

function makeScratchWorkspace() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-trace-"));
  const configDir = path.join(scratch, ".workspace-sync");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "workspace.json"),
    JSON.stringify({ schemaVersion: 1, name: "TraceTest" })
  );
  fs.writeFileSync(path.join(configDir, "projects.json"), JSON.stringify({}));

  // Decoy files that must never be touched by a plain "status"-style config load.
  fs.writeFileSync(path.join(scratch, "README.md"), "# decoy readme\n");
  fs.writeFileSync(path.join(scratch, "package.json"), "{}");
  fs.writeFileSync(path.join(configDir, "AGENT_MEMORY.md"), "# decoy memory\n");

  return { scratch, configDir };
}

test("loadConfig reads only the workspace config JSON files, never README/package.json/AGENT_MEMORY.md", () => {
  const { scratch, configDir } = makeScratchWorkspace();

  const allowed = new Set([
    path.join(configDir, "workspace.json"),
    path.join(configDir, "projects.json"),
    path.join(configDir, "environments.json"),
    path.join(configDir, "policies.json"),
  ]);

  let reads;
  try {
    reads = withFsTrace(() => {
      loadConfig(scratch);
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  assert.ok(reads.length > 0, "expected loadConfig to read at least the workspace.json file");

  for (const r of reads) {
    assert.ok(allowed.has(r), `Unexpected file read during loadConfig: ${r}`);
  }

  const forbiddenNames = ["README.md", "package.json", "AGENT_MEMORY.md"];
  for (const r of reads) {
    for (const name of forbiddenNames) {
      assert.ok(!r.endsWith(name), `loadConfig must never read ${name}, but read: ${r}`);
    }
  }
});
