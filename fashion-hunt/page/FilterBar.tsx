import { useCallback, useMemo, useRef, useState, type Ref } from "react";
import { CheckList, Choice, GroupedChecks, RangeFilter, Toggle } from "./controls.tsx";
import { BELOW, cheapEnough, isOpen, shipKey, type Facet, type Filters, type Range, type SortKey } from "./filters.ts";
import { Panel, useNarrow } from "./Panel.tsx";
import type { Setup } from "./setup.ts";
import type { Report, Row } from "./types.ts";

type Props = {
  R: Report;
  S: Setup;
  f: Filters;
  set: (change: Partial<Filters>) => void;
  clear: () => void;
  counts: { tabs: Map<string, number>; shown: number; total: number };
  /** The listings every filter but one's own leaves, for that pill's counts */
  rowsFor: (skip: Facet) => Row[];
  barRef: Ref<HTMLElement>;
};

/**
 * The sticky bar: the tabs, then a pill per filter, each showing its value and opening its options,
 * the sort menu on phones (which show cards without column headings) and the count.
 */
export function FilterBar({ R, S, f, set, clear, counts, rowsFor, barRef }: Props) {
  const { T } = S;
  const narrow = useNarrow();
  const [open, setOpen] = useState<Facet | null>(null);
  const anchors = useRef(new Map<Facet, HTMLButtonElement | null>());
  const close = useCallback(() => setOpen(null), []);
  const tab = S.tabs.find(g => g.id === f.group);
  const pills = pillsFor(R, S, f);
  const pill = pills.find(p => p.id === open);
  const rows = useMemo(() => (open ? rowsFor(open) : []), [open, rowsFor]);
  return (
    <section className="bar" ref={barRef} aria-label={T.filters}>
      <div className="tabs" role="group" aria-label={T.tabs}>
        {S.tabs.map(g => (
          <button type="button" key={g.id} id={`tab-${g.id}`} aria-pressed={f.group === g.id} onClick={() => set({ group: g.id })}>
            {g.label}
            <span className="n">{counts.tabs.get(g.id)}</span>
          </button>
        ))}
      </div>
      {tab?.hint ? <p className="hint">{tab.hint}</p> : null}
      <div className="pills" role="group" aria-label={T.filters}>
        {pills.map(p => (
          <button
            type="button"
            key={p.id}
            id={`pill-${p.id}`}
            className={p.on ? "pill on" : "pill"}
            aria-haspopup="dialog"
            aria-expanded={open === p.id}
            ref={el => {
              anchors.current.set(p.id, el);
            }}
            onClick={() => setOpen(open === p.id ? null : p.id)}
          >
            {p.label}
            <svg className="chev" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
        {pills.some(p => p.on) || f.variants.size ? (
          <button type="button" className="clear" onClick={clear}>
            {T.clearAll}
          </button>
        ) : null}
      </div>
      <div className="row">
        <label htmlFor="sort">
          <span>{T.sortBy}</span>{" "}
          <select
            id="sort"
            value={`${f.sortKey}-${f.sortDir}`}
            onChange={e => {
              const [sortKey, sortDir] = e.target.value.split("-");
              set({ sortKey: sortKey as SortKey, sortDir: sortDir === "desc" ? "desc" : "asc" });
            }}
          >
            {S.sortKeys.flatMap(k =>
              (["asc", "desc"] as const).map((d, i) => (
                <option key={`${k}-${d}`} value={`${k}-${d}`}>
                  {`${S.cols[S.sorts[k].col]}: ${T.sortDirs[S.sorts[k].kind][i]}`}
                </option>
              )),
            )}
          </select>
        </label>
        <span className="count" id="count">
          {T.shown(counts.shown, counts.total)}
        </span>
      </div>
      {pill ? (
        <Panel key={pill.id} title={pill.name} anchor={anchors.current.get(pill.id) ?? null} narrow={narrow} done={T.show(counts.shown)} onClose={close}>
          <FacetBody facet={pill.id} R={R} S={S} f={f} set={set} rows={rows} />
        </Panel>
      ) : null}
    </section>
  );
}

type Pill = { id: Facet; name: string; on: boolean; label: string };

/** The pills the page needs, each with its name, or its value while it filters */
function pillsFor(R: Report, S: Setup, f: Filters): Pill[] {
  const { T, cols, wholeMoney } = S;
  const one = (picked: Set<string>, name: (id: string) => string) => (picked.size === 1 ? name([...picked][0]!) : String(picked.size));
  const range = (r: Range, format: (n: number) => string) => T.range(r.lo === null ? null : format(r.lo), r.hi === null ? null : format(r.hi));
  const sizeName = (id: string) => (id === "other" || id === "none" ? (R.sizeLabels[id] ?? id) : id);
  const better = S.better.find(b => b.conds.length === f.conds.size && b.conds.every(c => f.conds.has(c)));
  const hiding = [S.has.risk && f.norisk ? T.hideRisk : null, S.has.dup && f.norepeat ? T.hideRepeats : null].filter(name => name !== null);
  const pills: (Pill & { shown: boolean })[] = [
    { id: "color", shown: S.has.color, name: T.color, on: f.colors.size > 0, label: `${T.color}: ${one(f.colors, c => R.colorNames[c] ?? c)}` },
    { id: "shop", shown: S.has.shop, name: T.shop, on: f.shops.size > 0, label: `${T.shop}: ${one(f.shops, s => s)}` },
    {
      id: "cond",
      shown: S.has.cond,
      name: T.cond,
      on: f.conds.size > 0,
      label: better ? T.orBetter(R.conditionNames[better.grade] ?? better.grade) : `${T.cond}: ${one(f.conds, c => R.conditionNames[c] ?? c)}`,
    },
    { id: "size", shown: S.has.size, name: T.size, on: f.sizes.size > 0, label: `${T.size}: ${one(f.sizes, sizeName)}` },
    { id: "price", shown: S.has.price, name: cols[4]!, on: !isOpen(f.price), label: `${cols[4]}: ${range(f.price, n => wholeMoney.format(n))}` },
    { id: "new", shown: S.has.newPrice, name: cols[5]!, on: !isOpen(f.newPrice), label: `${cols[5]}: ${range(f.newPrice, n => wholeMoney.format(n))}` },
    { id: "diff", shown: S.has.diff, name: cols[6]!, on: f.below !== "any", label: T.belowPill[f.below] },
    { id: "ships", shown: S.has.ships, name: cols[7]!, on: f.ships.size > 0, label: shipsLabel(S, f) },
    { id: "more", shown: S.has.risk || S.has.dup, name: T.more, on: hiding.length > 0, label: hiding.length === 1 ? hiding[0]! : `${T.more}: ${hiding.length}` },
  ];
  return pills.filter(p => p.shown).map(({ shown: _, ...p }) => ({ ...p, label: p.on ? p.label : p.name }));
}

/** The ships-from pill's value: "EU only" for every EU country, a whole group by its name, else the options or how many */
function shipsLabel(S: Setup, f: Filters): string {
  const { T, cols } = S;
  const whole = (ids: string[]) => ids.length > 0 && ids.every(id => f.ships.has(id));
  const eu = whole(S.ships.eu), outside = whole(S.ships.outside);
  const rest = [...f.ships].filter(id => !(eu && S.ships.eu.includes(id)) && !(outside && S.ships.outside.includes(id)));
  if (eu && !outside && !rest.length) return T.euOnly;
  const parts = [...(eu ? [T.inEU] : []), ...(outside ? [T.outsideEU] : []), ...rest.map(S.shipLabel)];
  return `${cols[7]}: ${parts.length <= 3 ? parts.join(", ") : f.ships.size}`;
}

type BodyProps = { facet: Facet; R: Report; S: Setup; f: Filters; set: (change: Partial<Filters>) => void; rows: Row[] };

/** What a pill opens, with counts from the listings the other filters leave */
function FacetBody({ facet, R, S, f, set, rows }: BodyProps) {
  const { T } = S;
  const tally = (keys: (r: Row) => string[]) => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const key of keys(r)) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };
  const euros = (n: number) => S.int.format(n);
  switch (facet) {
    case "color": {
      const n = tally(r => r.colors);
      const option = (c: string) => ({
        id: c,
        text: R.colorNames[c] ?? c,
        label: (
          <>
            <span className="cdot" style={{ background: R.colorSwatches[c] ?? "transparent" }} aria-hidden="true" />
            {R.colorNames[c] ?? c}
          </>
        ),
        count: n.get(c) ?? 0,
      });
      return <CheckList T={T} options={R.colorOrder.map(option)} picked={f.colors} onChange={colors => set({ colors })} />;
    }
    case "shop": {
      const n = tally(r => [r.shop]);
      return <CheckList T={T} options={S.shops.map(s => ({ id: s, text: s, count: n.get(s) ?? 0 }))} picked={f.shops} onChange={shops => set({ shops })} />;
    }
    case "cond": {
      const n = tally(r => [r.cond]);
      return (
        <>
          <CheckList
            T={T}
            options={R.conditionOrder.map(c => ({ id: c, text: R.conditionNames[c] ?? c, count: n.get(c) ?? 0 }))}
            picked={f.conds}
            onChange={conds => set({ conds })}
          />
          {S.better.length ? (
            <div className="quick">
              {S.better.map(b => {
                const on = b.conds.length === f.conds.size && b.conds.every(c => f.conds.has(c));
                return (
                  <button type="button" key={b.grade} aria-pressed={on} onClick={() => set({ conds: on ? new Set() : new Set(b.conds) })}>
                    {T.orBetter(R.conditionNames[b.grade] ?? b.grade)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      );
    }
    case "size": {
      const n = tally(r => r.sizes);
      return <CheckList T={T} options={R.sizeOrder.map(z => ({ id: z, text: R.sizeLabels[z] ?? z, count: n.get(z) ?? 0 }))} picked={f.sizes} onChange={sizes => set({ sizes })} />;
    }
    case "price":
      return <RangeFilter T={T} values={rows.map(r => r.price).filter(v => v !== null)} scale={S.scales.price} range={f.price} onChange={price => set({ price })} format={euros} unit="€" minStep={1} />;
    case "new":
      return (
        <RangeFilter T={T} values={rows.map(r => r.newPrice).filter(v => v !== null)} scale={S.scales.newPrice} range={f.newPrice} onChange={newPrice => set({ newPrice })} format={euros} unit="€" minStep={1} />
      );
    case "diff":
      return (
        <>
          <Choice name="below" options={BELOW.map(b => ({ id: b, label: T.below[b], count: rows.filter(r => cheapEnough(r, b)).length }))} picked={f.below} onPick={below => set({ below })} />
          <p className="hint">{T.belowHint}</p>
        </>
      );
    case "ships": {
      const n = tally(r => [shipKey(r)]);
      const option = (id: string) => ({ id, text: S.shipLabel(id), count: n.get(id) ?? 0 });
      return (
        <GroupedChecks
          groups={[
            { id: "eu", label: T.inEU, options: S.ships.eu.map(option) },
            { id: "outside", label: T.outsideEU, options: S.ships.outside.map(option) },
          ]}
          loose={S.ships.other.map(option)}
          picked={f.ships}
          onChange={ships => set({ ships })}
        />
      );
    }
    case "more":
      return (
        <>
          {S.has.risk ? (
            <Toggle on={f.norisk} onChange={norisk => set({ norisk })} hint={T.riskTip}>
              {T.hideRisk} <span className="risk">⚠</span>
            </Toggle>
          ) : null}
          {S.has.dup ? (
            <Toggle on={f.norepeat} onChange={norepeat => set({ norepeat })} hint={T.repeatTip}>
              {T.hideRepeats}
            </Toggle>
          ) : null}
        </>
      );
  }
}
