import { createServiceRoleClient } from "./service-role";

const MAX_PAGES = 5;
const PER_PAGE = 200;

/**
 * Supabase's admin API has no direct "get user by email" call -- only
 * paginated listUsers(). Fine at this app's scale; capped at a few pages
 * rather than an unbounded loop so a lookup can never run away.
 */
export async function findUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const supabase = createServiceRoleClient();
  const target = email.trim().toLowerCase();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`Failed to look up user: ${error.message}`);

    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match?.email) return { id: match.id, email: match.email };

    if (data.users.length < PER_PAGE) break; // last page
  }

  return null;
}
