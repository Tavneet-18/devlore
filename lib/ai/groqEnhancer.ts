import type { AIEnhancement, AIEnhancer } from "./types";
import { MockAIEnhancer } from "./mockEnhancer";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

/**
 * Groq LLM enhancer — OpenAI-compatible, free tier 14k req/day.
 * Falls back to MockAIEnhancer on any error (no key, 429, parse fail).
 */
export class GroqEnhancer implements AIEnhancer {
  private fallback = new MockAIEnhancer();

  async enhance(title: string, description: string, link?: string): Promise<AIEnhancement> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return this.fallback.enhance(title, description, link);

    try {
      const prompt = `You are Devlore enhancer. Given title and description, return JSON with:
- summary: one sentence <=170 chars, compelling, covers what attendees do/learn
- tags: 3-5 tags from [AI / ML, Web Dev, Mobile Dev, Cloud, Web3, Design, Security, Career, Hackathon, Workshop, Meetup, Webinar]
- domain: primary domain from tags
- beginnerFriendly: boolean (true if mentions beginner, no experience, freshers, students)
- isOnline: boolean (true if mentions online, virtual, remote, webinar, zoom, or link contains meet/zoom/youtube/online)

Title: ${title}
Description: ${description}
Link: ${link ?? ""}

Return ONLY valid JSON.`;

      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "You output only valid JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 400,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) throw new Error(`Groq ${res.status}`);
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content);

      // Validate shapes
      if (!parsed.summary || !Array.isArray(parsed.tags)) throw new Error("Invalid Groq JSON");

      return {
        summary: String(parsed.summary).slice(0, 170),
        tags: parsed.tags.map(String).slice(0, 6),
        domain: String(parsed.domain ?? "Tech"),
        beginnerFriendly: Boolean(parsed.beginnerFriendly),
        isOnline: Boolean(parsed.isOnline),
      };
    } catch {
      // Fallback to deterministic mock on any failure
      return this.fallback.enhance(title, description, link);
    }
  }
}
