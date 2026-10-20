import { describe, expect, it } from "vitest";
import { isProposalApproved } from "./rules";

describe("isProposalApproved", () => {
  it("贊成多於反對時通過", () => {
    expect(isProposalApproved(4, 3)).toBe(true);
  });

  it("平票視為失敗", () => {
    expect(isProposalApproved(3, 3)).toBe(false);
  });

  it("反對多於贊成時失敗", () => {
    expect(isProposalApproved(2, 5)).toBe(false);
  });
});
