import * as posix from "path/posix";

// Remote hosts are always POSIX (the SSH transport only ever targets Linux VPS
// targets in this project). Using the platform `path` module here is the bug this
// file exists to prevent: on Windows, `path.resolve("/home/x/htdocs/", "app/F.php")`
// resolves against the *local* Windows cwd and drive, yielding something like
// `D:\home\x\htdocs\app\F.php` — a path that can never exist on the remote host.
// Every function below therefore uses `path/posix` unconditionally, regardless of
// the platform this process happens to run on.

const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/;

// Normalizes a caller-supplied relative path segment before it is ever joined to a
// root: backslashes (which a Windows-side caller may pass without thinking) are
// converted to forward slashes so `path/posix` treats the whole string as segments
// rather than one opaque backslash-containing filename.
function normalizeRelativeInput(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

export function resolveSafePath(rootPath: string, relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`Access Denied: A relative path is required.`);
  }

  const normalizedInput = normalizeRelativeInput(relativePath);

  if (WINDOWS_DRIVE_PREFIX.test(relativePath) || WINDOWS_DRIVE_PREFIX.test(normalizedInput)) {
    throw new Error(`Access Denied: '${relativePath}' looks like a Windows path; remote paths must be POSIX-relative.`);
  }

  if (posix.isAbsolute(normalizedInput)) {
    throw new Error(`Access Denied: '${relativePath}' must be relative, not absolute.`);
  }

  // Normalize the root itself through posix too — callers pass remotePath values
  // straight from config, which may carry a trailing slash or redundant segments.
  const normalizedRoot = posix.normalize(posix.resolve("/", rootPath));
  const combined = posix.normalize(posix.join(normalizedRoot, normalizedInput));

  // Trailing-separator-aware containment check: a plain `startsWith(normalizedRoot)`
  // would let `/home/a-evil` pass against root `/home/a`. Require an exact match or a
  // match followed by a path separator.
  const rootWithSep = normalizedRoot.endsWith("/") ? normalizedRoot : normalizedRoot + "/";
  if (combined !== normalizedRoot && !combined.startsWith(rootWithSep)) {
    throw new Error(`Access Denied: Path traversal detected. '${relativePath}' escapes root '${rootPath}'`);
  }

  return combined;
}

// Strips trailing slashes from a configured remotePath for consistent display/
// relativization (e.g. in remote_tree output), without touching the leading slash.
export function normalizeRemoteRoot(rootPath: string): string {
  const normalized = posix.normalize(posix.resolve("/", rootPath));
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}
