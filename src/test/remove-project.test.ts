import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import test from "node:test";
import assert from "node:assert";

test("remove-project command regression tests", async (t) => {
  const cliPath = path.resolve(__dirname, "../../../dist/cli/index.js");
  const tempDir = path.resolve(__dirname, "../../../temp-test-workspace");

  // Setup test environment helper
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
        "demo-assets-generator": { localPath: "./5.demo-assets-generator", git: "git-url-1" },
        "admin": { localPath: "./1.admin-iticareer.kdhakar.com", git: "git-url-2" },
        "api": { localPath: "./2.iticareer.com", git: "git-url-3" }
      },
      environments: {
        "demo-assets-generator": {
          testing: { sshAliasOrHost: "dummy-alias", remotePath: "/var/www/demo" }
        },
        "admin": {
          testing: { sshAliasOrHost: "admin-alias", remotePath: "/var/www/admin" }
        }
      },
      policies: {
        "demo-assets-generator": {
          readLocal: true, writeLocal: true, readTesting: true, writeTesting: false, readProduction: true, writeProduction: false
        },
        "admin": {
          readLocal: true, writeLocal: true, readTesting: true, writeTesting: false, readProduction: true, writeProduction: false
        }
      }
    };

    fs.writeFileSync(path.join(configDir, "workspace.json"), JSON.stringify(workspaceConfig.workspace, null, 2));
    fs.writeFileSync(path.join(configDir, "projects.json"), JSON.stringify(workspaceConfig.projects, null, 2));
    fs.writeFileSync(path.join(configDir, "environments.json"), JSON.stringify(workspaceConfig.environments, null, 2));
    fs.writeFileSync(path.join(configDir, "policies.json"), JSON.stringify(workspaceConfig.policies, null, 2));
  };

  const readProjects = (): any => {
    return JSON.parse(fs.readFileSync(path.join(tempDir, ".workspace-sync", "projects.json"), "utf8"));
  };

  const readEnvironments = (): any => {
    return JSON.parse(fs.readFileSync(path.join(tempDir, ".workspace-sync", "environments.json"), "utf8"));
  };

  const readPolicies = (): any => {
    return JSON.parse(fs.readFileSync(path.join(tempDir, ".workspace-sync", "policies.json"), "utf8"));
  };

  // Cleanup helper
  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };

  await t.test("successfully removes one project using angle brackets <...> and preserves other projects", () => {
    setupTestWorkspace();

    // Run remove-project on <demo-assets-generator>
    const output = execSync(`node "${cliPath}" remove-project "<demo-assets-generator>" -y`, {
      cwd: tempDir,
      encoding: "utf8",
    });

    assert.ok(output.includes("✓ Project 'demo-assets-generator' successfully removed"));

    const projects = readProjects();
    const environments = readEnvironments();
    const policies = readPolicies();

    // Verify demo-assets-generator is deleted
    assert.strictEqual(projects["demo-assets-generator"], undefined);
    assert.strictEqual(environments["demo-assets-generator"], undefined);
    assert.strictEqual(policies["demo-assets-generator"], undefined);

    // Verify admin and api are intact
    assert.ok(projects["admin"] !== undefined);
    assert.ok(projects["api"] !== undefined);
    assert.ok(environments["admin"] !== undefined);
    assert.ok(policies["admin"] !== undefined);

    cleanup();
  });

  await t.test("successfully removes one project using name directly", () => {
    setupTestWorkspace();

    const output = execSync(`node "${cliPath}" remove-project demo-assets-generator -y`, {
      cwd: tempDir,
      encoding: "utf8",
    });

    assert.ok(output.includes("✓ Project 'demo-assets-generator' successfully removed"));

    const projects = readProjects();
    assert.strictEqual(projects["demo-assets-generator"], undefined);
    assert.ok(projects["admin"] !== undefined);

    cleanup();
  });

  await t.test("fails-closed on non-existent project name without modifying registry", () => {
    setupTestWorkspace();

    const initialProjects = readProjects();

    try {
      execSync(`node "${cliPath}" remove-project non-existent -y`, {
        cwd: tempDir,
        stdio: "pipe",
      });
    } catch (err: any) {
      // Expected to fail or log error
    }

    const projects = readProjects();
    assert.deepStrictEqual(projects, initialProjects);

    cleanup();
  });

  await t.test("fails-closed on wildcard or empty identifiers without modifying registry", () => {
    setupTestWorkspace();

    const initialProjects = readProjects();

    // Wildcard
    try {
      execSync(`node "${cliPath}" remove-project "*" -y`, { cwd: tempDir, stdio: "pipe" });
    } catch {}

    // Empty/all
    try {
      execSync(`node "${cliPath}" remove-project "all" -y`, { cwd: tempDir, stdio: "pipe" });
    } catch {}

    const projects = readProjects();
    assert.deepStrictEqual(projects, initialProjects);

    cleanup();
  });
});
