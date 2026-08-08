import * as fs from "fs";
import * as path from "path";
import { getConfigDir } from "../config/loader";
import { redactSecrets } from "../security/redact";

export interface AuditEntry {
  timestamp: string;
  project: string;
  environment: string;
  tool: string;
  durationMs: number;
  success: boolean;
  sanitizedArgs: string;
}

export function logAudit(
  cwd: string,
  project: string,
  environment: string,
  tool: string,
  durationMs: number,
  success: boolean,
  args: any
): void {
  try {
    const configDir = getConfigDir(cwd);
    const logsDir = path.join(configDir, "logs");
    
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const today = new Date().toISOString().split("T")[0];
    const logFilePath = path.join(logsDir, `audit-${today}.jsonl`);

    const rawArgsString = JSON.stringify(args || {});
    const sanitizedArgs = redactSecrets(rawArgsString);

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      project,
      environment,
      tool,
      durationMs,
      success,
      sanitizedArgs,
    };

    fs.appendFileSync(logFilePath, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    // Fail silently to prevent crashing tool operations due to logger issues
    console.error("Failed to write audit log:", err);
  }
}
