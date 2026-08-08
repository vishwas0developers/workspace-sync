#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { loadConfig, saveConfig, getConfigDir } from "../src/config/loader";
import { generateAgentMemory } from "../src/memory/generator";
import { executeSSHCommand } from "../src/ssh/client";
import { getLocalGitInfo } from "../src/tools/local";
import {
  installWorkspaceSync,
  getInstalledAgents,
  describeAgent,
  isSkillsOnlyAgent,
  resolveSkillsDir,
  SUPPORTED_AGENTS,
  PLATFORMS,
} from "../install/index";
import { saveUndoSnapshot, performUndo } from "../src/config/undo";
import { discoverProjectCandidates } from "../src/discovery";
import { spawnSync } from "child_process";

const pkg = require(path.join(__dirname, "..", "..", "package.json"));

const program = new Command();

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
          console.log(`      * Testing   → ${chalk.bold(envs.testing.sshAlias)}:${envs.testing.remotePath}`);
        }
        if (envs.production) {
          console.log(`      * Production → ${chalk.bold(envs.production.sshAlias)}:${envs.production.remotePath}`);
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
  .command("link-testing <project> <sshAlias> <remotePath>")
  .usage('"<project>" "<sshAlias>" "<remotePath>"')
  .description("Link testing environment to project")
  .action((project, sshAlias, remotePath) => {
    try {
      const config = loadConfig();
      if (!config.projects[project]) {
        console.error(chalk.red(`Error: Project '${project}' does not exist.`));
        return;
      }

      saveUndoSnapshot("link-testing", `Link testing environment for project "${project}"`);

      if (!config.environments[project]) {
        config.environments[project] = {};
      }

      config.environments[project].testing = {
        sshAlias,
        remotePath,
      };

      saveConfig(config);
      generateAgentMemory(config);
      console.log(chalk.green(`✓ Testing environment linked for project '${project}'!`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

program
  .command("link-production <project> <sshAlias> <remotePath>")
  .usage('"<project>" "<sshAlias>" "<remotePath>"')
  .description("Link production environment to project")
  .action((project, sshAlias, remotePath) => {
    try {
      const config = loadConfig();
      if (!config.projects[project]) {
        console.error(chalk.red(`Error: Project '${project}' does not exist.`));
        return;
      }

      saveUndoSnapshot("link-production", `Link production environment for project "${project}"`);

      if (!config.environments[project]) {
        config.environments[project] = {};
      }

      config.environments[project].production = {
        sshAlias,
        remotePath,
      };

      saveConfig(config);
      generateAgentMemory(config);
      console.log(chalk.green(`✓ Production environment linked for project '${project}'!`));
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
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
  .command("update")
  .description(
    "PROJECT sync: refresh AGENT_MEMORY.md and re-run install for every previously installed agent, using the currently installed WorkspaceSync npm package. Does NOT update the npm package itself — see 'workspace-sync self-update' for that."
  )
  .action(async () => {
    try {
      const config = loadConfig();
      generateAgentMemory(config);
      console.log(chalk.green("✓ Regenerated AGENT_MEMORY.md"));

      const agents = getInstalledAgents(process.cwd());
      if (agents.length === 0) {
        console.log(
          chalk.yellow(
            "\n⚠ No previously installed agents found. Run 'workspace-sync install [agent]' at least once before using 'update'."
          )
        );
        return;
      }

      console.log(chalk.bold(`\nRefreshing ${agents.length} installed agent(s): ${agents.join(", ")}`));
      for (const agent of agents) {
        installWorkspaceSync(process.cwd(), agent);
      }

      console.log(chalk.bold.green(`\n✓ WorkspaceSync update complete (v${pkg.version})`));
      console.log(
        chalk.gray(
          `Note: this refreshed your project using the currently installed WorkspaceSync v${pkg.version}. To get a newer WorkspaceSync release first, run 'workspace-sync self-update'.`
        )
      );
    } catch (err: any) {
      console.error(chalk.red(`Update Error: ${err.message}`));
      process.exitCode = 1;
    }
  });

program
  .command("self-update")
  .description(
    "PACKAGE update: upgrade the globally installed WorkspaceSync npm package itself to the latest published version (runs 'npm install -g workspace-sync@latest'). Not project-specific — run 'workspace-sync update' afterward to re-sync your project."
  )
  .action(() => {
    console.log(chalk.bold("\nUpdating the globally installed WorkspaceSync package..."));
    console.log(chalk.gray("Running: npm install -g workspace-sync@latest\n"));
    const result = spawnSync("npm", ["install", "-g", "workspace-sync@latest"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.error || (result.status ?? 0) !== 0) {
      console.error(chalk.red("\n✗ Package update failed. You can run the command manually:"));
      console.error(chalk.gray("  npm install -g workspace-sync@latest"));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.bold.green("\n✓ WorkspaceSync package updated."));
    console.log(
      chalk.gray(
        "Run 'workspace-sync --version' to confirm the new version, then 'workspace-sync update' to re-sync each project."
      )
    );
  });

program
  .command("mcp")
  .description("Start the stdio Model Context Protocol (MCP) server")
  .action(() => {
    // Dynamically require and run the server bundle
    require("../src/server");
  });

program
  .command("doctor")
  .description("Perform self-diagnostic check on config and connectivity")
  .action(async () => {
    try {
      const config = loadConfig();
      console.log(chalk.bold("\nWorkspaceSync Doctor - Diagnostics Report"));
      console.log(chalk.gray("==========================================="));

      console.log(chalk.green("✓ Config directory present (.workspace-sync)"));
      console.log(chalk.green(`✓ Workspace defined: ${config.workspace.name}`));

      // Each agent has its own native skills directory (e.g. .claude/skills for Claude
      // Code, .codex/skills for Codex) — check every agent actually installed in THIS
      // project, not a single hardcoded generic path, so this report reflects reality
      // per agent instead of silently missing agents that installed to their own folder.
      const installedAgents = getInstalledAgents(process.cwd());
      if (installedAgents.length === 0) {
        console.log(
          chalk.yellow(
            `⚠ No agents installed in this project yet. Run 'workspace-sync install [agent]' to set one up.`
          )
        );
      } else {
        for (const agentId of installedAgents) {
          const info = describeAgent(agentId);
          const skillsDir = resolveSkillsDir(agentId, process.cwd());
          const versionStampPath = path.join(skillsDir, ".workspace-sync-version");
          if (!fs.existsSync(skillsDir)) {
            console.log(
              chalk.yellow(`⚠ ${info.label}: expected skills at ${skillsDir} but the directory is missing. Run 'workspace-sync install ${agentId}' to fix.`)
            );
          } else if (!fs.existsSync(versionStampPath)) {
            console.log(
              chalk.yellow(`⚠ ${info.label}: skills at ${skillsDir} have no version stamp (pre-upgrade). Run 'workspace-sync update' to refresh.`)
            );
          } else {
            const installedVersion = fs.readFileSync(versionStampPath, "utf-8").trim();
            if (installedVersion !== pkg.version) {
              console.log(
                chalk.yellow(`⚠ ${info.label}: skills at ${skillsDir} are from v${installedVersion} — current CLI is v${pkg.version}. Run 'workspace-sync update' to refresh.`)
              );
            } else {
              console.log(chalk.green(`✓ ${info.label}: skills at ${skillsDir} are up to date (v${installedVersion})`));
            }
          }
        }
      }

      const projects = Object.keys(config.projects);
      console.log(`✓ Projects registered: ${projects.length}`);

      for (const prj of projects) {
        console.log(chalk.cyan(`\nChecking Project '${prj}':`));
        const data = config.projects[prj];
        
        // Resolve path check
        const resolvedPath = path.resolve(data.localPath);
        if (fs.existsSync(resolvedPath)) {
          console.log(chalk.green(`  ✓ Local path exists: ${resolvedPath}`));
        } else {
          console.log(chalk.red(`  ✗ Local path missing: ${resolvedPath}`));
        }

        const envs = config.environments[prj];
        if (envs) {
          if (envs.testing) {
            console.log(`  - Testing host check [${envs.testing.sshAlias}]:`);
            try {
              const res = await executeSSHCommand(envs.testing.sshAlias, "echo 'ping'");
              if (res.stdout === "ping") {
                console.log(chalk.green("      ✓ SSH Connection successful"));
              } else {
                console.log(chalk.red(`      ✗ SSH Connection error: ${res.stderr || "Unknown status"}`));
              }
            } catch (err: any) {
              console.log(chalk.red(`      ✗ SSH Connection failed: ${err.message}`));
            }
          }
          if (envs.production) {
            console.log(`  - Production host check [${envs.production.sshAlias}]:`);
            try {
              const res = await executeSSHCommand(envs.production.sshAlias, "echo 'ping'");
              if (res.stdout === "ping") {
                console.log(chalk.green("      ✓ SSH Connection successful"));
              } else {
                console.log(chalk.red(`      ✗ SSH Connection error: ${res.stderr || "Unknown status"}`));
              }
            } catch (err: any) {
              console.log(chalk.red(`      ✗ SSH Connection failed: ${err.message}`));
            }
          }
        }
      }
      console.log("");
    } catch (err: any) {
      console.error(chalk.red(`Doctor Error: ${err.message}`));
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
  lines.push("workspace-sync update");
  lines.push("  PROJECT sync. Regenerates AGENT_MEMORY.md and re-runs install for every agent already");
  lines.push("  installed in this project (tracked in .workspace-sync/installed-agents.json), using the");
  lines.push("  currently installed WorkspaceSync npm package version. Does NOT fetch a newer package.");
  lines.push("");
  lines.push("workspace-sync self-update");
  lines.push("  PACKAGE update. Upgrades the globally installed 'workspace-sync' npm package itself");
  lines.push("  (runs 'npm install -g workspace-sync@latest'). Not project-specific. Run this first when");
  lines.push("  a newer WorkspaceSync version exists, then run 'update' in each project.");
  lines.push("");
  lines.push("workspace-sync doctor");
  lines.push("  Diagnostics: verifies local project paths, tests SSH connectivity to linked Testing/");
  lines.push("  Production hosts, and warns when installed skills are stale relative to this CLI version.");
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
  lines.push("  3. workspace-sync update                (anytime, to refresh this project)");
  lines.push("     workspace-sync self-update            (when a newer WorkspaceSync version is published)");
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
