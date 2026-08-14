import { describe, expect, it } from "vitest";
import { BadRequestError } from "../src/utils/errors.js";
import {
  encodeCursor,
  parseAggregateQuery,
  parseLogQuery,
} from "../src/validation/parse-query.js";

describe("parseLogQuery", () => {
  it("applies default limit", () => {
    expect(parseLogQuery({}).limit).toBe(100);
  });

  it("rejects unsupported levels", () => {
    expect(() => parseLogQuery({ level: "critical" })).toThrow(BadRequestError);
  });

  it("rejects until earlier than since", () => {
    expect(() =>
      parseLogQuery({
        since: "2026-07-20T15:00:00Z",
        until: "2026-07-20T14:00:00Z",
      }),
    ).toThrow(/until must not be earlier than since/);
  });

  it("parses attr filters", () => {
    const filters = parseLogQuery({ "attr.user_id": "42" });
    expect(filters.attributes).toEqual({ user_id: "42" });
  });

  it("rejects a malformed cursor", () => {
    expect(() => parseLogQuery({ cursor: "not-a-cursor" })).toThrow(
      /invalid or malformed cursor/,
    );
  });

  it("accepts a well-formed cursor", () => {
    const cursor = encodeCursor(
      new Date("2026-07-20T14:32:01.123Z"),
      "11111111-1111-1111-1111-111111111111",
    );
    const filters = parseLogQuery({ cursor });
    expect(filters.cursor?.id).toBe("11111111-1111-1111-1111-111111111111");
  });
});

describe("parseAggregateQuery", () => {
  it("requires since, until, and bucket", () => {
    expect(() => parseAggregateQuery({})).toThrow(/since is required/);
  });

  it("accepts a valid aggregation query", () => {
    const filters = parseAggregateQuery({
      since: "2026-07-20T14:00:00Z",
      until: "2026-07-20T15:00:00Z",
      bucket: "1m",
      group_by: "service",
    });
    expect(filters.bucket).toBe("1m");
    expect(filters.groupBy).toBe("service");
  });

  it("rejects an invalid bucket", () => {
    expect(() =>
      parseAggregateQuery({
        since: "2026-07-20T14:00:00Z",
        until: "2026-07-20T15:00:00Z",
        bucket: "2m",
      }),
    ).toThrow(/bucket must be one of/);
  });
});
