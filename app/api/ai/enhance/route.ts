import { NextResponse, type NextRequest } from "next/server";
import { getEnhancer } from "@/lib/ai";

/**
 * POST /api/ai/enhance { title, description, link? }
 * Runs the AI enhancement pipeline (summary + auto-tags).
 * Used live by the organizer form's "Enhance with AI" button.
 */
export async function POST(request: NextRequest) {
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