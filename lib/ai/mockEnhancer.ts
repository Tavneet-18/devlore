import type { AIEnhancement, AIEnhancer } from "./types";

/**
 * Deterministic, keyword-based "AI" enhancement.
 * This is a stand-in for a real LLM. It produces stable summaries,
 * auto-tags and domain classification without network calls so the MVP
 * runs anywhere. Swap for a real model in ./index.ts.
 */
const DOMAINS: { keys: string[]; domain: string; tags: string[] }[] = [
  { keys: ["ai", "ml", "llm", "machine learning", "genai", "generative", "agent", "deep learning", "nlp", "data science"], domain: "AI / ML", tags: ["AI / ML"] },
  { keys: ["web", "react", "next.js", "javascript", "typescript", "frontend", "full-stack", "full stack", "css"], domain: "Web Dev", tags: ["Web Dev"] },
  { keys: ["mobile", "android", "ios", "flutter", "react native", "kotlin", "swift"], domain: "Mobile", tags: ["Mobile Dev"] },
  { keys: ["cloud", "aws", "gcp", "azure", "devops", "kubernetes", "docker", "sre"], domain: "Cloud & DevOps", tags: ["Cloud", "DevOps"] },
  { keys: ["blockchain", "web3", "solidity", "smart contract"], domain: "Blockchain", tags: ["Web3"] },
  { keys: ["design", "ux", "ui", "figma", "product"], domain: "Design", tags: ["Design"] },
  { keys: ["security", "cyber", "ctf", "pentest"], domain: "Security", tags: ["Security"] },
  { keys: ["career", "job", "internship", "placement", "resume", "interview"], domain: "Career", tags: ["Career"] },
];

const BEGINNER_HINTS = [
  "beginner",
  "for beginners",
  "no experience",
  "first hackathon",
  "new to",
  "getting started",
  "freshers",
  "students",
  "entry level",
];

const ONLINE_HINTS = [
  "online",
  "virtual",
  "remote",
  "webinar",
  "zoom",
  "youtube",
  "meet.google",
  "google meet",
  "livestream",
  "live stream",
];

const TYPE_HINTS: { keys: string[]; type: string }[] = [
  { keys: ["hackathon"], type: "hackathon" },
  { keys: ["workshop", "bootcamp", "training"], type: "workshop" },
  { keys: ["webinar", "talk", "fireside"], type: "webinar" },
  { keys: ["conference", "summit"], type: "conference" },
  { keys: ["career fair", "job fair", "hiring"], type: "career-fair" },
  { keys: ["meetup", "gdg", "chapter"], type: "meetup" },
];

function summarize(title: string, description: string, tags: string[]): string {
  const text = description.trim();
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let core = sentences[0]?.trim() ?? "";
  if (core.length < 20 && sentences[1]) core = `${core} ${sentences[1].trim()}`.trim();
  if (core.length === 0) core = `${title}. Register or learn more from the organizer.`;
  let summary = core.length > 170 ? `${core.slice(0, 167).trimEnd()}...` : core;
  if (tags.includes("Beginner-friendly") && !/beginner/i.test(summary)) {
    summary = `${summary} Designed to be beginner-friendly.`;
  }
  return summary;
}

export class MockAIEnhancer implements AIEnhancer {
  async enhance(title: string, description: string, link?: string): Promise<AIEnhancement> {
    const text = `${title}\n${description}`.toLowerCase();

    const matched = DOMAINS.filter((d) => d.keys.some((k) => text.includes(k)));
    const domain = matched[0]?.domain ?? "Tech";
    const domainTags = matched.flatMap((d) => d.tags);

    const typeMatch = TYPE_HINTS.find((t) => t.keys.some((k) => text.includes(k)));
    const typeTag = typeMatch ? [EVENT_TYPE_NAME(typeMatch.type)] : [];

    const beginnerFriendly = BEGINNER_HINTS.some((h) => text.includes(h));
    const isOnline =
      !!link && /(meet\.|zoom|youtube|unstop\.com\/(webinar|virtual)|online)/i.test(link)
        ? true
        : ONLINE_HINTS.some((h) => text.includes(h));

    const tags = Array.from(new Set([...domainTags, ...typeTag, isOnline ? "Online" : "Offline"]));
    if (beginnerFriendly) tags.push("Beginner-friendly");

    return {
      summary: summarize(title, description, tags),
      tags,
      beginnerFriendly,
      domain,
      isOnline,
    };
  }
}

function EVENT_TYPE_NAME(type: string): string {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}