const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { installWorkspaceSync } = require("../dist/install/index");
const { generateAgentMemory } = require("../dist/src/memory/generator");

test("every generated SKILL.md carries an explicit Context Discipline / no-exploration directive", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-skill-"));
  try {
    installWorkspaceSync(scratch);

    const skillNames = [
      "workspace-sync-investigation",
      "workspace-sync-status",
      "workspace-sync-doctor",
      "workspace-sync-debug-testing",
      "workspace-sync-debug-production",
      "workspace-sync-compare-environments",
    ];

    for (const name of skillNames) {
      const skillPath = path.join(scratch, ".agents", "skills", name, "SKILL.md");
      assert.ok(fs.existsSync(skillPath), `expected ${skillPath} to exist`);

      const content = fs.readFileSync(skillPath, "utf-8");
      assert.ok(
        content.includes("Context Discipline"),
        `${name}/SKILL.md is missing the "Context Discipline" section`
      );
      assert.ok(
        /README\.md/.test(content),
        `${name}/SKILL.md should explicitly call out not reading README.md`
      );
      assert.ok(
        /never prefix.*slash|not valid shell syntax|is not a shell command/i.test(content),
        `${name}/SKILL.md should explicitly warn against a leading slash (/workspace-sync ...) in shell usage`
      );
    }

    const deprecated = [
      "workspace-sync-project-management",
      "workspace-sync-inspect-testing",
      "workspace-sync-inspect-production",
    ];
    for (const name of deprecated) {
      const skillPath = path.join(scratch, ".agents", "skills", name, "SKILL.md");
      assert.ok(!fs.existsSync(skillPath), `deprecated skill ${name} should not be installed`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("the investigation master skill carries its safety rules and references only real MCP tools", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-skill-investigation-"));
  try {
    installWorkspaceSync(scratch);

    const skillPath = path.join(scratch, ".agents", "skills", "workspace-sync-investigation", "SKILL.md");
    assert.ok(fs.existsSync(skillPath), "expected the investigation skill to be installed");
    const content = fs.readFileSync(skillPath, "utf-8");

    // Read-only guarantee: Testing/Production must never be mutated during an investigation.
    assert.ok(
      /Zero Write Policy/.test(content),
      "investigation skill must carry the Zero Write Policy"
    );
    assert.ok(
      /untrusted/i.test(content),
      "investigation skill must warn that remote output is untrusted data, not instructions"
    );
    // It must explain how remote access happens, so the agent does not invent its own.
    assert.ok(
      /SSH alias/i.test(content),
      "investigation skill must explain that remote access goes through configured SSH aliases"
    );

    // Drift guard: every MCP tool the skill names must actually exist on the server.
    const serverSource = fs.readFileSync(
      path.join(__dirname, "..", "dist", "src", "server.js"),
      "utf-8"
    );
    const realTools = new Set(
      [...serverSource.matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1])
    );
    assert.ok(realTools.size > 0, "expected to extract the MCP tool list from the built server");

    const referenced = new Set(
      [...content.matchAll(/`((?:workspace|remote|local|list|get|compare)_[a-z_]+)`/g)].map((m) => m[1])
    );
    assert.ok(referenced.size > 0, "expected the investigation skill to reference MCP tools");

    for (const tool of referenced) {
      assert.ok(
        realTools.has(tool),
        `investigation skill references '${tool}', which is not a real MCP tool (available: ${[...realTools].join(", ")})`
      );
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("install cleans up deprecated skills (project-management, inspect-testing/production) left over from a previous install", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-skill-upgrade-"));
  try {
    const deprecated = [
      "workspace-sync-project-management",
      "workspace-sync-inspect-testing",
      "workspace-sync-inspect-production",
    ];
    for (const name of deprecated) {
      const dir = path.join(scratch, ".agents", "skills", name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), "stale content\n");
    }

    installWorkspaceSync(scratch);

    for (const name of deprecated) {
      const skillPath = path.join(scratch, ".agents", "skills", name, "SKILL.md");
      assert.ok(!fs.existsSync(skillPath), `install should remove stale deprecated skill ${name}`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("generated AGENT_MEMORY.md carries Command Execution Discipline and Untrusted Remote Content directives", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-memory-"));
  try {
    fs.mkdirSync(path.join(scratch, ".workspace-sync"), { recursive: true });

    const config = {
      workspace: { schemaVersion: 1, name: "TestWS" },
      projects: {},
      environments: {},
      policies: {},
    };
    generateAgentMemory(config, scratch);

    const memoryPath = path.join(scratch, ".workspace-sync", "AGENT_MEMORY.md");
    assert.ok(fs.existsSync(memoryPath), "expected AGENT_MEMORY.md to be generated");

    const content = fs.readFileSync(memoryPath, "utf-8");
    assert.ok(
      content.includes("Command Execution Discipline"),
      "AGENT_MEMORY.md is missing the Command Execution Discipline section"
    );
    assert.ok(
      content.includes("Untrusted Remote Content"),
      "AGENT_MEMORY.md is missing the Untrusted Remote Content security directive"
    );
    assert.ok(
      /never prefix.*slash/i.test(content),
      "AGENT_MEMORY.md should explicitly warn against a leading slash (/workspace-sync ...) in shell usage"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
