import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHash } from "../src/ui/client/routes.js";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("recoverable console startup", () => {
  it("keeps malformed pasted report ids routable", () => {
    expect(parseHash("#/report/unfinished%2?trial=1")).toMatchObject({ route: "report", arg: "unfinished%2" });
    expect(parseHash("#/scenario/a%2Fb").arg).toBe("a/b");
  });

  it("boots even when the browser refuses storage access", async () => {
    vi.stubGlobal("localStorage", { getItem() { throw new DOMException("Storage blocked", "SecurityError"); } });
    const { store, savePrefs } = await import("../src/ui/client/lib/state.js");
    expect(store.draft).toBeNull();
    expect(store.prefs.trials).toBe(3);
    expect(() => savePrefs({ theme: "dark" })).not.toThrow();
  });
});
