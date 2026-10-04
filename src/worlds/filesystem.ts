import { IDEMPOTENCY_KEY, objectSchema, readIdempotencyKey, seedField, type World, type WorldTool } from "./types.js";

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
  return path.includes("\0") || path.startsWith("/") || path.startsWith("~") || /^[a-zA-Z]:/.test(path) || path.split("/").includes("..");
}

const PATH = { type: "string" as const, minLength: 1, pattern: "\\S", description: "Relative workspace path" };

export function createFilesystemWorld(): World {
  let state: FsState = { files: [] };

  const tools: WorldTool[] = [
    {
      name: "write_file",
      description: "Write content to a path under the workspace. Rejects paths outside it.",
      mutating: true,
      inputSchema: objectSchema({ path: PATH, content: { type: "string", description: "File contents" }, idempotency_key: IDEMPOTENCY_KEY }, ["path", "content"]),
      outputSchema: objectSchema(
        { path: { type: "string" }, bytes: { type: "integer" }, deduplicated: { type: "boolean" }, overwritten: { type: "boolean" } },
        ["path", "bytes", "deduplicated", "overwritten"]
      ),
    },
    {
      name: "read_file",
      description: "Read a file in this workspace.",
      mutating: false,
      inputSchema: objectSchema({ path: PATH }, ["path"]),
      outputSchema: objectSchema({ path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
    },
    {
      name: "list_files",
      description: "List files in the workspace.",
      mutating: false,
      inputSchema: objectSchema({}),
      outputSchema: {
        type: "array",
        items: objectSchema({ path: { type: "string" }, bytes: { type: "integer" }, overwritten: { type: "boolean" } }, ["path", "bytes", "overwritten"]),
      },
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
    seed(records) {
      for (const r of records) {
        const path = normalizePath(r.id);
        if (escapesWorkspace(path)) throw new Error(`setup file ${r.id} is outside the workspace`);
        state.files.push({ path, content: seedField(r, "content", "string"), overwritten: false });
      }
    },
    snapshot() {
      return structuredClone(state) as unknown as Record<string, unknown>;
    },
    invoke(tool, args) {
      if (tool === "write_file") {
        const path = normalizePath(args.path);
        const content = String(args.content);
        const idempotencyKey = readIdempotencyKey(args);
        if (escapesWorkspace(path)) throw new Error(`EACCES: path escapes workspace: ${path}`);
        const existing = idempotencyKey ? state.files.find((f) => f.idempotencyKey === idempotencyKey) : undefined;
        if (existing) return { path: existing.path, bytes: existing.content.length, deduplicated: true, overwritten: existing.overwritten };
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
        return state.files.map((f) => ({ path: f.path, bytes: f.content.length, overwritten: f.overwritten }));
      }
      throw new Error(`unknown tool: ${tool}`);
    },
    records(snapshot) {
      return ((snapshot as unknown as FsState).files ?? []).map((f) => ({
        kind: "file",
        id: f.path,
        fields: { path: f.path, content: f.content, ...(f.idempotencyKey ? { idempotency_key: f.idempotencyKey } : {}) },
      }));
    },
  };
}
