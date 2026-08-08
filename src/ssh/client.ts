import { execFile } from "child_process";

export interface SSHResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function executeSSHCommand(
  aliasOrHost: string,
  command: string,
  timeoutMs: number = 10000
): Promise<SSHResult> {
  return new Promise((resolve, reject) => {
    // Run the native ssh subprocess. This automatically respects ~/.ssh/config, SSH key identities, and the system ssh-agent.
    // BatchMode=yes prevents it from waiting for user input passphrase/password questions.
    // StrictHostKeyChecking=accept-new auto-registers trust for unknown new host keys.
    const args = [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      aliasOrHost,
      command
    ];

    const child = execFile("ssh", args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      let code = 0;
      if (error) {
        // execFile sets error.code to exit code if != 0
        code = (error as any).code || 1;
        // If it killed the command due to timeout
        if (error.signal === "SIGTERM") {
          return reject(new Error(`SSH execution timed out after ${timeoutMs}ms for host '${aliasOrHost}'`));
        }
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code
      });
    });
  });
}
