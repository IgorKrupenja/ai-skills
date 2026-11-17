import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FilterBar } from "./FilterBar.tsx";
import { ALL, cleared, comparer, dedupe, defaults, loadFilters, passes, saveFilters, storageKey, type Facet, type Filters, type SortKey } from "./filters.ts";
import { Listings } from "./Listings.tsx";
import { ProgressPanel, Waiting } from "./Progress.tsx";
import { setup } from "./setup.ts";
import type { Report } from "./types.ts";
import { Variants } from "./Variants.tsx";

/** The report page: the run's summary, the variant cards, the sticky filter bar, the listings, then what wasn't checked and the notes */
export function App({ report: R }: { report: Report }) {
  const S = useMemo(() => setup(R), [R]);
  const { T } = S;
  const key = storageKey(R);
  const [f, setFilters] = useState<Filters>(() =>
    loadFilters(key, defaults(S.match), {
      groups: S.tabs.map(g => g.id),
      variants: S.variants,
      shops: S.shops,
      conds: R.conditionOrder,
      auths: R.authOrder,
      sizes: R.sizeOrder,
      colors: R.colorOrder,
      ships: [...S.ships.eu, ...S.ships.outside, ...S.ships.other],
      inside: [...S.ships.eu, ...S.ships.other],
      sortKeys: S.sortKeys,
    }),
  );
  useEffect(() => saveFilters(key, f), [key, f]);
  const set = useCallback((change: Partial<Filters>) => setFilters(old => ({ ...old, ...change })), []);
  const clear = useCallback(() => setFilters(cleared), []);
  const toggleVariant = useCallback(
    (name: string) =>
      setFilters(old => {
        const variants = new Set(old.variants);
        if (variants.has(name)) variants.delete(name);
        else variants.add(name);
        return { ...old, variants };
      }),
    [],
  );
  // A click on a column heading sorts by it, and a second click turns the order round
  const sortBy = useCallback(
    (key: SortKey) =>
      setFilters(old => (old.sortKey === key ? { ...old, sortDir: old.sortDir === "asc" ? "desc" : "asc" } : { ...old, sortKey: key, sortDir: "asc" })),
    [],
  );

  const list = useMemo(() => dedupe(R.rows.filter(r => passes(r, f, false)), f).sort(comparer(S.sorts[f.sortKey], f.sortDir, T.locale)), [R, S, T, f]);
  const counts = useMemo(
    () => ({
      tabs: new Map(S.tabs.map(g => [g.id, dedupe(R.rows.filter(r => (g.id === ALL || r.group === g.id) && passes(r, f, true)), f).length])),
      shown: list.length,
      total: R.rows.filter(r => f.group === ALL || r.group === f.group).length,
    }),
    [R, S, f, list],
  );
  const rowsFor = useCallback((skip: Facet | "variant") => dedupe(R.rows.filter(r => passes(r, f, false, skip)), f), [R, f]);
  // The variant cards count what the open tab and the other filters leave, so a card's number is what clicking it shows
  const variantRows = useMemo(() => rowsFor("variant"), [rowsFor]);

  // Sticky headings need the table out of its sideways-scrolling box, so it only comes out when it fits
  const bar = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    if (!bar.current || !box.current) return;
    // The bar's height is often fractional: tuck the headings a pixel under it, or rows show through a hairline gap
    document.documentElement.style.setProperty("--bar-h", `${bar.current.getBoundingClientRect().height - 1}px`);
    box.current.classList.add("fits");
    box.current.classList.toggle("fits", (box.current.querySelector("table")?.offsetWidth ?? 0) <= box.current.clientWidth + 1);
  }, []);
  useLayoutEffect(fit);
  useEffect(() => {
    const observer = new ResizeObserver(fit);
    if (bar.current) observer.observe(bar.current);
    addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      removeEventListener("resize", fit);
    };
  }, [fit]);

  return (
    <div className="wrap">
      <header>
        {R.eyebrow ? <p className="eyebrow">{R.eyebrow}</p> : null}
        <h1>{R.title}</h1>
        {R.lede ? <p className="lede" dangerouslySetInnerHTML={{ __html: R.lede }} /> : null}
        {R.hero ? <div className="hero" dangerouslySetInnerHTML={{ __html: R.hero }} /> : null}
      </header>

      {R.progress ? <ProgressPanel P={R.progress} T={T} /> : null}

      <Variants S={S} rows={variantRows} picked={f.variants} onToggle={toggleVariant} />

      {R.facts.length ? (
        <section className="facts" aria-label={T.summary}>
          {R.facts.map((fact, i) => (
            <div className="fact" key={i}>
              <span className="k">{fact.title}</span>
              <p dangerouslySetInnerHTML={{ __html: fact.html }} />
            </div>
          ))}
        </section>
      ) : null}

      {R.progress && !R.rows.length ? (
        <Waiting T={T} />
      ) : (
        <>
          <FilterBar R={R} S={S} f={f} set={set} clear={clear} counts={counts} rowsFor={rowsFor} barRef={bar} />
          <Listings list={list} S={S} f={f} onSort={sortBy} boxRef={box} />
        </>
      )}

      {R.unverified?.items.length ? (
        <details>
          <summary>{`${R.unverified.title || T.unverified}: ${R.unverified.items.length}`}</summary>
          {R.unverified.hint ? <p className="hint" dangerouslySetInnerHTML={{ __html: R.unverified.hint }} /> : null}
          <ul className="ulist">
            {R.unverified.items.map((u, i) => (
              <li key={i}>
                <a href={u.url} target="_blank" rel="noopener">
                  {u.label || u.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {R.notes.length ? (
        <section className="notes" aria-label={T.notes}>
          {R.notes.map((n, i) => (
            <Fragment key={i}>
              {n.title ? <h2>{n.title}</h2> : null}
              <p dangerouslySetInnerHTML={{ __html: n.html }} />
            </Fragment>
          ))}
        </section>
      ) : null}
    </div>
  );
}
