// Code ships before migration 004 is applied. A row that predates the new
// columns has no brief/whoCanJoin/details, and the DTO must survive that.
import { toEventDTO, asSelected } from "../lib/events";
import { buildIcs, googleCalendarUrl } from "../lib/calendar";
import { buildGlance, registrationDeadline } from "../lib/event-summary";
import { parseDetails } from "../lib/event-details";
import { whoCanJoinFrom, canBrief, generateBrief } from "../lib/ai/brief";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  [${ok ? "ok  " : "FAIL"}] ${label}${detail ? `  ${detail}` : ""}`);
};

const now = new Date();
const soon = new Date(now.getTime() + 9 * 86400000);

/** The pre-migration shape: every 004 column absent. */
const legacyRow = {
  id: "legacy1",
  title: "Legacy Hackathon",
  summary: "A row written before migration 004.",
  description: "Old description.",
  date: now,
  endDate: soon,
  city: "Bengaluru",
  country: "India",
  isOnline: false,
  eventType: "hackathon",
  organizer: "Somebody",
  link: "https://example.com/x",
  imageUrl: null,
  tags: JSON.stringify(["AI"]),
  beginnerFriendly: true,
  source: "devpost",
  sourceId: "legacy1",
  deadlineKind: "registration",
  status: "APPROVED",
  viewCount: 12,
  createdAt: now,
  fetchedAt: now,
};

async function main() {
  console.log("=== pre-migration row (no 004 columns) ===");
  const dto = toEventDTO(asSelected([legacyRow])[0]);
  check("DTO builds without the new columns", Boolean(dto.id));
  check("brief is null, not undefined", dto.brief === null, String(dto.brief));
  check("whoCanJoin is null", dto.whoCanJoin === null);
  check("details is null", dto.details === null);
  check("fetchedAt serialised", typeof dto.fetchedAt === "string" && !Number.isNaN(Date.parse(dto.fetchedAt)));

  console.log("\n=== the page still renders with only the facts it has ===");
  const input = {
    title: dto.title,
    date: dto.date,
    endDate: dto.endDate,
    deadlineKind: dto.deadlineKind,
    isOnline: dto.isOnline,
    city: dto.city,
    details: parseDetails(undefined),
    whoCanJoin: whoCanJoinFrom(null),
  };
  const glance = buildGlance(input);
  for (const r of glance) console.log(`    ${r.label.padEnd(22)} ${r.value}`);
  check("glance is non-empty (dates alone are facts)", glance.length > 0);
  check(
    "no placeholder values appear",
    glance.every((r) => !/^(—|TBA|Unknown|N\/A)$/i.test(r.value.trim()))
  );

  console.log("\n=== calendar still offered from deadlineKind alone ===");
  const dl = registrationDeadline(input);
  const ics = dl
    ? buildIcs({ title: dto.title, deadlineIso: dl, deadlineKind: dto.deadlineKind, deadlineLabel: "x" })
    : null;
  check("ics generated without details", Boolean(ics));
  check("ics has no undefined leaking in", !(ics ?? "").includes("undefined"));
  check("google url generated", Boolean(dl && googleCalendarUrl({ title: dto.title, deadlineIso: dl, deadlineKind: dto.deadlineKind, deadlineLabel: "x" })));

  console.log("\n=== an event-end row with no deadline gets no calendar ===");
  const endDated = { ...input, deadlineKind: "event-end" as const };
  check("registrationDeadline is null", registrationDeadline(endDated) === null);
  check("ics is null", buildIcs({ title: "x", deadlineIso: soon.toISOString(), deadlineKind: "event-end", deadlineLabel: "x" }) === null);

  console.log("\n=== brief generation is a no-op without source text ===");
  check("canBrief(null) is false", !canBrief(null));
  check("canBrief(thin text) is false", !canBrief({ sourceText: "A short hackathon. Register soon." }));
  check("canBrief(real text) is true", canBrief({ sourceText: "word ".repeat(60) }));
  const res = await generateBrief("Legacy Hackathon", null, "Bengaluru");
  check("generateBrief returns null brief with no key/text", res.brief === null);
  check("generateBrief returns null whoCanJoin with no details", res.whoCanJoin === null);

  console.log("\n=== malformed details are dropped, not repaired ===");
  check("garbage details parse to null", parseDetails({ teamMin: "four", fee: "maybe" }) === null);
  check("details with an over-long prize parse to null", parseDetails({ prize: "x".repeat(400) }) === null);
  check("valid details survive", parseDetails({ teamMin: 2, teamMax: 4 })?.teamMax === 4);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

void main();
