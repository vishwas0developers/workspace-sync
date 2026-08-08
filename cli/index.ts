import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { loadConfig, saveConfig, getConfigDir } from "../src/config/loader";
import { generateAgentMemory } from "../src/memory/generator";
import { executeSSHCommand } from "../src/ssh/client";
import { getLocalGitInfo } from "../src/tools/local";
import { installWorkspaceSync } from "../install/index";

const program = new Command();

program
  .name("workspace-sync")
  .description("WorkspaceSync MCP management command-line interface")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize workspace sync metadata directory")
  .option("-n, --name <name>", "Workspace name", path.basename(process.cwd()))
  .action((options) => {
    const configDir = getConfigDir();
    if (fs.existsSync(configDir)) {
      console.log(chalk.yellow(`WorkspaceSync configuration already exists at ${configDir}`));
      return;
    }

    const config = {
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
        console.log(chalk.yellow("No projects registered. Run 'workspace-sync add-project'"));
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
  .description("Add a local project folder to the workspace orchestration")
  .option("-g, --git <repository>", "Git repository name/url")
  .action((name, localPath, options) => {
    try {
      const config = loadConfig();
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
  .description("Link testing environment to project")
  .action((project, sshAlias, remotePath) => {
    try {
      const config = loadConfig();
      if (!config.projects[project]) {
        console.error(chalk.red(`Error: Project '${project}' does not exist.`));
        return;
      }

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
  .description("Link production environment to project")
  .action((project, sshAlias, remotePath) => {
    try {
      const config = loadConfig();
      if (!config.projects[project]) {
        console.error(chalk.red(`Error: Project '${project}' does not exist.`));
        return;
      }

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
  .command("install")
  .description("Install skill files and workspace-level MCP settings configuration")
  .action(() => {
    try {
      installWorkspaceSync();
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
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

program.parse(process.argv);
