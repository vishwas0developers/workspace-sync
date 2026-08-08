import * as path from "path";

export function resolveSafePath(rootPath: string, relativePath: string): string {
  // Normalize paths to ensure no path traversal
  const normalizedRoot = path.normalize(path.resolve(rootPath));
  const combined = path.resolve(normalizedRoot, relativePath);
  const normalizedCombined = path.normalize(combined);

  // Path must start with normalized root and not escape it
  if (!normalizedCombined.startsWith(normalizedRoot)) {
    throw new Error(`Access Denied: Path traversal detected. '${relativePath}' escapes root '${rootPath}'`);
  }

  return normalizedCombined;
}
