import type { Text } from "./text.ts";
import type { Progress } from "./types.ts";

const CHECK = (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 6.3l2.3 2.2 4.7-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** How far the search has got while its agents are still at work: a count with a spinner, a bar, and each shop's state */
export function ProgressPanel({ P, T }: { P: Progress; T: Text }) {
  const share = P.total ? (P.done / P.total) * 100 : 0;
  // The shops the scans settled go on one line under the list, so the list keeps to what's moving
  const listed = P.shops.filter(s => s.state !== "nothing" && s.state !== "skipped");
  const and = new Intl.ListFormat(T.locale, { type: "conjunction" });
  const nothing = P.shops.filter(s => s.state === "nothing").map(s => s.name);
  const skipped = P.shops.filter(s => s.state === "skipped").map(s => (s.note ? `${s.name} (${s.note})` : s.name));
  return (
    <section className="progress" aria-label={T.progress}>
      <div className="phead">
        <span className="spinner" aria-hidden="true" />
        <div className="ptitle">
          <strong aria-live="polite">{T.shopsDone(P.done, P.total)}</strong>
          <span className="psub">{T.progressHint}</span>
        </div>
        <span className="pwhen">{T.updated(P.updated)}</span>
      </div>
      <div className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={P.total} aria-valuenow={P.done} aria-label={T.shopsDone(P.done, P.total)}>
        <span style={{ width: `${share}%` }} />
      </div>
      <ul className="pshops">
        {listed.map(s => (
          <li key={s.name} className={`pshop ${s.state}`}>
            <span className="picon">{s.state === "done" ? CHECK : s.state === "blocked" ? "!" : null}</span>
            <span className="pname">{s.name}</span>
            <span className="pstate">{T.shopState(s.state, s.count, s.note)}</span>
          </li>
        ))}
        {P.brands.map(b => (
          <li key={`brand ${b.name}`} className={`pshop brand ${b.done ? "done" : "searching"}`}>
            <span className="picon">{b.done ? CHECK : null}</span>
            <span className="pname">{b.name}</span>
            <span className="pstate">{T.brandState(b.done)}</span>
          </li>
        ))}
      </ul>
      {nothing.length || skipped.length ? (
        <p className="prest">
          {[nothing.length ? T.nothingAt(and.format(nothing)) : "", skipped.length ? T.skippedShops(and.format(skipped)) : ""].filter(Boolean).join(" ")}
        </p>
      ) : null}
    </section>
  );
}

/** Where the listings will be, before the first shop is in: a few rows that shimmer */
export function Waiting({ T }: { T: Text }) {
  return (
    <section className="waiting" aria-label={T.waiting}>
      {[0, 1, 2].map(i => (
        <div className="ghost" key={i} aria-hidden="true">
          <span className="gthumb" />
          <span className="glines">
            <span />
            <span />
          </span>
          <span className="gprice" />
        </div>
      ))}
      <p className="hint">{T.waiting}</p>
    </section>
  );
}
