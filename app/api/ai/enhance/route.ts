import { NextResponse, type NextRequest } from "next/server";
import { getEnhancer } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-identity";

/**
 * POST /api/ai/enhance { title, description, link? }
 * Runs the AI enhancement pipeline (summary + auto-tags).
 * Used live by the organizer form's "Generate" button.
 *
 * Rate limited because it is an unauthenticated call into a metered LLM: without
 * a limit, anyone who found the endpoint could spend the Groq quota on it.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimit(`enhance:${clientKey(request.headers)}`, {
    limit: 20,
    windowSeconds: 600,
  });
  if (!limited.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.resetSeconds) } }
    );
  }

  let body: { title?: string; description?: string; link?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!title && !description) {
    return NextResponse.json(
      { error: "Provide a title or description to enhance" },
      { status: 400 }
    );
  }

  const enhancement = await getEnhancer().enhance(title, description, body.link ?? undefined);

  return NextResponse.json({ enhancement });
}