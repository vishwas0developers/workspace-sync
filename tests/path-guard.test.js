const test = require("node:test");
const assert = require("node:assert");

const { resolveSafePath, normalizeRemoteRoot } = require("../dist/src/security/path-guard");

// Regression test for the bug that broke every `remote_file_read` on Windows: the old
// implementation used the platform `path` module, so on win32
// `path.resolve("/home/x/htdocs/", "app/F.php")` resolved against the local Windows
// drive/cwd instead of treating the input as a POSIX path, producing something like
// `D:\home\x\htdocs\app\F.php` — a path that can never exist on the remote Linux host.
test("resolveSafePath resolves POSIX paths correctly regardless of host platform", () => {
  const result = resolveSafePath("/home/a/htdocs/", "app/F.php");
  assert.strictEqual(result, "/home/a/htdocs/app/F.php");
});

test("resolveSafePath normalizes a root without a trailing slash the same way", () => {
  const result = resolveSafePath("/home/a/htdocs", "app/F.php");
  assert.strictEqual(result, "/home/a/htdocs/app/F.php");
});

test("resolveSafePath converts backslashes in the relative segment", () => {
  const result = resolveSafePath("/home/a/htdocs", "app\\Services\\Foo.php");
  assert.strictEqual(result, "/home/a/htdocs/app/Services/Foo.php");
});

test("resolveSafePath rejects '..' traversal that would escape the root", () => {
  assert.throws(() => resolveSafePath("/home/a/htdocs", "../../etc/passwd"), /Access Denied/);
});

test("resolveSafePath rejects an absolute POSIX path as the relative segment", () => {
  assert.throws(() => resolveSafePath("/home/a/htdocs", "/etc/passwd"), /Access Denied/);
});

test("resolveSafePath rejects a Windows drive-letter path", () => {
  assert.throws(() => resolveSafePath("/home/a/htdocs", "C:\\Windows\\System32"), /Access Denied/);
});

test("resolveSafePath rejects a sibling directory that merely shares a prefix", () => {
  // A naive `startsWith(root)` check would let "/home/a-evil" pass against root "/home/a".
  assert.throws(() => resolveSafePath("/home/a", "../a-evil/secret"), /Access Denied/);
});

test("resolveSafePath allows a path that resolves exactly to the root", () => {
  const result = resolveSafePath("/home/a/htdocs", ".");
  assert.strictEqual(result, "/home/a/htdocs");
});

test("normalizeRemoteRoot strips trailing slashes but keeps a single leading slash", () => {
  assert.strictEqual(normalizeRemoteRoot("/home/a/htdocs/"), "/home/a/htdocs");
  assert.strictEqual(normalizeRemoteRoot("/home/a/htdocs"), "/home/a/htdocs");
  assert.strictEqual(normalizeRemoteRoot("/"), "/");
});
