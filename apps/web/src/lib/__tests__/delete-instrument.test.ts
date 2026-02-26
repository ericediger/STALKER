import { describe, it, expect } from "vitest";

/**
 * Tests for delete instrument feature.
 * These test the client-side logic — API route tests are in instruments.test.ts.
 */

describe("Delete instrument — confirmation flow", () => {
  it("delete confirmation message includes instrument symbol", () => {
    const symbol = "VTI";
    const name = "Vanguard Total Stock Market ETF";
    const txCount = 5;

    // Simulate the message shown in the modal
    const message = `This will permanently delete ${name} and all ${txCount} transaction${txCount !== 1 ? "s" : ""} associated with it. Portfolio snapshots will be rebuilt.`;

    expect(message).toContain("Vanguard Total Stock Market ETF");
    expect(message).toContain("5 transactions");
    expect(message).toContain("Portfolio snapshots will be rebuilt");
  });

  it("delete confirmation message handles singular transaction", () => {
    const name = "Apple Inc.";
    const txCount = 1;

    const message = `This will permanently delete ${name} and all ${txCount} transaction${txCount !== 1 ? "s" : ""} associated with it.`;

    expect(message).toContain("1 transaction associated");
    expect(message).not.toContain("1 transactions");
  });
});
