const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { loadConfig, saveConfig } = require("../dist/src/config/loader");

// `sshAlias` was renamed to `sshAliasOrHost`. Every workspace configured before that
// rename still has the old key on disk, so reading it must keep working and writing
// must migrate it forward. Without these guarantees an upgrade silently breaks every
// existing installation's environment links.

function makeWorkspace(environments) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ws-envfield-"));
  const configDir = path.join(scratch, ".workspace-sync");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "workspace.json"),
    JSON.stringify({ schemaVersion: 1, name: "compat" })
  );
  fs.writeFileSync(
    path.join(configDir, "projects.json"),
    JSON.stringify({ app: { localPath: "./app" } })
  );
  fs.writeFileSync(path.join(configDir, "environments.json"), JSON.stringify(environments));
  return scratch;
}

test("a legacy 'sshAlias' config still loads, normalized to 'sshAliasOrHost'", () => {
  const scratch = makeWorkspace({
    app: {
      testing: { sshAlias: "legacy-test", remotePath: "/srv/test" },
      production: { sshAlias: "legacy-prod", remotePath: "/srv/prod" },
    },
  });
  try {
    const config = loadConfig(scratch);
    assert.strictEqual(config.environments.app.testing.sshAliasOrHost, "legacy-test");
    assert.strictEqual(config.environments.app.production.sshAliasOrHost, "legacy-prod");
    assert.strictEqual(config.environments.app.testing.remotePath, "/srv/test");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("the new 'sshAliasOrHost' field loads unchanged", () => {
  const scratch = makeWorkspace({
    app: { testing: { sshAliasOrHost: "new-test", remotePath: "/srv/test" } },
  });
  try {
    const config = loadConfig(scratch);
    assert.strictEqual(config.environments.app.testing.sshAliasOrHost, "new-test");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("the new field wins when both old and new names are present", () => {
  const scratch = makeWorkspace({
    app: {
      testing: { sshAliasOrHost: "authoritative", sshAlias: "stale", remotePath: "/srv/test" },
    },
  });
  try {
    const config = loadConfig(scratch);
    assert.strictEqual(config.environments.app.testing.sshAliasOrHost, "authoritative");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("saving a legacy config migrates it to 'sshAliasOrHost' on disk", () => {
  const scratch = makeWorkspace({
    app: { production: { sshAlias: "legacy-prod", remotePath: "/srv/prod" } },
  });
  try {
    const config = loadConfig(scratch);
    saveConfig(config, scratch);

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(scratch, ".workspace-sync", "environments.json"), "utf-8")
    );
    assert.strictEqual(onDisk.app.production.sshAliasOrHost, "legacy-prod");
    assert.ok(
      !("sshAlias" in onDisk.app.production),
      "the legacy key should not be written back once migrated"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("an environment with neither field is rejected with a clear message", () => {
  const scratch = makeWorkspace({
    app: { testing: { remotePath: "/srv/test" } },
  });
  try {
    assert.throws(
      () => loadConfig(scratch),
      /sshAliasOrHost/,
      "expected the error to name the required field"
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
