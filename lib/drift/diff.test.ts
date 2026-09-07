import { describe, expect, it } from "vitest";
import { diffResponseAgainstSchema } from "./diff";

const schema = {
  type: "object",
  properties: {
    id: { type: "number" },
    email: { type: "string" },
    user: {
      type: "object",
      properties: {
        middleName: { type: "string" },
      },
      required: ["middleName"],
    },
  },
  required: ["id", "email"],
};

describe("diffResponseAgainstSchema", () => {
  it("flags a missing required field", () => {
    const result = diffResponseAgainstSchema(schema, { id: 1 });
    expect(result.status).toBe("drift");
    expect(result.drift).toContainEqual({ type: "missing", field: "email" });
  });

  it("suppresses a field present in drift_ignores", () => {
    const result = diffResponseAgainstSchema(
      schema,
      { id: 1, user: {} },
      ["email", "user.middleName"]
    );
    expect(result.status).toBe("ok");
    expect(result.drift).toEqual([]);
  });

  it("flags a wrong type", () => {
    const result = diffResponseAgainstSchema(schema, {
      id: "not-a-number",
      email: "a@b.com",
    });
    expect(result.status).toBe("drift");
    expect(result.drift).toContainEqual({
      type: "wrongType",
      field: "id",
      expected: "number",
      got: "string",
    });
  });

  it("passes a response matching the schema", () => {
    const result = diffResponseAgainstSchema(schema, {
      id: 1,
      email: "a@b.com",
    });
    expect(result).toEqual({ status: "ok", drift: [] });
  });
});
