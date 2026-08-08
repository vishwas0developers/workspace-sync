import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import test from "node:test";
import assert from "node:assert";

test("undo command regression tests", async (t) => {
  const cliPath = path.resolve(__dirname, "../../../dist/cli/index.js");
  const tempDir = path.resolve(__dirname, "../../../temp-test-undo-workspace");

  const setupTestWorkspace = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    const configDir = path.join(tempDir, ".workspace-sync");
    fs.mkdirSync(configDir, { recursive: true });

    const workspaceConfig = {
      workspace: {
        schemaVersion: 1,
        name: "TestWorkspace",
      },
      projects: {
        "admin": { localPath: "./1.admin-iticareer.kdhakar.com", git: "git-url-2" },
      },
      environments: {},
      policies: {}
    };

    fs.writeFileSync(path.join(configDir, "workspace.json"), JSON.stringify(workspaceConfig.workspace, null, 2));
    fs.writeFileSync(path.join(configDir, "projects.json"), JSON.stringify(workspaceConfig.projects, null, 2));
    fs.writeFileSync(path.join(configDir, "environments.json"), JSON.stringify(workspaceConfig.environments, null, 2));
    fs.writeFileSync(path.join(configDir, "policies.json"), JSON.stringify(workspaceConfig.policies, null, 2));
  };

  const readProjects = (): any => {
    return JSON.parse(fs.readFileSync(path.join(tempDir, ".workspace-sync", "projects.json"), "utf8"));
  };

  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };

  await t.test("successfully performs undo rollback on add-project", () => {
    setupTestWorkspace();

    // 1. Add project
    execSync(`node "${cliPath}" add-project "new-api" "./api-service"`, {
      cwd: tempDir,
      encoding: "utf8"
    });

    let projects = readProjects();
    assert.ok(projects["new-api"] !== undefined);

    // 2. Perform undo
    const undoOutput = execSync(`node "${cliPath}" undo -y`, {
      cwd: tempDir,
      encoding: "utf8"
    });

    assert.ok(undoOutput.includes("✓ Successfully undone last operation"));

    projects = readProjects();
    assert.strictEqual(projects["new-api"], undefined);
    assert.ok(projects["admin"] !== undefined);

    cleanup();
  });

  await t.test("successfully performs undo rollback on remove-project", () => {
    setupTestWorkspace();

    // 1. Remove project
    execSync(`node "${cliPath}" remove-project "admin" -y`, {
      cwd: tempDir,
      encoding: "utf8"
    });

    let projects = readProjects();
    assert.strictEqual(projects["admin"], undefined);

    // 2. Perform undo
    const undoOutput = execSync(`node "${cliPath}" undo -y`, {
      cwd: tempDir,
      encoding: "utf8"
    });

    assert.ok(undoOutput.includes("✓ Successfully undone last operation: Remove project \"admin\""));

    projects = readProjects();
    assert.ok(projects["admin"] !== undefined);

    cleanup();
  });

  await t.test("strictly prevents double rollback (one-step only)", () => {
    setupTestWorkspace();

    // 1. Add project
    execSync(`node "${cliPath}" add-project "new-api" "./api-service"`, {
      cwd: tempDir,
      encoding: "utf8"
    });

    // 2. Perform first undo (success)
    const undo1 = execSync(`node "${cliPath}" undo -y`, {
      cwd: tempDir,
      encoding: "utf8"
    });
    assert.ok(undo1.includes("✓ Successfully undone last operation"));

    // 3. Perform second undo (should fail/warn "Nothing to undo")
    const undo2 = execSync(`node "${cliPath}" undo -y`, {
      cwd: tempDir,
      encoding: "utf8"
    });
    assert.ok(undo2.includes("Nothing to undo"));

    cleanup();
  });
});
