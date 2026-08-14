import { describe, expect, it } from "vitest";
import { validateLogEntry } from "../src/utils/validate-log.js";

describe("validateLogEntry", () => {
  const valid = {
    timestamp: "2026-07-20T14:32:01.123Z",
    level: "error",
    service: "checkout",
    message: "payment declined",
    attributes: { user_id: "42", retries: 3 },
  };

  it("accepts a valid log", () => {
    const result = validateLogEntry(valid);
    expect(typeof result).not.toBe("string");
  });

  it("rejects an unsupported level", () => {
    expect(validateLogEntry({ ...valid, level: "critical" })).toBe(
      "invalid level: 'critical'",
    );
  });

  it("rejects nested attributes", () => {
    expect(
      validateLogEntry({ ...valid, attributes: { nested: { a: 1 } } }),
    ).toBe("attributes values must be strings, numbers, or booleans");
  });

  it("rejects timestamps more than five minutes in the future", () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(validateLogEntry({ ...valid, timestamp: future })).toBe(
      "timestamp must not be more than five minutes in the future",
    );
  });
});
