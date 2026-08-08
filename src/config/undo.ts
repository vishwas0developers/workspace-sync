import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { FullConfig, getConfigDir, loadConfig, saveConfig } from "./loader";
import { generateAgentMemory } from "../memory/generator";
import { logAudit } from "../audit/logger";

export interface UndoSnapshot {
  timestamp: string;
  operation: string;
  description: string;
  config: FullConfig;
}

function getUndoFilePath(cwd: string = process.cwd()): string {
  return path.join(getConfigDir(cwd), ".undo.json");
}

export function saveUndoSnapshot(operation: string, description: string, cwd: string = process.cwd()): void {
  try {
    const configDir = getConfigDir(cwd);
    if (!fs.existsSync(configDir)) {
      return; // If not initialized, do nothing
    }

    const currentConfig = loadConfig(cwd);
    const snapshot: UndoSnapshot = {
      timestamp: new Date().toISOString(),
      operation,
      description,
      config: currentConfig,
    };

    fs.writeFileSync(getUndoFilePath(cwd), JSON.stringify(snapshot, null, 2), "utf-8");
  } catch (err) {
    // Fail silently or print error to stderr
    console.error(chalk.red(`Failed to save undo snapshot: ${(err as Error).message}`));
  }
}

export function loadUndoSnapshot(cwd: string = process.cwd()): UndoSnapshot | null {
  const undoPath = getUndoFilePath(cwd);
  if (!fs.existsSync(undoPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(undoPath, "utf-8");
    const snapshot = JSON.parse(raw) as UndoSnapshot;
    if (snapshot && snapshot.config && snapshot.description) {
      return snapshot;
    }
  } catch {
    // Corrupted undo file
  }
  return null;
}

export function clearUndoSnapshot(cwd: string = process.cwd()): void {
  const undoPath = getUndoFilePath(cwd);
  if (fs.existsSync(undoPath)) {
    try {
      fs.unlinkSync(undoPath);
    } catch {
      // Ignore
    }
  }
}

export async function performUndo(options: { yes?: boolean }, cwd: string = process.cwd()): Promise<void> {
  const startTime = Date.now();
  const snapshot = loadUndoSnapshot(cwd);

  if (!snapshot) {
    console.log(chalk.yellow("Nothing to undo. No previous reversible operation found."));
    return;
  }

  const executeRollback = () => {
    saveConfig(snapshot.config, cwd);
    generateAgentMemory(snapshot.config, cwd);
    clearUndoSnapshot(cwd);

    const durationMs = Date.now() - startTime;
    logAudit(cwd, "workspace", "local", "undo", durationMs, true, {
      undoneOperation: snapshot.operation,
      description: snapshot.description,
    });

    console.log(chalk.green(`✓ Successfully undone last operation: ${snapshot.description}. Restored previous workspace state.`));
  };

  if (options.yes) {
    executeRollback();
  } else {
    const rl = require("readline").createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(
      chalk.yellow(`Are you sure you want to undo last operation: '${snapshot.description}' (from ${snapshot.timestamp})? (y/N): `),
      (answer: string) => {
        rl.close();
        if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
          executeRollback();
        } else {
          console.log(chalk.gray("Undo operation cancelled."));
        }
      }
    );
  }
}
