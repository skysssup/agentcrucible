import type { World, WorldTool } from "./types.js";

export interface FsFile {
  path: string;
  content: string;
  overwritten: boolean;
  idempotencyKey?: string;
}

interface FsState {
  files: FsFile[];
  seq: number;
  blockedWrites: number;
}

const FORBIDDEN_PREFIXES = ["/etc/", "/root/", "/sys/", "/proc/", "~/", "../"];

function normalizePath(raw: string): string {
  return raw.replace(/\\/g, "/").trim();
}

function isForbidden(path: string): boolean {
  const p = normalizePath(path);
  if (p.includes("..")) return true;
  return FORBIDDEN_PREFIXES.some((prefix) => p.startsWith(prefix) || p === prefix.slice(0, -1));
}

function cloneState(s: FsState): FsState {
  return {
    seq: s.seq,
    blockedWrites: s.blockedWrites,
    files: s.files.map((f) => ({ ...f })),
  };
}

export function createFilesystemWorld(): World {
  let state: FsState = { files: [], seq: 0, blockedWrites: 0 };

  const tools: WorldTool[] = [
    {
      name: "write_file",
      description: "Write content to a path under the workspace. Rejects path traversal.",
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
    description: "Sandbox filesystem with write/read and path-traversal guards.",
    tools,
    reset() {
      state = { files: [], seq: 0, blockedWrites: 0 };
    },
    snapshot() {
      return cloneState(state) as unknown as Record<string, unknown>;
    },
    restore(snap) {
      state = cloneState(snap as unknown as FsState);
    },
    invoke(tool, args) {
      if (tool === "write_file") {
        const path = normalizePath(String(args.path ?? ""));
        const content = String(args.content ?? "");
        const idem =
          args.idempotency_key !== undefined ? String(args.idempotency_key) : undefined;
        if (!path) throw new Error("write_file requires path");
        if (isForbidden(path)) {
          state.blockedWrites += 1;
          throw new Error(`EACCES: path escapes workspace: ${path}`);
        }
        if (idem) {
          const existing = state.files.find((f) => f.idempotencyKey === idem);
          if (existing) {
            return {
              path: existing.path,
              bytes: existing.content.length,
              deduplicated: true,
              overwritten: existing.overwritten,
            };
          }
        }
        const prior = state.files.find((f) => f.path === path);
        if (prior) {
          prior.content = content;
          prior.overwritten = true;
          if (idem) prior.idempotencyKey = idem;
          return {
            path,
            bytes: content.length,
            deduplicated: false,
            overwritten: true,
          };
        }
        state.seq += 1;
        state.files.push({
          path,
          content,
          overwritten: false,
          idempotencyKey: idem,
        });
        return {
          path,
          bytes: content.length,
          deduplicated: false,
          overwritten: false,
        };
      }
      if (tool === "read_file") {
        const path = normalizePath(String(args.path ?? ""));
        if (isForbidden(path)) throw new Error(`EACCES: path escapes workspace: ${path}`);
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
    diff(before, after) {
      const b = before as unknown as FsState;
      const a = after as unknown as FsState;
      const lines: string[] = [];
      const beforePaths = new Map((b.files ?? []).map((f) => [f.path, f]));
      for (const f of a.files ?? []) {
        const prev = beforePaths.get(f.path);
        if (!prev) {
          lines.push(`+ file ${f.path} bytes=${f.content.length}`);
        } else if (prev.content !== f.content) {
          lines.push(`~ file ${f.path} overwritten bytes=${f.content.length}`);
        }
      }
      if ((a.blockedWrites ?? 0) > (b.blockedWrites ?? 0)) {
        lines.push(`! blocked_writes +${(a.blockedWrites ?? 0) - (b.blockedWrites ?? 0)}`);
      }
      return lines;
    },
  };
}
