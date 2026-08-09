#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { loadConfig, saveConfig, getConfigDir, configHasLegacyFields, migrateConfig, FullConfig } from "../src/config/loader";
import { generateAgentMemory } from "../src/memory/generator";
import { executeSSHCommand } from "../src/ssh/client";
import { getLocalGitInfo } from "../src/tools/local";
import {
  installWorkspaceSync,
  getInstalledAgents,
  describeAgent,
  isSkillsOnlyAgent,
  resolveSkillsDir,
  getSkillDrift,
  SUPPORTED_AGENTS,
  PLATFORMS,
} from "../install/index";
import { saveUndoSnapshot, performUndo } from "../src/config/undo";
import { discoverProjectCandidates } from "../src/discovery";
import { spawnSync } from "child_process";

const pkg = require(path.join(__dirname, "..", "..", "package.json"));

const program = new Command();

// Validates a remotePath before it's persisted, and — unless skipped — probes it over
// SSH so a misconfiguration like remotePath pointing one level above the actual
// project root (the bug that broke every remote tool in this workspace) is caught at
// link time instead of silently accepted and discovered later via cryptic
// "not a git repository" errors from unrelated tools.
async function validateAndProbeRemotePath(
  sshAliasOrHost: string,
  remotePath: string,
  opts: { verify: boolean }
): Promise<void> {
  if (!remotePath.startsWith("/")) {
    throw new Error(
      `remotePath must be an absolute POSIX path (starting with '/'); got '${remotePath}'. Windows-style or relative paths cannot be resolved on the remote host.`
    );
  }

  if (!opts.verify) {
    console.log(chalk.gray(`  (skipped remote verification: --no-verify)`));
    return;
  }

  const dirCheck = await executeSSHCommand(sshAliasOrHost, `stat -c %F ${shellQuoteForCli(remotePath)}`);
  if (dirCheck.code !== 0 || !dirCheck.stdout.includes("directory")) {
    console.log(
      chalk.yellow(`  ⚠ Could not confirm '${remotePath}' exists as a directory on '${sshAliasOrHost}' (${dirCheck.stderr || "not found"}). Saved anyway — verify manually.`)
    );
    return;
  }

  const gitCheck = await executeSSHCommand(sshAliasOrHost, `find ${shellQuoteForCli(remotePath)} -maxdepth 1 -name .git`);
  if (gitCheck.code === 0 && gitCheck.stdout.trim().length > 0) {
    console.log(chalk.green(`  ✓ Verified: '${remotePath}' contains a .git directory.`));
    return;
  }

  // No .git directly here — check one level down for the likely-intended root, which
  // is exactly the shape of the misconfiguration this validation exists to catch
  // (remotePath set to the htdocs parent instead of the vhost directory inside it).
  const childScan = await executeSSHCommand(sshAliasOrHost, `find ${shellQuoteForCli(remotePath)} -maxdepth 2 -name .git`);
  if (childScan.code === 0 && childScan.stdout.trim().length > 0) {
    const candidates = childScan.stdout
      .trim()
      .split("\n")
      .map((p) => p.replace(/\/\.git$/, ""));
    console.log(
      chalk.yellow(
        `  ⚠ '${remotePath}' has no .git of its own, but a subdirectory does: ${candidates.join(", ")}. ` +
        `remotePath is likely meant to be one of these, not their parent. Saved as given — re-link with the corrected path if this is the mistake.`
      )
    );
    return;
  }

  console.log(
    chalk.yellow(`  ⚠ '${remotePath}' exists but no .git was found in it or its immediate subdirectories. Saved anyway — confirm this is the intended project root.`)
  );
}

