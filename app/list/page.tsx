import { EventForm } from "@/components/EventForm";

export const metadata = { title: "List Your Event — Devlore" };

export default function ListEventPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <EventForm />
    </div>
  );
}
