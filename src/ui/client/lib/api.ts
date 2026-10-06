/** The browser's side of the JSON API: every request carries the session token from the page. */

let token = typeof document === "undefined" ? "" : (document.querySelector<HTMLMetaElement>('meta[name="agentcrucible-token"]')?.content ?? "");
const listeners = new Set<(online: boolean) => void>();
let online = true;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

export function sessionToken(): string {
  return token;
}

/** After the server rotates the token, the page keeps working with the new one. */
export function setSessionToken(next: string): void {
  token = next;
}

/** Calls `fn` when the server stops or starts answering. */
export function onConnection(fn: (online: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setOnline(next: boolean): void {
  if (next === online) return;
  online = next;
  for (const fn of listeners) fn(online);
}

export function isOnline(): boolean {
  return online;
}

/** GET when `body` is undefined, otherwise POST with a JSON body. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-agentcrucible-token": token, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    setOnline(false);
    throw new ApiError("The AgentCrucible server is not answering. Start agentcrucible ui again, then reload.", 0, "offline");
  }
  setOnline(true);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (res.status === 403 && data.code === "token") throw new ApiError("This page belongs to an earlier agentcrucible ui session. Reload the page to reconnect.", 403, "token");
  if (!res.ok) throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status, data.code);
  return data as T;
}
