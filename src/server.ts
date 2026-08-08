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
import { logAudit } from "./audit/logger";

const server = new Server(
  {
    name: "workspace-sync",
    version: "0.1.0",
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
            service: { type: "string", description: "Service unit name or syslog" },
            limit: { type: "number", description: "Lines limit" },
          },
          required: ["project", "environment", "service"],
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
        result = await remoteTree(config, prjName, envName);
        break;
      }
      case "remote_file_read": {
        const prjName = String(args?.project);
        const envName = String(args?.environment) as "testing" | "production";
        const filePath = String(args?.path);
        project = prjName;
        environment = envName;
        result = await remoteFileRead(config, prjName, envName, filePath);
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
        result = await remoteLogs(config, prjName, envName, service, limit);
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
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: err.message,
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
