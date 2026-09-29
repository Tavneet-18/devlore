/**
 * Best-effort client identity for throttling.
 *
 * Kept in its own module with no dependencies so both the login route and the
 * public rate limiter can use it without pulling in each other's imports.
 *
 * `x-forwarded-for` is client-controllable in principle, but on Vercel the
 * platform sets it and the left-most entry is the real client. That is good
 * enough to make brute-forcing expensive; it is not an identity, and nothing
 * authorises on the basis of it.
 */
export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
