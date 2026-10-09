/** Best effort: counters must never delay navigation or show reader errors. */
export function sendUsage(payload: { kind: "search"; empty: boolean } | { kind: "outbound_click"; eventId: string }) {
  void fetch("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
