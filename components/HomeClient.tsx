"use client";

import { useState } from "react";
import { EventExplorer } from "./EventExplorer";

/**
 * The front page opener.
 *
 * There is deliberately no masthead here. The nameplate in the root layout is
 * the masthead; repeating it below a sticky bar was what made the site read as
 * a template.
 *
 * What is left is the standard editorial front: a kicker naming the contents,
 * the headline — still the single largest piece of type on the site — and a
 * standfirst that says in one sentence what the site is for. The standfirst is
 * the addition. The kicker and headline had been carrying the whole explanation
 * between them and were not enough: both describe arrangement rather than
 * benefit, so a first-time visitor could not tell from the top of the page
 * that the site exists to stop them missing a registration deadline.
 *
 * Everything below the standfirst is the event index and is not ours to
 * restyle; the job of the pieces here is to make someone want to reach it, and
 * to keep it close enough to the fold on a phone that they do.
 */
export function HomeClient({ now }: { now: string }) {
  const [city, setCity] = useState("");

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
      {/* Kicker. Describes the contents rather than the arrangement: the old
          line, "A spatial index of hackathons, conferences and engineering
          gatherings", named three categories the index does not actually hold
          and said nothing a reader could act on. "Conferences" in particular
          was an aspiration — every listing the pipeline has collected is a
          hackathon or a tech event — so the wording here is what the sources
          really return. */}
      <p className="pt-8 text-[12px] uppercase tracking-[0.18em] text-faint sm:pt-12">
        Hackathons and tech events, ordered by how soon they close
      </p>

      {/* Headline. The dot grid is a print texture, masked so it never
          resolves into a visible pattern.

          The bleed is `-inset-x-5 sm:-inset-x-8 lg:-inset-x-10`, matching the
          container's gutter at each breakpoint. The container is `px-5
          sm:px-8 lg:px-10` to line up with the nameplate above it and the
          footer below it, both of which use the same gutter — the two bars are
          on every page, so when they disagreed with the content between them
          the misalignment showed on every screen rather than only the home
          page.

          The bleed must track the gutter exactly. `body` carries
          `overflow-x: hidden`, but that value propagates to the viewport, and
          iOS Safari does not honour the propagation reliably, so a texture
          overhanging the edge has to be sized rather than clipped. */}
      <div className="relative mt-6 sm:mt-8">
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute -inset-x-5 -inset-y-6 opacity-70 sm:-inset-x-8 lg:-inset-x-10 lg:-inset-y-8 [mask-image:radial-gradient(120%_100%_at_20%_0%,#000,transparent_72%)]"
        />
        <h1 className="relative font-serif text-[clamp(3rem,9vw,5.5rem)] font-normal leading-[0.95] tracking-[-0.02em] text-ink">
          Ahead in
          <br />
          <em>compute</em>
          <span className="text-closing">.</span>
        </h1>
      </div>

      {/* The standfirst. A headline can be memorable and still not explain the
          product: "Ahead in compute" sets a mood and leaves a first-time
          visitor with no idea whether this is an index, a directory, or a
          newsletter, and no reason to believe it would help them miss fewer
          deadlines. So the explanation sits directly under the headline, in
          the sentence a reader actually needs.

          It deliberately does not open by naming the categories — the kicker
          one line above already does, and an earlier draft began "Hackathons
          and tech events gathered from…", which read the same sentence twice
          within three lines and pushed the paragraph to five lines on a phone.
          What the kicker cannot say is where the dates come from and what the
          ordering is for, so this says those two things and stops.

          `text-pretty` rather than `text-balance`: balanced lines would stretch
          the first line to fill the measure and leave the second short, which
          in a ragged-right paragraph is the wrong trade. It is 15px on a
          phone, where this is read at arm's length, and 17px above sm. */}
      <p className="mt-6 max-w-[54ch] text-pretty text-[15px] leading-relaxed text-muted sm:mt-8 sm:text-[17px]">
        Collected from the platforms that publish their own dates, then laid along one axis so the
        deadlines closing soonest are the first thing you see.
      </p>

      <div className="mt-8 border-t border-line sm:mt-12" />

      {/* A pointer to the controls. The search field and the filter rows sit
          immediately below, but they are set in 13px quiet index type and read
          as part of the furniture, so a reader landing on a phone has no cue
          that they can narrow anything down. One sentence, immediately above
          them, naming what each control actually does.

          It sits between the rule and the controls rather than above the rule
          because the rule is the top edge of the index — everything below it is
          the live list, and the sentence belongs to that half of the page. */}
      <p className="mt-5 text-[12px] leading-relaxed text-faint sm:mt-6 sm:text-[13px]">
        <span className="text-muted">Search</span> by title, city or tag.{" "}
        <span className="text-muted">Narrow</span> by city, format, and how soon registration closes.
      </p>

      <EventExplorer city={city} onCity={setCity} now={now} />
    </div>
  );
}
