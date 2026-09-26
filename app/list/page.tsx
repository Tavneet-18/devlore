import { EventForm } from "@/components/EventForm";

export const metadata = { title: "Submit an event — Devlore" };

export default function ListEventPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8 pt-8">
        <h1 className="text-[34px] font-bold leading-tight tracking-tight text-ink">
          Submit an <span className="text-gradient">event</span>
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Publish a hackathon, meetup, workshop or conference. A moderator reviews every
          submission before it appears.
        </p>
      </header>

      <EventForm />
    </div>
  );
}
