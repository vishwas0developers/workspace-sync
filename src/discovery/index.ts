import * as fs from "fs";
import * as path from "path";

const PROJECT_MARKERS = [
  "package.json",
  "go.mod",
  "Cargo.toml",
  "requirements.txt",
  "pyproject.toml",
  "composer.json",
  "pom.xml",
  "build.gradle",
  ".git",
];

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".workspace-sync",
  ".vscode",
  ".agents",
  "dist",
  "build",
  ".venv",
  "venv",
]);

export interface ProjectCandidate {
  name: string;
  localPath: string;
}

export function discoverProjectCandidates(
  rootDir: string = process.cwd(),
  alreadyRegistered: Set<string> = new Set()
): ProjectCandidate[] {
  if (!fs.existsSync(rootDir)) return [];

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const candidates: ProjectCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) {
      continue;
    }

    const dirPath = path.join(rootDir, entry.name);
    const hasMarker = PROJECT_MARKERS.some((marker) => fs.existsSync(path.join(dirPath, marker)));

    if (hasMarker && !alreadyRegistered.has(entry.name)) {
      candidates.push({ name: entry.name, localPath: `./${entry.name}` });
    }
  }

  return candidates;
}
