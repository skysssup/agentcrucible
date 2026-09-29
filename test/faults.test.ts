import { describe, expect, it } from "vitest";
import { decideFault, shouldApplyFault, resolveOnCall } from "../src/faults.js";

describe("faults", () => {
  it("applies timeout_after_commit on the targeted call", () => {
    const d = decideFault(
      [{ target: "create_refund", kind: "timeout_after_commit", onCall: 1 }],
      "create_refund",
      1,
      "seed",
      0,
      { amount_cents: 100 }
    );
    expect(d.apply).toBe(true);
    expect(d.kind).toBe("timeout_after_commit");
    expect(d.maskAsError?.code).toBe("ETIMEDOUT");
  });

  it("skips non-matching call index", () => {
    expect(
      shouldApplyFault(
        { target: "create_refund", kind: "timeout", onCall: 2 },
        "create_refund",
        1,
        "seed",
        0
      )
    ).toBe(false);
  });

  it("fuzzes onCallRange deterministically", () => {
    const a = resolveOnCall(
      { target: "x", kind: "timeout", onCallRange: [1, 3] },
      "seed-a",
      0
    );
    const b = resolveOnCall(
      { target: "x", kind: "timeout", onCallRange: [1, 3] },
      "seed-a",
      0
    );
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(3);
  });

  it("mutates amount for silent_wrong_data", () => {
    const d = decideFault(
      [
        {
          target: "create_refund",
          kind: "silent_wrong_data",
          onCall: 1,
          params: { field: "amount_cents", delta: -50 },
        },
      ],
      "create_refund",
      1,
      "s",
      0,
      { amount_cents: 8400 }
    );
    expect(d.mutateResult?.({ amount_cents: 8400 })).toEqual({ amount_cents: 8350 });
  });
});
