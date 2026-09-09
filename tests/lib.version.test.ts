import { describe, expect, it } from "vitest";

import { parseQuotaBuildMetadata } from "../src/lib/version.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

describe("quota build metadata", () => {
  it("accepts a release line and exact ten-character Git identity", () => {
    expect(
      parseQuotaBuildMetadata({
        releaseLine: "4.9.0",
        commit: COMMIT,
        shortCommit: COMMIT.slice(0, 10),
        displayVersion: "4.9.0-sky.g0123456789",
      }),
    ).toEqual({
      releaseLine: "4.9.0",
      commit: COMMIT,
      shortCommit: "0123456789",
      displayVersion: "4.9.0-sky.g0123456789",
    });
  });

  it.each([
    ["non-object", null],
    [
      "short commit",
      {
        releaseLine: "4.9.0",
        commit: COMMIT,
        shortCommit: "0123",
        displayVersion: "4.9.0-sky.g0123",
      },
    ],
    [
      "mismatched short commit",
      {
        releaseLine: "4.9.0",
        commit: COMMIT,
        shortCommit: "fedcba9876",
        displayVersion: "4.9.0-sky.gfedcba9876",
      },
    ],
    [
      "mismatched display version",
      {
        releaseLine: "4.9.0",
        commit: COMMIT,
        shortCommit: "0123456789",
        displayVersion: "4.8.2-sky.g0123456789",
      },
    ],
  ])("rejects %s metadata", (_name, value) => {
    expect(parseQuotaBuildMetadata(value)).toBeNull();
  });
});
