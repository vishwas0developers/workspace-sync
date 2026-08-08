import { Policy } from "../config/schema";

export type PermissionType =
  | "readLocal"
  | "writeLocal"
  | "readTesting"
  | "writeTesting"
  | "readProduction"
  | "writeProduction";

export function enforcePermission(
  projectName: string,
  policy: Policy,
  action: PermissionType
): void {
  // Check the policy boolean for target action
  if (!policy[action]) {
    throw new Error(
      `Permission Denied: Action '${action}' is not allowed for project '${projectName}' under the current security policy.`
    );
  }
}
