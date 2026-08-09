import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config/loader";
import { workspaceInfo, listProjects, getProject, workspaceContext } from "./tools/workspace";
import { listEnvironments, getEnvironment, compareEnvironments } from "./tools/environment";
import {
  remoteTree,
  remoteFileRead,
  remoteGitStatus,
  remoteGitRevision,
  remoteLogs,
  remoteServices,
  remoteProcesses
} from "./tools/remote";
import { getLocalGitInfo } from "./tools/local";
import { remoteDbQuery, remoteDbSchema } from "./tools/database";
import { CommandRejectedError } from "./security/command-guard";
import { logAudit } from "./audit/logger";
import * as path from "path";

const pkg = require(path.join(__dirname, "..", "..", "package.json"));

const server = new Server(
  {
    name: "workspace-sync",
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "workspace_context",
        description: "Fetch the complete workspace and projects map in a single call. Use at session startup.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "workspace_info",
        description: "Get general metadata details about the current workspace.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_projects",
        description: "List all projects configured in the workspace.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_project",
        description: "Get detailed settings, environments, and policies for a specific project.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
          },
          required: ["project"],
        },
      },
      {
        name: "local_git_status",
        description: "Inspect the local Git state of a project directory.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
          },
          required: ["project"],
        },
      },
      {
        name: "list_environments",
        description: "List configured deployment environments for a project.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
          },
          required: ["project"],
        },
      },
      {
        name: "get_environment",
        description: "Get detailed connection and policy info for a specific project environment (testing or production).",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
          },
          required: ["project", "environment"],
        },
      },
      {
        name: "compare_environments",
        description: "Compare Git revision differences between testing and production environments.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
          },
          required: ["project"],
        },
      },
      {
        name: "remote_tree",
        description: "Inspect files and folders on a remote environment.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
            path: { type: "string", description: "Relative subdirectory to list (default: project root)" },
            depth: { type: "number", description: "Max listing depth (default 2)" },
            showHidden: { type: "boolean", description: "Include dotfiles/dotdirs such as .git and .env* (default false)" },
          },
          required: ["project", "environment"],
        },
      },
      {
        name: "remote_file_read",
        description: "Read content of a file on a remote environment safely.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
            path: { type: "string", description: "Relative file path" },
            offset: { type: "number", description: "1-based starting line, for reading a range of a large file" },
            limit: { type: "number", description: "Max lines to return when offset/limit is used" },
          },
          required: ["project", "environment", "path"],
        },
      },
      {
        name: "remote_git_status",
        description: "Inspect Git status on a remote environment.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
          },
          required: ["project", "environment"],
        },
      },
      {
        name: "remote_git_revision",
        description: "Fetch current deployed Git revision on a remote environment.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
          },
          required: ["project", "environment"],
        },
      },
      {
        name: "remote_logs",
        description: "Fetch logs from a remote environment service (e.g. systemd app logs, docker, pm2, syslog).",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
            service: { type: "string", description: "Systemd unit name, 'syslog', 'file:<relative-or-/var/log-path>', 'pm2:<app>', or 'docker:<container>'" },
            limit: { type: "number", description: "Lines limit" },
            grep: { type: "string", description: "Case-insensitive substring filter applied to returned lines" },
          },
          required: ["project", "environment", "service"],
        },
      },
      {
        name: "remote_db_schema",
        description: "List tables, or describe a single table's columns, in the project's database on a remote environment. Read-only.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
            table: { type: "string", description: "Optional table name to DESCRIBE; omit to SHOW TABLES" },
            envFile: { type: "string", description: "Relative path to the app's env file holding DB_* credentials (default: .env)" },
          },
          required: ["project", "environment"],
        },
      },
      {
        name: "remote_db_query",
        description: "Run a read-only SELECT/SHOW/DESCRIBE/EXPLAIN query against the project's database on a remote environment. Mutating statements are rejected.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
            sql: { type: "string", description: "A single SELECT, SHOW, DESCRIBE, or EXPLAIN statement" },
            limit: { type: "number", description: "Row cap appended to SELECT statements without an explicit LIMIT (default 200)" },
            envFile: { type: "string", description: "Relative path to the app's env file holding DB_* credentials (default: .env)" },
          },
          required: ["project", "environment", "sql"],
        },
      },
      {
        name: "remote_services",
        description: "Inspect active system services running on the remote VPS.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
          },
          required: ["project", "environment"],
        },
      },
      {
        name: "remote_processes",
        description: "Inspect active OS processes running on the remote VPS.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Project name" },
            environment: { type: "string", enum: ["testing", "production"] },
          },
          required: ["project", "environment"],
        },
      },
      {
        name: "workspace_undo",
        description: "Perform a single-step rollback of the last reversible WorkspaceSync configuration operation.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

// Call tool implementation
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const config = loadConfig();
  const startTime = Date.now();
  
  let result: any = null;
  let success = true;
  let project = "global";
  let environment = "local";

  try {
    switch (name) {
      case "workspace_context": {
        result = workspaceContext(config);
        break;
      }
      case "workspace_info": {
        result = workspaceInfo(config);
        break;
      }
      case "list_projects": {
        result = listProjects(config);
        break;
      }
      case "get_project": {
        const prjName = String(args?.project);
        project = prjName;
        result = getProject(config, prjName);
        break;
      }
      case "local_git_status": {
        const prjName = String(args?.project);
        project = prjName;
        const prj = config.projects[prjName];
        if (!prj) throw new Error(`Project ${prjName} not found.`);
        
        const policy = config.policies[prjName];
        if (policy) {
          const { enforcePermission } = require("./security/permissions");
          enforcePermission(prjName, policy, "readLocal");
        }

        result = await getLocalGitInfo(prj.localPath, process.cwd());
        break;
      }
      case "list_environments": {
        const prjName = String(args?.project);
        project = prjName;
        result = listEnvironments(config, prjName);
        break;
      }
      case "get_environment": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        project = prjName;
        environment = envName;
        result = getEnvironment(config, prjName, envName);
        break;
      }
      case "compare_environments": {
        const prjName = String(args?.project);
        project = prjName;
        result = await compareEnvironments(config, prjName);
        break;
      }
      case "remote_tree": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        project = prjName;
        environment = envName;
        result = await remoteTree(config, prjName, envName, {
          path: args?.path ? String(args.path) : undefined,
          depth: args?.depth !== undefined ? Number(args.depth) : undefined,
          showHidden: Boolean(args?.showHidden),
        });
        break;
      }
      case "remote_file_read": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        const filePath = String(args?.path);
        project = prjName;
        environment = envName;
        result = await remoteFileRead(config, prjName, envName, filePath, {
          offset: args?.offset !== undefined ? Number(args.offset) : undefined,
          limit: args?.limit !== undefined ? Number(args.limit) : undefined,
        });
        break;
      }
      case "remote_db_schema": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        project = prjName;
        environment = envName;
        result = await remoteDbSchema(config, prjName, envName, {
          table: args?.table ? String(args.table) : undefined,
          envFile: args?.envFile ? String(args.envFile) : undefined,
        });
        break;
      }
      case "remote_db_query": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        const sql = String(args?.sql);
        project = prjName;
        environment = envName;
        result = await remoteDbQuery(config, prjName, envName, sql, {
          limit: args?.limit !== undefined ? Number(args.limit) : undefined,
          envFile: args?.envFile ? String(args.envFile) : undefined,
        });
        break;
      }
      case "remote_git_status": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        project = prjName;
        environment = envName;
        result = await remoteGitStatus(config, prjName, envName);
        break;
      }
      case "remote_git_revision": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        project = prjName;
        environment = envName;
        result = await remoteGitRevision(config, prjName, envName);
        break;
      }
      case "remote_logs": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        const service = String(args?.service);
        const limit = Number(args?.limit || 200);
        project = prjName;
        environment = envName;
        result = await remoteLogs(config, prjName, envName, service, limit, {
          grep: args?.grep ? String(args.grep) : undefined,
        });
        break;
      }
      case "remote_services": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        project = prjName;
        environment = envName;
        result = await remoteServices(config, prjName, envName);
        break;
      }
      case "remote_processes": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        project = prjName;
        environment = envName;
        result = await remoteProcesses(config, prjName, envName);
        break;
      }
      case "workspace_undo": {
        const { loadUndoSnapshot, performUndo } = require("./config/undo");
        const snapshot = loadUndoSnapshot(process.cwd());
        if (!snapshot) {
          result = { status: "ignored", message: "Nothing to undo. No previous reversible operation found." };
        } else {
          const desc = snapshot.description;
          await performUndo({ yes: true }, process.cwd());
          result = { status: "success", message: `Successfully undone last operation: ${desc}. Restored previous workspace state.` };
        }
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: any) {
    success = false;

    // A best-effort classification so an agent can tell "permission denied" from
    // "host unreachable" from "not found" without re-parsing free-text messages —
    // previously every failure returned only `err.message` with no code at all.
    let code = "internal_error";
    if (err instanceof CommandRejectedError) code = "command_rejected";
    else if (/Permission Denied/i.test(err.message)) code = "permission_denied";
    else if (/Access Denied/i.test(err.message)) code = "access_denied";
    else if (/not found in workspace configuration|not configured for project/i.test(err.message)) code = "not_configured";
    else if (/SSH executable not found/i.test(err.message)) code = "ssh_missing";
    else if (/timed out/i.test(err.message)) code = "timeout";
    else if (/not a Git repository/i.test(err.message)) code = "not_a_git_repo";
    else if (/Policy not configured/i.test(err.message)) code = "policy_missing";

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ code, message: err.message }, null, 2),
        },
      ],
    };
  } finally {
    const duration = Date.now() - startTime;
    logAudit(process.cwd(), project, environment, name, duration, success, args);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error running MCP Stdio Server:", error);
  process.exit(1);
});
