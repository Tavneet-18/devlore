import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_OPTS,
  createAdminToken,
  isAdminConfigured,
  verifyAdminToken,
} from "@/lib/admin-session";
import { checkThrottle, clearThrottle, clientKey, recordFailure, safeEqual } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/session
 * Exchange ADMIN_PASSWORD for a signed session cookie. Throttled per client.
 */
export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Admin is not configured" }, { status: 503 });
  }

  const key = clientKey(request.headers);
  const gate = checkThrottle(key);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } }
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expected = process.env.ADMIN_PASSWORD ?? "";

  // Compare before branching on length so the response time does not reveal
  // anything about the expected value.
  const ok = safeEqual(password, expected);

  if (!ok) {
    const after = recordFailure(key);
    // A short delay blunts fast brute-forcing even before the lock engages.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json(
      { error: "Incorrect password", remaining: after.remaining },
      {
        status: 401,
        headers: after.allowed ? {} : { "Retry-After": String(after.retryAfterSeconds) },
      }
    );
  }

  clearThrottle(key);
  const token = await createAdminToken();
  if (!token) {
    return NextResponse.json({ error: "Admin is not configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, ADMIN_COOKIE_OPTS);
  return res;
}

/** DELETE /api/admin/session — sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...ADMIN_COOKIE_OPTS, maxAge: 0 });
  return res;
}

/** GET /api/admin/session — used by the login screen to skip a needless form. */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  const valid = await verifyAdminToken(token);
  return NextResponse.json(
    { authenticated: valid, configured: isAdminConfigured() },
    { status: valid ? 200 : 401 }
  );
}
