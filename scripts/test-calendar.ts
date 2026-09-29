import { buildIcs, googleCalendarUrl } from "../lib/calendar";

const base = {
  title: "AI Builder Cup 2026",
  deadlineIso: "2026-10-11T09:30:00.000Z",
  deadlineLabel: "Sun, 11 Oct, 3:00 pm IST",
  link: "https://hack2skill.com/event/aibuildercup2026",
  notes: ["Teams of 2-4.", "Free to enter."],
};

const ics = buildIcs({ ...base, deadlineKind: "registration" });
console.log("=== .ics (registration) ===");
console.log(JSON.stringify(ics));
console.log("\n--- rendered ---");
console.log(ics);

console.log("\n=== event-end must be refused ===");
console.log("ics:     ", buildIcs({ ...base, deadlineKind: "event-end" }));
console.log("google:  ", googleCalendarUrl({ ...base, deadlineKind: "event-end" }));
console.log("null:    ", buildIcs({ ...base, deadlineKind: null }));
console.log("no kind: ", buildIcs({ ...base, deadlineKind: undefined }));

console.log("\n=== google url (registration) ===");
console.log(googleCalendarUrl({ ...base, deadlineKind: "registration" }));
