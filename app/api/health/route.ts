// Temporary diagnostic: probes Supabase connectivity from the deployed env.
// Reports WHAT failed (auth vs network vs missing table) without leaking secrets.
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};

  const redact = (u?: string) => {
    if (!u) return "(unset)";
    try {
      const parsed = new URL(u);
      return `${parsed.hostname}:${parsed.port || "default"}/${parsed.pathname.replace(/^\//, "")}`;
    } catch {
      return "(unparseable)";
    }
  };

  out.databaseUrl = redact(process.env.DATABASE_URL);
  out.directUrl = redact(process.env.DIRECT_URL);
  out.discoveryMode = process.env.DISCOVERY_MODE ?? "(unset)";
  out.aiProvider = process.env.AI_PROVIDER ?? "(unset)";
  out.hasCronSecret = Boolean(process.env.CRON_SECRET);

  // Report only the SHAPE of the password, never its value, so we can tell
  // whether special characters still need percent-encoding.
  const inspectPassword = (url?: string) => {
    if (!url) return { present: false as const };
    const schemeEnd = url.indexOf("://");
    const at = url.lastIndexOf("@");
    if (schemeEnd === -1 || at === -1) return { present: false as const };
    const authority = url.slice(schemeEnd + 3, at);
    const colon = authority.indexOf(":");
    if (colon === -1) return { present: false as const };
    const raw = authority.slice(colon + 1);

    // Legal in a password, but MUST be percent-encoded in a connection string.
    const found = Array.from(new Set(raw.match(/[@:#/?[\]]/g) ?? []));

    return {
      present: true as const,
      length: raw.length,
      hasUnencodedSpecial: found.length > 0,
      specialCharsFound: found,
    };
  };

  out.databasePassword = inspectPassword(process.env.DATABASE_URL);
  out.directPassword = inspectPassword(process.env.DIRECT_URL);

  try {
    await db.$queryRaw`SELECT 1 AS ok`;
    out.connectivity = "OK";
  } catch (e) {
    const err = e as { code?: string; message?: string };
    out.connectivity = "FAILED";
    out.errorCode = err.code ?? "unknown";
    // Prisma error codes are safe to expose and tell us exactly what to fix.
    out.errorMessage = String(err.message ?? err).slice(0, 400);
  }

  // Check whether the tables exist (separate from connectivity).
  try {
    const rows = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('Event','Bookmark','View')
    `;
    const found = Number(rows[0]?.count ?? 0);
    out.tablesFound = found;
    out.tablesExpected = 3;
  } catch (e) {
    out.tableCheck = `FAILED: ${String((e as Error).message).slice(0, 200)}`;
  }

  return Response.json(out, { status: 200 });
}
