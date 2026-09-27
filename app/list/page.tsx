import { EventForm } from "@/components/EventForm";

export const metadata = { title: "Submit an event — Devlore" };

export default function ListEventPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:px-10">
      <header className="mb-10 border-b border-line pb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Contribute</p>
        <h1 className="mt-4 font-serif text-[clamp(2.2rem,6vw,3.2rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
          Submit an <em>event</em>
        </h1>
        <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted">
          Publish a hackathon, meetup, workshop or conference. Every submission is held for
          review before it appears in the index.
        </p>
      </header>

      <EventForm />
    </div>
  );
}
