import { SourceHealth } from "@/components/SourceHealth";
import Link from "next/link";

export const metadata = { title: "Source health — Devlore" };
export const dynamic = "force-dynamic";

export default function AdminSourcesPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:px-10">
      <header className="border-b border-line pb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-faint">Staff</p>
        <h1 className="mt-4 font-serif text-[clamp(2rem,5vw,2.8rem)] font-normal leading-[0.98] tracking-[-0.02em] text-ink">
          Source <em>health</em>
        </h1>
        <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted">
          The last ten ingest runs per source. A platform that quietly stops contributing — markup
          changed, endpoint moved — shows up here rather than as a silent drop in the index.
        </p>
        <Link
          href="/admin"
          className="mt-5 inline-block text-[12px] uppercase tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          ← Back to moderation
        </Link>
      </header>

      <SourceHealth />
    </div>
  );
}
