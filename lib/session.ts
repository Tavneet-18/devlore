import { cookies } from "next/headers";

export const VIEWER_COOKIE = "devlore_visitor";

/**
 * Returns the anonymous visitor id for the current request, if one exists.
 * Server Components can only read cookies — route handlers create and set
 * the cookie on first interaction (see app/api/bookmarks/*).
 */
export async function getViewerId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(VIEWER_COOKIE)?.value ?? null;
}

export function newViewerId(): string {
  return crypto.randomUUID();
}