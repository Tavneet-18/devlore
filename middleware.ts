import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminConfigured, verifyAdminToken } from "@/lib/admin-session";
import { isAuthBypassed } from "@/lib/auth-bypass";

/**
 * Admin gate.
 *
 * Runs on the Edge before any admin page or admin API handler, so an
 * unauthenticated request never reaches the database or the moderation code.
 *
 * Pages are redirected to the login screen; API routes get a bare 401. The
 * distinction matters for fetch callers: a redirect would arrive as a 200 with
 * an HTML body, which a client cannot distinguish from success.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Explicit development escape hatch. Everything below still applies once it
  // is switched off; nothing is removed.
  if (isAuthBypassed()) return NextResponse.next();

  // Fail closed. With no ADMIN_PASSWORD set there is no way to authenticate,
  // so admin stays shut rather than falling open.
  if (!isAdminConfigured()) {
    return isApi(pathname)
      ? NextResponse.json({ error: "Admin is not configured" }, { status: 503 })
      : new NextResponse("Admin is not configured", { status: 503 });
  }

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await verifyAdminToken(token)) return NextResponse.next();

  if (isApi(pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/admin/login", request.url);
  // Preserve where they were heading so login can bounce them back.
  if (pathname !== "/admin") login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

function isApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
