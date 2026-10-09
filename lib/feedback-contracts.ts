import { z } from "zod";

export const ReportSchema = z.object({
  eventId: z.string().trim().min(1).max(100),
  reason: z.enum(["wrong_date", "wrong_location", "broken_link", "duplicate", "other"]),
  comment: z.string().trim().max(500).optional(),
}).strict();

export const UsageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("search"), empty: z.boolean() }).strict(),
  z.object({ kind: z.literal("outbound_click"), eventId: z.string().trim().min(1).max(100) }).strict(),
]);
