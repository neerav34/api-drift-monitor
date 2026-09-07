/**
 * Learns a permissive JSON Schema from N sample responses, for endpoints
 * with no OpenAPI spec to diff against ("baseline mode"). A field only
 * becomes `required` if every sample had it; unknown fields are always
 * allowed (`additionalProperties: true`) since the goal is catching real
 * regressions, not being a strict validator.
 */
export function learnBaselineSchema(samples: unknown[]): Record<string, unknown> {
  if (samples.length === 0) {
    throw new Error("learnBaselineSchema requires at least one sample");
  }
  return inferNode(samples);
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function inferNode(values: unknown[]): Record<string, unknown> {
  const present = values.filter((v) => v !== undefined);
  const types = new Set(present.map(jsonType));

  if (types.has("object")) {
    const objects = present.filter(
      (v) => jsonType(v) === "object"
    ) as Record<string, unknown>[];
    const allKeys = new Set<string>();
    objects.forEach((o) => Object.keys(o).forEach((k) => allKeys.add(k)));

    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const key of allKeys) {
      const presentIn = objects.filter((o) =>
        Object.prototype.hasOwnProperty.call(o, key)
      );
      properties[key] = inferNode(presentIn.map((o) => o[key]));
      if (presentIn.length === objects.length) required.push(key);
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: true,
    };
  }

  if (types.has("array")) {
    const items = (present.filter((v) => jsonType(v) === "array") as unknown[][]).flat();
    return { type: "array", items: items.length ? inferNode(items) : {} };
  }

  const typeList = [...types];
  if (typeList.length === 0) return {};
  return { type: typeList.length === 1 ? typeList[0] : typeList };
}
