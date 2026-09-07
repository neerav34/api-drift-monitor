import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Refreshes the Supabase session cookie on every request. Renamed from
// `middleware.ts` to `proxy.ts` per Next.js 16's file convention.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/ingest|api/badge).*)",
  ],
};
