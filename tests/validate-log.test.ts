import { describe, expect, it } from "vitest";
import { validateLogEntry } from "../src/validation/validate-log.js";

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

  it("accepts missing attributes as an empty object", () => {
    const { attributes, ...withoutAttrs } = valid;
    const result = validateLogEntry(withoutAttrs);
    expect(result).toMatchObject({ attributesJson: "{}" });
  });

  it("accepts a timestamp with a numeric offset", () => {
    const result = validateLogEntry({
      ...valid,
      timestamp: "2026-07-20T14:32:01.123+00:00",
    });
    expect(typeof result).not.toBe("string");
  });

  it("rejects empty service and message", () => {
    expect(validateLogEntry({ ...valid, service: "" })).toBe(
      "service must be a non-empty string",
    );
    expect(validateLogEntry({ ...valid, message: "" })).toBe(
      "message must be a non-empty string",
    );
  });

  it("rejects attribute arrays", () => {
    expect(validateLogEntry({ ...valid, attributes: [] })).toBe(
      "attributes must be a flat object",
    );
  });
});
