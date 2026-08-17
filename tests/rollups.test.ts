import { describe, expect, it } from "vitest";
import {
  buildRollupIncrements,
  canUseRollups,
  secondBucketIso,
} from "../src/db/rollups.js";
import { AggregateQueryFilters, NewLog } from "../src/types.js";

function filters(
  overrides: Partial<AggregateQueryFilters> = {},
): AggregateQueryFilters {
  return {
    since: new Date("2026-07-20T14:00:00Z"),
    until: new Date("2026-07-20T15:00:00Z"),
    attributes: {},
    bucket: "1m",
    ...overrides,
  };
}

describe("secondBucketIso", () => {
  it("floors to the UTC second, matching date_bin from epoch", () => {
    expect(secondBucketIso("2026-07-20T14:32:01.123Z")).toBe(
      "2026-07-20T14:32:01.000Z",
    );
  });
});

describe("buildRollupIncrements", () => {
  it("groups by second, service, and level", () => {
    const entries: NewLog[] = [
      {
        timestamp: "2026-07-20T14:32:01.123Z",
        level: "error",
        service: "checkout",
        message: "a",
        attributesJson: "{}",
      },
      {
        timestamp: "2026-07-20T14:32:01.999Z",
        level: "error",
        service: "checkout",
        message: "b",
        attributesJson: "{}",
      },
      {
        timestamp: "2026-07-20T14:32:01.500Z",
        level: "info",
        service: "checkout",
        message: "c",
        attributesJson: "{}",
      },
    ];

    expect(buildRollupIncrements(entries)).toEqual([
      {
        bucketStart: "2026-07-20T14:32:01.000Z",
        service: "checkout",
        level: "error",
        count: 2,
      },
      {
        bucketStart: "2026-07-20T14:32:01.000Z",
        service: "checkout",
        level: "info",
        count: 1,
      },
    ]);
  });
});

describe("canUseRollups", () => {
  it("allows time/service/level aggregates", () => {
    expect(canUseRollups(filters({ service: "checkout", level: "error" }))).toBe(
      true,
    );
  });

  it("falls back when message or attribute filters are present", () => {
    expect(canUseRollups(filters({ q: "declined" }))).toBe(false);
    expect(canUseRollups(filters({ attributes: { user_id: "42" } }))).toBe(
      false,
    );
  });
});
