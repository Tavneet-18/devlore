"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * "Report incorrect information" disclosure + form.
 *
 * Rendered on the detail page and in the quick-look for the same event, so both
 * surfaces offer the same reasons and send the same JSON: POST /api/event-reports
 * with { eventId, reason, comment? }. The endpoint itself is owned by Codex; a
 * 201 means the report was accepted for review. The copy says "received", never
 * "fixed", because nothing has been verified yet.
 *
 * No login. On failure the form stays put with everything the reader typed, so
 * only a 201 clears it. While a submit is in flight the fieldset is disabled,
 * so a double-tap cannot send the report twice.
 */

const REASONS = [
  { value: "wrong_date", label: "Wrong dates" },
  { value: "wrong_location", label: "Wrong location or venue" },
  { value: "broken_link", label: "Broken registration link" },
  { value: "duplicate", label: "Duplicate of another listing" },
  { value: "other", label: "Something else" },
] as const;

const MAX_COMMENT = 500;

type Status = { ok: boolean; message: string };

/**
 * Same control styling as EventForm's inputs. (Deliberately not `tap-target` on
 * the textarea itself — see the note above EventForm's `input` for why the hit
 * area lives on the label instead.)
 */
const inputClass =
  "w-full rounded-[2px] border border-line bg-raised/40 px-3 py-2 text-[14px] text-ink placeholder:text-faint transition-colors focus:border-primary focus:outline-none";

export function ReportEventButton({ eventId }: { eventId: string }) {
  const uid = useId();
  const commentId = `report-comment-${uid}`;
  const countId = `report-count-${uid}`;
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [sent, setSent] = useState(false);

  // The status region announces itself via role="status", but a keyboard user
  // still needs a place to land. Focus it whenever an outcome appears.
  useEffect(() => {
    if (status) statusRef.current?.focus();
  }, [status]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setStatus(null);
    try {
      const data = new FormData(e.currentTarget);
      const reason = String(data.get("reason") ?? "");
      const trimmed = comment.trim();
      const body: { eventId: string; reason: string; comment?: string } = { eventId, reason };
      if (trimmed) body.comment = trimmed.slice(0, MAX_COMMENT);

      const res = await fetch("/api/event-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 201) {
        setSent(true);
        setStatus({
          ok: true,
          message: "Thanks — your report was received. We'll check it against the source listing.",
        });
      } else {
        setStatus({ ok: false, message: await failureMessage(res) });
      }
    } catch {
      setStatus({
        ok: false,
        message: "Couldn't reach the server — check your connection and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  function reportAgain() {
    setComment("");
    setStatus(null);
    setSent(false);
  }

  return (
    <details>
      <summary className="tap-target inline-block cursor-pointer text-[13px] text-faint transition-colors hover:text-ink">
        Report incorrect information
      </summary>

      {sent ? (
        <div className="mt-3 space-y-3">
          <p
            ref={statusRef}
            tabIndex={-1}
            role="status"
            className="text-[14px] text-positive focus:outline-none"
          >
            {status?.message}
          </p>
          <button
            type="button"
            onClick={reportAgain}
            className="tap-target rounded-[2px] border border-line bg-raised/40 px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-line-hi hover:bg-raised"
          >
            Report something else
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-4">
          <fieldset disabled={pending}>
            <legend className="text-[11px] uppercase tracking-[0.12em] text-faint">
              What is wrong with this listing?
            </legend>
            <div className="mt-2 space-y-1">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="tap-target flex items-center gap-2 text-[14px] text-muted"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    required
                    className="h-3.5 w-3.5 border-line accent-primary"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor={commentId}
              className="mb-2 block text-[11px] uppercase tracking-[0.12em] text-faint"
            >
              What should we check? <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              id={commentId}
              rows={3}
              maxLength={MAX_COMMENT}
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
              disabled={pending}
              placeholder="e.g. The source page says Whitefield, not Koramangala."
              aria-describedby={countId}
              className={`${inputClass} resize-y`}
            />
            <span id={countId} className="mt-1 block text-[12px] text-faint">
              {comment.length} / {MAX_COMMENT}
            </span>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="tap-target rounded-[2px] border border-line bg-raised/40 px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-line-hi hover:bg-raised disabled:opacity-40"
          >
            {pending ? "Sending…" : "Send report"}
          </button>

          {status && !status.ok && (
            <p
              ref={statusRef}
              tabIndex={-1}
              role="status"
              className="text-[14px] text-critical focus:outline-none"
            >
              {status.message}
            </p>
          )}
        </form>
      )}
    </details>
  );
}

/**
 * What the reader sees when the report did not go through. The form is left
 * untouched in every case — the failure is reported beside it, not instead of
 * it. The endpoint is still being built, so a 404 today likely means "not
 * deployed yet" rather than "event gone"; either way the honest message is that
 * nothing was sent.
 */
async function failureMessage(res: Response): Promise<string> {
  if (res.status === 400) {
    return (
      (await serverDetail(res)) ??
      "That report was rejected — please choose a reason and try again."
    );
  }
  if (res.status === 404) return "This listing no longer exists, so there is nothing to report.";
  if (res.status === 429)
    return "Too many reports from here — please wait a while and try again.";
  if (res.status === 503)
    return "Reporting is temporarily unavailable — please try again later.";
  return (
    (await serverDetail(res)) ??
    "Something went wrong — your report was not sent. Please try again."
  );
}

/** A short server-provided reason, if it sent one. Never a bare status code. */
async function serverDetail(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string") {
      const message = data.error.trim();
      if (message.length > 0 && message.length <= 200) return message;
    }
    return null;
  } catch {
    return null;
  }
}
