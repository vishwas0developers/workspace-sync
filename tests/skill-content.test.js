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
      "workspace-sync-project-management",
      "workspace-sync-inspect-testing",
      "workspace-sync-inspect-production",
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
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
