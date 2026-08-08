import { z } from "zod";

export const WorkspaceSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
});

export const ProjectSchema = z.object({
  localPath: z.string(),
  git: z.string().optional(),
});

export const ProjectsSchema = z.record(z.string(), ProjectSchema);

// `sshAliasOrHost` accepts either an alias defined in ~/.ssh/config or a hostname.
//
// The field was previously named `sshAlias`. That name is still accepted when reading so
// existing `.workspace-sync/environments.json` files keep working after an upgrade; the
// value is normalized to `sshAliasOrHost` here, and the next config write persists the
// new name. Without this fallback every pre-rename installation would fail to load.
export const EnvironmentConfigSchema = z
  .object({
    sshAliasOrHost: z.string().optional(),
    /** @deprecated Legacy name for `sshAliasOrHost`; read-only compatibility. */
    sshAlias: z.string().optional(),
    remotePath: z.string(),
  })
  .refine((env) => Boolean(env.sshAliasOrHost ?? env.sshAlias), {
    message: "Missing 'sshAliasOrHost' (an SSH alias from ~/.ssh/config, or a hostname)",
    path: ["sshAliasOrHost"],
  })
  .transform((env) => ({
    sshAliasOrHost: (env.sshAliasOrHost ?? env.sshAlias) as string,
    remotePath: env.remotePath,
  }));

export const ProjectEnvironmentsSchema = z.object({
  testing: EnvironmentConfigSchema.optional(),
  production: EnvironmentConfigSchema.optional(),
});

export const EnvironmentsSchema = z.record(z.string(), ProjectEnvironmentsSchema);

export const PolicySchema = z.object({
  readLocal: z.boolean().default(true),
  writeLocal: z.boolean().default(true),
  readTesting: z.boolean().default(true),
  writeTesting: z.boolean().default(false),
  readProduction: z.boolean().default(true),
  writeProduction: z.boolean().default(false),
});

export const PoliciesSchema = z.record(z.string(), PolicySchema);

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Projects = z.infer<typeof ProjectsSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
export type ProjectEnvironments = z.infer<typeof ProjectEnvironmentsSchema>;
export type Environments = z.infer<typeof EnvironmentsSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type Policies = z.infer<typeof PoliciesSchema>;
