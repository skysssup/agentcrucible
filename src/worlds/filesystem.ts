import { readIdempotencyKey, type World, type WorldTool } from "./types.js";

export interface FsFile {
  path: string;
  content: string;
  overwritten: boolean;
  idempotencyKey?: string;
}

interface FsState {
  files: FsFile[];
}

function normalizePath(raw: unknown): string {
  return String(raw ?? "").replace(/\\/g, "/").trim();
}

/** Only relative paths inside the workspace are allowed. */
function escapesWorkspace(path: string): boolean {
  return (
    path.includes("\0") ||
    path.startsWith("/") ||
    path.startsWith("~") ||
    /^[a-zA-Z]:/.test(path) ||
    path.split("/").includes("..")
  );
}

export function createFilesystemWorld(): World {
  let state: FsState = { files: [] };

  const tools: WorldTool[] = [
    {
      name: "write_file",
      description: "Write content to a path under the workspace. Rejects paths outside it.",
      mutating: true,
      parameters: {
        path: { type: "string", description: "Relative workspace path", required: true },
        content: { type: "string", description: "File contents", required: true },
        idempotency_key: { type: "string", description: "Optional idempotency key" },
      },
    },
    {
      name: "read_file",
      description: "Read a file previously written in this workspace.",
      mutating: false,
      parameters: {
        path: { type: "string", description: "Relative workspace path", required: true },
      },
    },
    {
      name: "list_files",
      description: "List files in the workspace.",
      mutating: false,
      parameters: {},
    },
  ];

  return {
    name: "filesystem",
    description: "Workspace files. write_file rejects absolute and parent-relative paths.",
    tools,
    recordFields: {
      file: { path: "string", content: "string", idempotency_key: "string" },
    },
    reset() {
      state = { files: [] };
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "write_file") {
        const path = normalizePath(args.path);
        const content = String(args.content ?? "");
        const idempotencyKey = readIdempotencyKey(tool, args);
        if (!path) throw new Error("write_file requires path");
        if (escapesWorkspace(path)) throw new Error(`EACCES: path escapes workspace: ${path}`);
        const existing = idempotencyKey
          ? state.files.find((f) => f.idempotencyKey === idempotencyKey)
          : undefined;
        if (existing) {
          return {
            path: existing.path,
            bytes: existing.content.length,
            deduplicated: true,
            overwritten: existing.overwritten,
          };
        }
        const prior = state.files.find((f) => f.path === path);
        if (prior) {
          prior.content = content;
          prior.overwritten = true;
          if (idempotencyKey) prior.idempotencyKey = idempotencyKey;
        } else {
          state.files.push({ path, content, overwritten: false, idempotencyKey });
        }
        return { path, bytes: content.length, deduplicated: false, overwritten: Boolean(prior) };
      }
      if (tool === "read_file") {
        const path = normalizePath(args.path);
        if (escapesWorkspace(path)) throw new Error(`EACCES: path escapes workspace: ${path}`);
        const file = state.files.find((f) => f.path === path);
        if (!file) throw new Error(`ENOENT: ${path}`);
        return { path: file.path, content: file.content };
      }
      if (tool === "list_files") {
        return state.files.map((f) => ({
          path: f.path,
          bytes: f.content.length,
          overwritten: f.overwritten,
        }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      const files = (snapshot as unknown as FsState).files ?? [];
      return files.map((f) => ({
        kind: "file",
        id: f.path,
        fields: {
          path: f.path,
          content: f.content,
          ...(f.idempotencyKey ? { idempotency_key: f.idempotencyKey } : {}),
        },
      }));
    },
  };
}
