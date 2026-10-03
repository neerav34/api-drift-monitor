import { afterEach, describe, expect, it, vi } from "vitest";

const listUsersMock = vi.fn();
vi.mock("./service-role", () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { listUsers: listUsersMock } },
  }),
}));

afterEach(() => {
  listUsersMock.mockReset();
});

describe("findUserByEmail", () => {
  it("finds a user by case-insensitive email match", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "u1", email: "Dev@Example.com" }] },
      error: null,
    });
    const { findUserByEmail } = await import("./find-user-by-email");

    expect(await findUserByEmail("dev@example.com")).toEqual({ id: "u1", email: "Dev@Example.com" });
  });

  it("returns null when no user matches", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    const { findUserByEmail } = await import("./find-user-by-email");

    expect(await findUserByEmail("nobody@example.com")).toBeNull();
  });

  it("paginates until it finds a match or runs out of pages", async () => {
    listUsersMock
      .mockResolvedValueOnce({
        data: { users: Array.from({ length: 200 }, (_, i) => ({ id: `p1-${i}`, email: `a${i}@x.com` })) },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { users: [{ id: "p2-match", email: "target@example.com" }] },
        error: null,
      });
    const { findUserByEmail } = await import("./find-user-by-email");

    const result = await findUserByEmail("target@example.com");
    expect(result).toEqual({ id: "p2-match", email: "target@example.com" });
    expect(listUsersMock).toHaveBeenCalledTimes(2);
  });

  it("throws when the admin API errors", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: { message: "unauthorized" } });
    const { findUserByEmail } = await import("./find-user-by-email");

    await expect(findUserByEmail("dev@example.com")).rejects.toThrow(
      "Failed to look up user: unauthorized"
    );
  });
});
