import { describe, expect, it } from "vitest";
import { learnBaselineSchema } from "./baseline";
import { diffResponseAgainstSchema } from "./diff";

describe("learnBaselineSchema", () => {
  it("only requires fields present in every sample", () => {
    const schema = learnBaselineSchema([
      { id: 1, name: "a" },
      { id: 2, name: "b", nickname: "bee" },
    ]);
    expect(schema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["id", "name"]),
    });
    expect((schema.required as string[]).includes("nickname")).toBe(false);
  });

  it("a schema learned from clean samples doesn't flag a normal response", () => {
    const schema = learnBaselineSchema([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    const result = diffResponseAgainstSchema(schema, { id: 3, name: "c" });
    expect(result.status).toBe("ok");
  });

  it("flags a real regression: a field that was always present goes missing", () => {
    const schema = learnBaselineSchema([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    const result = diffResponseAgainstSchema(schema, { id: 3 });
    expect(result.status).toBe("drift");
  });
});