// Minimal POSIX single-quote escaping for CLI-side probe commands built from a
// user-supplied remotePath — mirrors src/security/command-guard.ts's shellQuote so a
// path containing a space or metacharacter can't break the probe command.
function shellQuoteForCli(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

program
  .name("workspace-sync")
  .description("WorkspaceSync MCP management command-line interface")
  .version(pkg.version);

program
  .command("init")
  .description("Initialize workspace sync metadata directory")
  .option("-n, --name <name>", "Workspace name", path.basename(process.cwd()))
  .option("--no-discover", "Skip automatic project directory discovery")
  .action(async (options) => {
    const configDir = getConfigDir();
    if (fs.existsSync(configDir)) {
      console.log(chalk.yellow(`WorkspaceSync configuration already exists at ${configDir}`));
      return;
    }

    const config: any = {
      workspace: {
        schemaVersion: 1 as const,
        name: options.name,
      },
      projects: {},
      environments: {},
      policies: {},
    };

    saveConfig(config);
    generateAgentMemory(config);

    console.log(chalk.green(`✓ WorkspaceSync successfully initialized!`));
    console.log(chalk.gray(`Configuration stored in .workspace-sync/`));

    if (options.discover) {
      const candidates = discoverProjectCandidates(process.cwd());
      if (candidates.length > 0) {
        console.log(chalk.cyan(`\nDetected project candidates:`));
        candidates.forEach((c, i) => console.log(`  [${i + 1}] ${c.name}`));

        const rl = require("readline").createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const answer: string = await new Promise((resolve) => {
          rl.question(
            chalk.gray(`\nSelect projects to register (comma-separated numbers, "all", or blank to skip): `),
            (a: string) => {
              rl.close();
              resolve(a.trim());
            }
          );
        });

        let selected = candidates;
        if (answer === "" ) {
          selected = [];
        } else if (answer.toLowerCase() !== "all") {
          const indices = answer.split(",").map((s) => parseInt(s.trim(), 10) - 1);
          selected = candidates.filter((_, i) => indices.includes(i));
        }

        for (const c of selected) {
          config.projects[c.name] = { localPath: c.localPath };
          config.policies[c.name] = {
            readLocal: true,
            writeLocal: true,
            readTesting: true,
            writeTesting: false,
            readProduction: true,
            writeProduction: false,
          };
        }

        if (selected.length > 0) {
          saveConfig(config);
          generateAgentMemory(config);
          console.log(chalk.green(`✓ Registered ${selected.length} project(s): ${selected.map((c) => c.name).join(", ")}`));
        }
      }
    }
  });

program
  .command("setup")
  .description("One-command project setup: detect workspace, initialize config, discover projects, and verify (recommended). Does not configure any AI agent — see 'install [agent]' for that.")
  .action(async () => {
    try {
      console.log(chalk.bold("\nWorkspaceSync Setup"));
      console.log(chalk.gray("==========================================="));

      const configDir = getConfigDir();
      let config: any;
      if (fs.existsSync(configDir)) {
        console.log(chalk.gray(`✓ Existing WorkspaceSync configuration found — preserving it.`));
        config = loadConfig();
      } else {
        config = {
          workspace: { schemaVersion: 1 as const, name: path.basename(process.cwd()) },
          projects: {},
          environments: {},
          policies: {},
        };
        saveConfig(config);
        console.log(chalk.green(`✓ Initialized workspace "${config.workspace.name}"`));
      }

      const alreadyRegistered = new Set(Object.keys(config.projects));
      const candidates = discoverProjectCandidates(process.cwd(), alreadyRegistered);
      if (candidates.length > 0) {
        for (const c of candidates) {
          config.projects[c.name] = { localPath: c.localPath };
          config.policies[c.name] = {
            readLocal: true,
            writeLocal: true,
            readTesting: true,
            writeTesting: false,
            readProduction: true,
            writeProduction: false,
          };
        }
        saveConfig(config);
        console.log(chalk.green(`✓ Auto-registered ${candidates.length} project(s): ${candidates.map((c) => c.name).join(", ")}`));
      } else {
        console.log(chalk.gray("✓ No new project directories detected."));
      }

      generateAgentMemory(config);

      console.log(chalk.bold("\nVerifying setup:"));
      console.log(chalk.green("  ✓ Config directory present (.workspace-sync)"));
      console.log(chalk.green(`  ✓ Workspace defined: ${config.workspace.name}`));
      console.log(chalk.green(`  ✓ Projects registered: ${Object.keys(config.projects).length}`));

      console.log(chalk.bold.green("\n✓ WorkspaceSync project setup complete!"));
      console.log(
        chalk.gray(
          `Next: run the install command for your AI agent (see README § Agent Installation), e.g. 'npx workspace-sync install claude'. Or 'workspace-sync link-testing' / 'link-production' to connect VPS environments.\n`
        )
      );
    } catch (err: any) {
      console.error(chalk.red(`Setup Error: ${err.message}`));
    }
  });

program
  .command("status")
  .description("Show status of workspace projects and linked environments")
  .action(async () => {
    try {
      const config = loadConfig();
      console.log(chalk.bold(`\nWorkspace: ${config.workspace.name}`));
      console.log(chalk.gray(`========================================`));

      const projects = Object.keys(config.projects);
      if (projects.length === 0) {
        console.log(chalk.yellow("No projects registered. Run 'workspace-sync add-project \"<name>\" \"<localPath>\"'"));
        return;
      }

      console.log(chalk.cyan("\nProjects:"));
      for (const prj of projects) {
        const data = config.projects[prj];
        let gitInfo = chalk.red("✗ No Git");
        if (data.git) {
          try {
            const git = await getLocalGitInfo(data.localPath, process.cwd());
            gitInfo = chalk.green(`✓ Git (${git.branch} - ${git.revision.substring(0, 7)})`);
          } catch {
            gitInfo = chalk.yellow("✓ Git (unreachable)");
          }
        }
        console.log(`  - ${chalk.bold(prj)} [${data.localPath}]: ${gitInfo}`);
      }

      console.log(chalk.cyan("\nEnvironments:"));
      for (const prj of projects) {
        const envs = config.environments[prj];
        if (!envs || (!envs.testing && !envs.production)) {
          console.log(`  - ${prj}: ${chalk.yellow("No environments linked")}`);
          continue;
        }

        console.log(`  - ${prj}:`);
        if (envs.testing) {
          console.log(`      * Testing   → ${chalk.bold(envs.testing.sshAliasOrHost)}:${envs.testing.remotePath}`);
        }
        if (envs.production) {
          console.log(`      * Production → ${chalk.bold(envs.production.sshAliasOrHost)}:${envs.production.remotePath}`);
        }
      }
      console.log("");
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command("add-project <name> <localPath>")
  .usage('"<name>" "<localPath>" [options]')
  .description("Add a local project folder to the workspace orchestration")
  .option("-g, --git <repository>", "Git repository name/url")
  .action((name, localPath, options) => {
    try {
      const config = loadConfig();
      saveUndoSnapshot("add-project", `Add project "${name}"`);

      config.projects[name] = {
        localPath,
        git: options.git || undefined,
      };

      config.policies[name] = {
        readLocal: true,
        writeLocal: true,
        readTesting: true,
        writeTesting: false,
        readProduction: true,
        writeProduction: false,
      };

      saveConfig(config);
      generateAgentMemory(config);
      console.log(chalk.green(`✓ Project '${name}' successfully registered!`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command("link-testing <project> <sshAliasOrHost> <remotePath>")
  .usage('"<project>" "<sshAliasOrHost>" "<remotePath>"')
  .description("Link testing environment to project (sshAliasOrHost: an SSH alias from ~/.ssh/config, or a hostname)")
  .option("--no-verify", "Skip the SSH probe that checks remotePath exists and looks like a project root")
  .action(async (project, sshAliasOrHost, remotePath, options) => {
    try {
      const config = loadConfig();
      if (!config.projects[project]) {
        console.error(chalk.red(`Error: Project '${project}' does not exist.`));
        return;
      }

      await validateAndProbeRemotePath(sshAliasOrHost, remotePath, { verify: options.verify !== false });

      saveUndoSnapshot("link-testing", `Link testing environment for project "${project}"`);

      if (!config.environments[project]) {
        config.environments[project] = {};
      }

      config.environments[project].testing = {
        sshAliasOrHost,
        remotePath,
      };

      saveConfig(config);
      generateAgentMemory(config);
      console.log(chalk.green(`✓ Testing environment linked for project '${project}'!`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exitCode = 1;
    }
  });

program
  .command("link-production <project> <sshAliasOrHost> <remotePath>")
  .usage('"<project>" "<sshAliasOrHost>" "<remotePath>"')
  .description("Link production environment to project (sshAliasOrHost: an SSH alias from ~/.ssh/config, or a hostname)")
  .option("--no-verify", "Skip the SSH probe that checks remotePath exists and looks like a project root")
  .action(async (project, sshAliasOrHost, remotePath, options) => {
    try {
      const config = loadConfig();
      if (!config.projects[project]) {
        console.error(chalk.red(`Error: Project '${project}' does not exist.`));
        return;
      }

      await validateAndProbeRemotePath(sshAliasOrHost, remotePath, { verify: options.verify !== false });

      saveUndoSnapshot("link-production", `Link production environment for project "${project}"`);

      if (!config.environments[project]) {
        config.environments[project] = {};
      }

      config.environments[project].production = {
        sshAliasOrHost,
        remotePath,
      };

      saveConfig(config);
      generateAgentMemory(config);
      console.log(chalk.green(`✓ Production environment linked for project '${project}'!`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exitCode = 1;
    }
  });

program
  .command("remove-project <project>")
  .usage('"<project>" [options]')
  .description("Completely remove project metadata and configuration from workspace")
  .option("-y, --yes", "Skip confirmation prompt")
  .action((project, options) => {
    try {
      let targetProject = project;
      if (typeof targetProject === "string") {
        targetProject = targetProject.trim();
        if (targetProject.startsWith("<") && targetProject.endsWith(">")) {
          targetProject = targetProject.slice(1, -1).trim();
        }
      }

      if (!targetProject || targetProject.includes("*") || targetProject === "all" || targetProject.trim() === "") {
        console.error(chalk.red("Error: Invalid project identifier. Bulk deletion is not allowed."));
        return;
      }

      const config = loadConfig();
      if (!config.projects[targetProject]) {
        console.error(chalk.red(`Error: Project '${targetProject}' is not registered.`));
        return;
      }

      const localPath = config.projects[targetProject].localPath;
      saveUndoSnapshot("remove-project", `Remove project "${targetProject}"`);

      const proceed = () => {
        delete config.projects[targetProject];
        delete config.environments[targetProject];
        delete config.policies[targetProject];

        saveConfig(config);
        generateAgentMemory(config);
        console.log(chalk.green(`✓ Project '${targetProject}' successfully removed from workspace configuration.`));
      };

      if (options.yes) {
        proceed();
      } else {
        const rl = require("readline").createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question(chalk.yellow(`Are you sure you want to remove project '${targetProject}' (Local Path: '${localPath}')? This only removes registry metadata. (y/N): `), (answer: string) => {
          rl.close();
          if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
            proceed();
          } else {
            console.log(chalk.gray("Removal cancelled."));
          }
        });
      }
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command("rename-project <currentName> <newName>")
  .usage('"<currentName>" "<newName>"')
  .description("Rename an existing registered project configuration")
  .action((currentName, newName) => {
    try {
      if (!newName || newName.trim() === "") {
        console.error(chalk.red("Error: New project name cannot be empty."));
        return;
      }

      const config = loadConfig();
      if (!config.projects[currentName]) {
        console.error(chalk.red(`Error: Project '${currentName}' does not exist.`));
        return;
      }

      if (config.projects[newName]) {
        console.error(chalk.red(`Error: A project named '${newName}' is already registered.`));
        return;
      }

      saveUndoSnapshot("rename-project", `Rename project "${currentName}" to "${newName}"`);

      // Perform rename by migrating data keys
      config.projects[newName] = config.projects[currentName];
      delete config.projects[currentName];

      if (config.environments[currentName]) {
        config.environments[newName] = config.environments[currentName];
        delete config.environments[currentName];
      }

      if (config.policies[currentName]) {
        config.policies[newName] = config.policies[currentName];
        delete config.policies[currentName];
      }

      saveConfig(config);
      generateAgentMemory(config);
      console.log(chalk.green(`✓ Project '${currentName}' successfully renamed to '${newName}'.`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command("undo")
  .usage("[options]")
  .description("One-step rollback of the last reversible WorkspaceSync operation")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (options) => {
    try {
      await performUndo(options);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command("install [agent]")
  .description(
    `Install skills and MCP configuration for an AI agent (${SUPPORTED_AGENTS.join(", ")}; default: vscode). This is the preferred, npx-reliable form — see 'workspace-sync --help' for the per-agent 'workspace-sync <agent> install' subcommand form and full agent reference.`
  )
  .option("-p, --platform <platform>", "Agent to install for (overrides the positional argument; used by agents that can't invoke a subcommand)")
  .action((agent, options) => {
    try {
      installWorkspaceSync(process.cwd(), options.platform || agent);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exitCode = 1;
    }
  });

// Per-agent subcommands: `workspace-sync <agent> install` (e.g. `workspace-sync claude install`).
// Kimi Code is reachable only via `workspace-sync install --platform kimi` above.
for (const platform of PLATFORMS) {
  if (platform.slug === "kimi") continue;
  const agentProgram = program.command(platform.slug).description(`${platform.label} integration commands`);
  agentProgram
    .command("install")
    .description(`Install WorkspaceSync skills and MCP configuration for ${platform.label}`)
    .action(() => {
      try {
        installWorkspaceSync(process.cwd(), platform.slug);
      } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
        process.exitCode = 1;
      }
    });
}

// Alias: `workspace-sync skills install` behaves identically to `workspace-sync agents install`.
program
  .command("skills")
  .description("Agent Skills (cross-framework) integration commands")
  .command("install")
  .description("Install WorkspaceSync skills for any skill-compatible agent (no MCP config)")
  .action(() => {
    try {
      installWorkspaceSync(process.cwd(), "agents");
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exitCode = 1;
    }
  });

program
  .command("mcp")
  .description("Start the stdio Model Context Protocol (MCP) server")
  .action(() => {
    // Dynamically require and run the server bundle
    require("../src/server");
  });

// Compares two "x.y.z" versions. Returns >0 when `a` is newer than `b`, <0 when older,
// 0 when equal. Pre-release suffixes are ignored (only the numeric core is compared),
// which is enough to decide whether a published release is an upgrade. Using this
// instead of `!==` matters: a locally-built dev version can be AHEAD of what's published,
// and a plain inequality check would "update" it backwards into a downgrade.
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Queries npm for the latest published version. Returns null on any failure (offline,
// npm missing, registry error, unexpected output) — a version check must never break
// `doctor`, which has to keep working without network access.
function getLatestPublishedVersion(): string | null {
  try {
    const result = spawnSync("npm", ["view", pkg.name, "version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      timeout: 15000,
    });
    if (result.error || result.status !== 0) return null;
    const version = (result.stdout || "").trim();
    return /^\d+\.\d+\.\d+/.test(version) ? version : null;
  } catch {
    return null;
  }
}

// Installs the latest published package globally. Returns true only if npm succeeded.
function installLatestPackage(): boolean {
  console.log(chalk.gray(`  Running: npm install -g ${pkg.name}@latest\n`));
  const result = spawnSync("npm", ["install", "-g", `${pkg.name}@latest`], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error || (result.status ?? 0) !== 0) {
    console.error(
      chalk.red(`\n  ✗ Automatic update failed. Update manually with: npm install -g ${pkg.name}@latest`)
    );
    return false;
  }
  console.log(chalk.green(`\n✓ Package updated to the latest published version.`));
  return true;
}

interface ReconcileResult {
  problems: number;
  warnings: number;
  staleAgents: string[];
  configMigrated: boolean;
}

// Brings this project's configuration schema and installed agents' skills back in line
// with the currently running package version's defaults, WITHOUT touching any
// project-specific values (registered projects, environment links, policies). Shared by
// `doctor` (repair drift against whatever version is currently installed) and `update`
// (repair drift right after fetching a newer version). Only the package-fetch step
// differs between the two commands; this is the "make everything else match" step both
// need afterward.
function reconcileProject(
  config: FullConfig,
  cwd: string,
  options: { checkOnly: boolean }
): ReconcileResult {
  let problems = 0;
  let warnings = 0;

  // --- Configuration schema migration -------------------------------------
  // Purely additive: normalizes field names renamed by a later schema version (e.g.
  // sshAlias -> sshAliasOrHost). Every other value — projects, paths, policies, and the
  // renamed field's own value — is carried over unchanged. loadConfig() already accepts
  // both names, so this only affects what's persisted on disk, never what's readable.
  let configMigrated = false;
  if (configHasLegacyFields(cwd)) {
    if (options.checkOnly) {
      console.log(
        chalk.yellow(
          `⚠ .workspace-sync/environments.json uses a legacy field name (sshAlias). Run without --check-only to migrate it to sshAliasOrHost — no values will be changed, only the field name.`
        )
      );
      warnings++;
    } else {
      migrateConfig(cwd);
      configMigrated = true;
      console.log(
        chalk.green(
          `✓ Migrated .workspace-sync/environments.json to the current schema (sshAlias → sshAliasOrHost); existing values preserved.`
        )
      );
    }
  } else {
    console.log(chalk.green(`✓ Configuration schema is current.`));
  }

  // --- Agent skill drift -----------------------------------------------------
  // Each agent has its own native skills directory (e.g. .claude/skills for Claude Code,
  // .codex/skills for Codex) — check every agent actually installed in THIS project, not
  // a single hardcoded generic path. The manifest is a plain JSON file a user could
  // hand-edit, so drop anything that isn't a supported agent rather than letting it fail
  // later during a re-sync.
  const recordedAgents = getInstalledAgents(cwd);
  const unknownAgents = recordedAgents.filter((a) => !SUPPORTED_AGENTS.includes(a));
  const installedAgents = recordedAgents.filter((a) => SUPPORTED_AGENTS.includes(a));
  if (unknownAgents.length > 0) {
    console.log(
      chalk.yellow(
        `⚠ Ignoring unrecognized agent(s) in .workspace-sync/installed-agents.json: ${unknownAgents.join(", ")}`
      )
    );
    warnings++;
  }

  const staleAgents: string[] = [];
  if (installedAgents.length === 0) {
    console.log(
      chalk.yellow(`⚠ No agents installed in this project yet. Run 'workspace-sync install [agent]' to set one up.`)
    );
    warnings++;
  } else {
    for (const agentId of installedAgents) {
      const info = describeAgent(agentId);
      // Content-level comparison against the current package's skill definitions — not
      // just a version-stamp check, so a skill file that was hand-edited or deleted (even
      // with a matching stamp) is still caught and restored to the default.
      const drift = getSkillDrift(agentId, cwd);
      if (!drift.isStale) {
        console.log(
          chalk.green(`✓ ${info.label}: skills at ${drift.skillsDir} match the current defaults (v${drift.installedVersion})`)
        );
        continue;
      }

      staleAgents.push(agentId);
      const reasons: string[] = [];
      if (drift.missingDir) reasons.push("directory missing");
      if (drift.missingStamp) reasons.push("no version stamp");
      if (drift.installedVersion && drift.installedVersion !== pkg.version) {
        reasons.push(`v${drift.installedVersion} → v${pkg.version}`);
      }
      if (drift.missingSkills.length > 0) reasons.push(`missing: ${drift.missingSkills.join(", ")}`);
      if (drift.modifiedSkills.length > 0) reasons.push(`changed from default: ${drift.modifiedSkills.join(", ")}`);
      if (drift.deprecatedPresent.length > 0) reasons.push(`deprecated present: ${drift.deprecatedPresent.join(", ")}`);
      console.log(chalk.yellow(`⚠ ${info.label}: skills at ${drift.skillsDir} drifted from defaults (${reasons.join("; ")})`));
    }

    if (staleAgents.length > 0) {
      if (options.checkOnly) {
        console.log(chalk.gray(`  → Run without --check-only to reconcile the agent(s) above to the current defaults.`));
        warnings += staleAgents.length;
      } else {
        console.log(chalk.bold(`\nReconciling skills for: ${staleAgents.join(", ")}`));
        for (const agentId of staleAgents) {
          try {
            // installWorkspaceSync rewrites every default skill file and the MCP entry —
            // it never touches .workspace-sync/ project config, so this cannot damage
            // project-specific settings even though it fully resets the skill content.
            installWorkspaceSync(cwd, agentId);
          } catch (err: any) {
            console.error(chalk.red(`  ✗ Failed to reconcile ${agentId}: ${err.message}`));
            problems++;
          }
        }
        // AGENT_MEMORY.md is generated from config and can drift after an upgrade too.
        generateAgentMemory(config, cwd);
        console.log(chalk.green("✓ Regenerated AGENT_MEMORY.md"));
      }
    }
  }

  return { problems, warnings, staleAgents, configMigrated };
}

program
  .command("doctor")
  .description(
    "Diagnose and repair drift: reconciles this project's skills and configuration schema back to the currently installed version's defaults, and checks project paths/SSH connectivity — WITHOUT touching project-specific settings or installing a newer package (that's 'workspace-sync update'). Use --check-only to report without changing anything."
  )
  .option("--check-only", "Report drift without repairing anything")
  .option("--offline", "Skip the network check for a newer published package version")
  .action(async (options) => {
    // Problems are counted rather than thrown so the report always runs to completion,
    // then surfaces a non-zero exit code. That lets CI and AI agents detect a failing
    // workspace programmatically instead of having to parse the human-readable output.
    let problems = 0;
    let warnings = 0;

    console.log(chalk.bold("\nWorkspaceSync Doctor - Diagnostics Report"));
    console.log(chalk.gray("==========================================="));

    try {
      // Doctor is the command you reach for when things are broken, so a missing
      // configuration must be a clear diagnosis — not an unhandled load error.
      const configDir = getConfigDir();
      if (!fs.existsSync(configDir)) {
        console.log(chalk.red(`✗ No WorkspaceSync configuration found at ${configDir}`));
        console.log(chalk.gray("  → Run 'workspace-sync setup' to initialize this project."));
        process.exitCode = 1;
        return;
      }

      let config;
      try {
        config = loadConfig();
      } catch (err: any) {
        console.log(chalk.red(`✗ Configuration present but unreadable: ${err.message}`));
        console.log(chalk.gray("  → Check the JSON files in .workspace-sync/ for syntax errors."));
        process.exitCode = 1;
        return;
      }

      console.log(chalk.green("✓ Config directory present (.workspace-sync)"));
      console.log(chalk.green(`✓ Workspace defined: ${config.workspace.name}`));

      // --- Package freshness (informational only) -----------------------------
      // Doctor reports a newer published version but never installs it — that's
      // 'workspace-sync update's job. Keeping the two separate means doctor stays a pure,
      // fast, idempotent drift-repair command you can run anytime without it reaching
      // out to npm to change what's installed.
      if (options.offline) {
        console.log(chalk.gray(`- Package version: v${pkg.version} (skipped update check: --offline)`));
      } else {
        const latest = getLatestPublishedVersion();
        if (!latest) {
          console.log(
            chalk.gray(`- Package version: v${pkg.version} (could not reach npm to check for updates)`)
          );
        } else if (compareVersions(latest, pkg.version) <= 0) {
          // Equal, or the running build is ahead of the registry (local dev build).
          console.log(chalk.green(`✓ Package is up to date (v${pkg.version}; latest published is v${latest})`));
        } else {
          console.log(
            chalk.yellow(`⚠ A newer WorkspaceSync is published: v${latest} (installed: v${pkg.version}).`)
          );
          console.log(chalk.gray(`  → Run 'workspace-sync update' to install it and sync this project to it.`));
          warnings++;
        }
      }

      // --- Configuration + skill drift, repaired against the CURRENT version's defaults ---
      const reconciled = reconcileProject(config, process.cwd(), { checkOnly: !!options.checkOnly });
      problems += reconciled.problems;
      warnings += reconciled.warnings;

      const projects = Object.keys(config.projects);
      console.log(`✓ Projects registered: ${projects.length}`);

      // Every linked environment is probed concurrently. Previously these ran one after
      // another, so a workspace with several projects paid the full SSH handshake latency
      // (up to a 10s timeout) for each host in series.
      type SshCheck = { project: string; envLabel: string; alias: string; ok: boolean; detail: string };
      const sshChecks: Promise<SshCheck>[] = [];
      for (const prj of projects) {
        const envs = config.environments[prj];
        if (!envs) continue;
        for (const envLabel of ["testing", "production"] as const) {
          const env = envs[envLabel];
          if (!env) continue;
          sshChecks.push(
            executeSSHCommand(env.sshAliasOrHost, "echo 'ping'")
              .then((res) =>
                res.stdout === "ping"
                  ? { project: prj, envLabel, alias: env.sshAliasOrHost, ok: true, detail: "SSH connection successful" }
                  : {
                      project: prj,
                      envLabel,
                      alias: env.sshAliasOrHost,
                      ok: false,
                      detail: `SSH connection error: ${res.stderr || "unknown status"}`,
                    }
              )
              .catch((err: any) => ({
                project: prj,
                envLabel,
                alias: env.sshAliasOrHost,
                ok: false,
                detail: `SSH connection failed: ${err.message}`,
              }))
          );
        }
      }
      const sshResults = await Promise.all(sshChecks);

      for (const prj of projects) {
        console.log(chalk.cyan(`\nChecking Project '${prj}':`));
        const data = config.projects[prj];

        const resolvedPath = path.resolve(data.localPath);
        if (fs.existsSync(resolvedPath)) {
          console.log(chalk.green(`  ✓ Local path exists: ${resolvedPath}`));
        } else {
          console.log(chalk.red(`  ✗ Local path missing: ${resolvedPath}`));
          console.log(chalk.gray(`      → Update it with 'workspace-sync add-project' or remove it with 'workspace-sync remove-project "${prj}"'.`));
          problems++;
        }

        const forProject = sshResults.filter((r) => r.project === prj);
        if (forProject.length === 0) {
          console.log(chalk.gray("  - No Testing/Production environments linked."));
        }
        for (const check of forProject) {
          const title = check.envLabel === "testing" ? "Testing" : "Production";
          console.log(`  - ${title} host check [${check.alias}]:`);
          if (check.ok) {
            console.log(chalk.green(`      ✓ ${check.detail}`));

            // Connectivity is fine; now verify remotePath itself actually looks like
            // the project root. This is the check that was missing when this
            // workspace's testing remotePath pointed one directory above the real
            // app root — `doctor` reported success while every remote tool failed.
            const envConfig = config.environments[prj]?.[check.envLabel as "testing" | "production"];
            if (envConfig) {
              const gitCheck = await executeSSHCommand(
                check.alias,
                `find ${shellQuoteForCli(envConfig.remotePath)} -maxdepth 1 -name .git`
              ).catch(() => ({ code: 1, stdout: "", stderr: "probe failed" } as const));
              if (gitCheck.code === 0 && gitCheck.stdout.trim().length > 0) {
                console.log(chalk.green(`      ✓ remotePath '${envConfig.remotePath}' contains a .git directory.`));
              } else {
                const childScan = await executeSSHCommand(
                  check.alias,
                  `find ${shellQuoteForCli(envConfig.remotePath)} -maxdepth 2 -name .git`
                ).catch(() => ({ code: 1, stdout: "", stderr: "probe failed" } as const));
                if (childScan.code === 0 && childScan.stdout.trim().length > 0) {
                  const candidates = childScan.stdout.trim().split("\n").map((p) => p.replace(/\/\.git$/, ""));
                  console.log(
                    chalk.yellow(
                      `      ⚠ remotePath '${envConfig.remotePath}' has no .git of its own; found one in: ${candidates.join(", ")}. ` +
                      `remotePath is likely misconfigured — re-run 'link-${check.envLabel}' with the corrected path.`
                    )
                  );
                  warnings++;
                } else {
                  console.log(chalk.gray(`      - remotePath '${envConfig.remotePath}': no .git found nearby (may be a non-Git deployment).`));
                }
              }
            }
          } else {
            console.log(chalk.red(`      ✗ ${check.detail}`));
            problems++;
          }
        }
      }

      // Final verdict, so a human skimming — or an agent parsing — gets one clear line.
      console.log("");
      if (problems === 0 && warnings === 0) {
        console.log(chalk.bold.green("✓ All checks passed."));
      } else if (problems === 0) {
        console.log(chalk.bold.yellow(`Completed with ${warnings} warning(s) and no errors.`));
      } else {
        console.log(chalk.bold.red(`Completed with ${problems} error(s) and ${warnings} warning(s).`));
        process.exitCode = 1;
      }
      console.log("");
    } catch (err: any) {
      console.error(chalk.red(`Doctor Error: ${err.message}`));
      process.exitCode = 1;
    }
  });

program
  .command("update")
  .description(
    "Upgrade WorkspaceSync to the latest published version, then bring this project's skills, MCP config, and configuration schema in sync with it. Unlike 'doctor' (repairs drift against whatever version is CURRENTLY installed), 'update' fetches whatever is newest first. Existing project-specific settings are always preserved. Use --check-only to report without changing anything."
  )
  .option("--check-only", "Report what would change without installing or writing anything")
  .option("--offline", "Skip the npm registry check; only sync skills/config against the currently installed version")
  .action(async (options) => {
    let problems = 0;
    let warnings = 0;

    console.log(chalk.bold("\nWorkspaceSync Update"));
    console.log(chalk.gray("==========================================="));

    try {
      const configDir = getConfigDir();
      if (!fs.existsSync(configDir)) {
        console.log(chalk.red(`✗ No WorkspaceSync configuration found at ${configDir}`));
        console.log(chalk.gray("  → Run 'workspace-sync setup' to initialize this project."));
        process.exitCode = 1;
        return;
      }

      // --- Package fetch ---------------------------------------------------
      let packageWasUpdated = false;
      if (options.offline) {
        console.log(chalk.gray(`- Package version: v${pkg.version} (skipped update check: --offline)`));
      } else {
        const latest = getLatestPublishedVersion();
        if (!latest) {
          console.log(
            chalk.yellow(`⚠ Could not reach npm to check for a newer version — syncing this project against the currently installed v${pkg.version}.`)
          );
          warnings++;
        } else if (compareVersions(latest, pkg.version) <= 0) {
          console.log(chalk.green(`✓ Already on the latest published version (v${pkg.version}).`));
        } else {
          if (options.checkOnly) {
            console.log(
              chalk.yellow(`⚠ A newer WorkspaceSync is published: v${latest} (installed: v${pkg.version}).`)
            );
            warnings++;
          } else {
            console.log(
              chalk.yellow(`⚠ A newer WorkspaceSync is published: v${latest} (installed: v${pkg.version}). Installing...`)
            );
            packageWasUpdated = installLatestPackage();
            if (!packageWasUpdated) problems++;
          }
        }
      }

      if (options.checkOnly) {
        // --check-only never writes anything, but it should still be a complete report —
        // also show what would be reconciled if 'update' were run for real.
        let config;
        try {
          config = loadConfig();
        } catch (err: any) {
          console.log(chalk.red(`✗ Configuration present but unreadable: ${err.message}`));
          problems++;
          config = null;
        }
        if (config) {
          const reconciled = reconcileProject(config, process.cwd(), { checkOnly: true });
          problems += reconciled.problems;
          warnings += reconciled.warnings;
        }

        console.log("");
        if (problems === 0 && warnings === 0) {
          console.log(chalk.bold.green("✓ Nothing to update."));
        } else {
          console.log(
            chalk.bold.yellow(`Completed with ${problems} error(s) and ${warnings} warning(s). Nothing was changed (--check-only).`)
          );
        }
        if (problems > 0) process.exitCode = 1;
        return;
      }

      if (packageWasUpdated) {
        // This process is still running the code that was loaded at startup — a Node
        // process cannot hot-swap its own already-imported modules — so syncing skills
        // now would write the OLD skill content and stamp it as current. Deferring to a
        // fresh invocation guarantees the sync step actually uses the new version's
        // defaults, the same pattern 'doctor' used before this split.
        console.log(
          chalk.cyan(
            `\nPackage updated to a newer version. Run 'workspace-sync update' once more to sync this project's skills and configuration to it.`
          )
        );
        console.log("");
        console.log(chalk.bold.green(`✓ Package updated. Skill/config sync deferred to the next run.`));
        return;
      }

      // Already on the latest version (or offline/unreachable, in which case the
      // currently loaded code is the best available) — safe to reconcile right now.
      const config = loadConfig();
      const reconciled = reconcileProject(config, process.cwd(), { checkOnly: false });
      problems += reconciled.problems;
      warnings += reconciled.warnings;

      console.log("");
      if (problems === 0 && warnings === 0) {
        console.log(chalk.bold.green("✓ Project is fully up to date."));
      } else if (problems === 0) {
        console.log(chalk.bold.yellow(`Completed with ${warnings} warning(s) and no errors.`));
      } else {
        console.log(chalk.bold.red(`Completed with ${problems} error(s) and ${warnings} warning(s).`));
        process.exitCode = 1;
      }
      console.log("");
    } catch (err: any) {
      console.error(chalk.red(`Update Error: ${err.message}`));
      process.exitCode = 1;
    }
  });

// Agent-facing reference block, appended to `--help` / `help` output. Plain text
// (no chalk colors) so it stays parseable by an AI agent reading the help output
// programmatically. An agent should find its own name below to learn its exact
// install command, skills directory, and MCP config location — no README lookup
// required.
function buildAgentReferenceHelp(): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(78));
  lines.push("WORKSPACE-SYNC — AGENT-FACING REFERENCE");
  lines.push("=".repeat(78));
  lines.push("");
  lines.push(
    "This section is for AI coding agents reading this --help output programmatically."
  );
  lines.push(
    "Find your own agent name in the PER-AGENT REFERENCE table below to get your exact"
  );
  lines.push("install command, skills directory, and MCP config location.");
  lines.push("");
  lines.push("COMMAND PURPOSES");
  lines.push("-".repeat(78));
  lines.push("workspace-sync setup");
  lines.push("  Initializes/refreshes the PROJECT config only (.workspace-sync/, AGENT_MEMORY.md).");
  lines.push("  Never writes any agent's skills or MCP config — that's 'install' below.");
  lines.push("");
  lines.push("workspace-sync install <agent>");
  lines.push("  Deploys skills + MCP config for ONE specific agent. Run once per agent, per project.");
  lines.push("  Safe to re-run: merges into existing MCP config, refreshes skills to current version.");
  lines.push("");
  lines.push("workspace-sync doctor");
  lines.push("  Diagnose and REPAIR DRIFT: reconciles this project's skills and configuration schema");
  lines.push("  back to the CURRENTLY INSTALLED version's defaults, and checks project paths/SSH");
  lines.push("  connectivity. Never installs a newer package (see 'update' below) and never touches");
  lines.push("  project-specific settings (registered projects, environment links, policies) beyond a");
  lines.push("  safe, value-preserving schema migration. Use --check-only to report without changing");
  lines.push("  anything, --offline to skip the (informational-only) published-version check.");
  lines.push("");
  lines.push("workspace-sync update");
  lines.push("  Upgrade the npm package to the LATEST PUBLISHED version, then run the same drift-repair");
  lines.push("  'doctor' does (skills + config schema) against that new version. If a newer package was");
  lines.push("  just installed, skill/config sync is deferred to the next run — a Node process can't");
  lines.push("  hot-swap its own already-loaded code, so re-run 'workspace-sync update' once more to");
  lines.push("  complete the sync. If already on the latest version, syncs immediately. Same --check-only");
  lines.push("  / --offline options as doctor. This is the ONLY command that runs 'npm install'.");
  lines.push("");
  lines.push("workspace-sync status");
  lines.push("  Shows registered projects, their local Git status, and linked Testing/Production hosts.");
  lines.push("");
  lines.push("workspace-sync mcp");
  lines.push("  Starts the stdio MCP server. Invoked automatically by your MCP client's own config (e.g.");
  lines.push("  .vscode/mcp.json, .mcp.json) — do not run this manually during normal use.");
  lines.push("");
  lines.push("TYPICAL FLOW");
  lines.push("-".repeat(78));
  lines.push("  1. workspace-sync setup                 (once per project)");
  lines.push("  2. workspace-sync install <your-agent>  (once per agent you use — see table below)");
  lines.push("  3. workspace-sync update                (whenever you want the latest package + a synced project)");
  lines.push("     workspace-sync doctor                 (anytime, to repair drift without changing versions)");
  lines.push("");
  lines.push("PER-AGENT REFERENCE");
  lines.push("-".repeat(78));
  lines.push(
    "Paths below are project-relative (shown as <project>/...) unless prefixed with ~ (user home)."
  );
  lines.push("'unverified' means it's a best-effort convention — confirm against that agent's own docs");
  lines.push("if the install doesn't take effect, and please open an issue so it can be corrected.");
  lines.push("");

  for (const platform of PLATFORMS) {
    const info = describeAgent(platform.slug as any);
    lines.push(`${info.label}  (agent: ${info.slug})`);
    lines.push(`  Install:  ${info.installCommand}`);
    lines.push(`  Skills:   ${info.skillsDir}/${info.skillsVerified ? "" : "   [unverified — generic fallback]"}`);
    if (isSkillsOnlyAgent(platform.slug as any)) {
      lines.push(`  MCP:      none — ${info.label} has no MCP support, skills only.`);
    } else {
      const verifiedNote = info.mcpVerified ? "" : "   [unverified — generic fallback]";
      lines.push(`  MCP:      ${info.mcpConfig} (${info.mcpFormat.toUpperCase()})${verifiedNote}`);
    }
    lines.push("");
  }

  lines.push(
    "Kimi Code note: reachable only via 'workspace-sync install --platform kimi' (no 'kimi install' subcommand)."
  );
  lines.push(
    "Agent Skills (cross-framework, slug 'agents') accepts the alias 'skills': 'workspace-sync install skills'."
  );
  lines.push("");
  lines.push(
    "Each agent above also has a 'workspace-sync <agent> install' subcommand form, but it has proven"
  );
  lines.push(
    "unreliable via npx in some environments. Prefer 'workspace-sync install <agent>' shown above."
  );
  lines.push("");

  return lines.join("\n");
}

program.addHelpText("afterAll", buildAgentReferenceHelp);

program.parse(process.argv);
