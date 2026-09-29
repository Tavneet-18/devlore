/**
 * Development escape hatch.
 *
 * Phase 1 put authentication in front of /admin, /api/admin/* and the
 * detailed /api/health report. That work stays; this flag steps around it
 * while the site is being built out.
 *
 * The default is FAIL CLOSED. Anything other than the exact string "true"
 * leaves authentication enforced, so forgetting to remove the variable at
 * launch turns security ON rather than leaving it off. That is the only safe
 * direction for a default.
 *
 * Deliberately NOT bypassed by this flag:
 *   - rate limits on submission and AI assist (they protect the Groq quota)
 *   - the cron Bearer secret (it protects a metered external operation, not
 *     the website)
 *   - honeypot and output validation (anti-abuse, not authentication)
 *
 * Remove the flag and the variable entirely for a public launch; nothing else
 * needs to change.
 */
export function isAuthBypassed(): boolean {
  return process.env.AUTH_BYPASS === "true";
}

/** Surfaced in the admin UI and the health report so the state is never silent. */
export const BYPASS_WARNING =
  "Authentication is bypassed (AUTH_BYPASS=true). Do not launch publicly in this state.";
