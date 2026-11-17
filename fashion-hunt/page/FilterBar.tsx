import { useCallback, useMemo, useRef, useState, type Ref } from "react";
import { CheckList, Choice, RangeFilter, Toggle } from "./controls.tsx";
import { BELOW, cheapEnough, isOpen, type Facet, type Filters, type Range, type SortKey } from "./filters.ts";
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
            <span className="chev" aria-hidden="true">
              ▾
            </span>
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
  const { T, cols, wholeMoney, cm } = S;
  const one = (picked: Set<string>, name: (id: string) => string) => (picked.size === 1 ? name([...picked][0]!) : String(picked.size));
  const range = (r: Range, format: (n: number) => string) => T.range(r.lo === null ? null : format(r.lo), r.hi === null ? null : format(r.hi));
  const sizeName = (id: string) => (id === "other" || id === "none" ? (R.sizeLabels[id] ?? id) : id);
  const better = S.better.find(b => b.conds.length === f.conds.size && b.conds.every(c => f.conds.has(c)));
  const hiding = [S.has.risk && f.norisk ? T.hideRisk : null, S.has.dup && f.norepeat ? T.hideRepeats : null].filter(name => name !== null);
  const pills: (Pill & { shown: boolean })[] = [
    { id: "shop", shown: S.has.shop, name: T.shop, on: f.shops.size > 0, label: `${T.shop}: ${one(f.shops, s => s)}` },
    {
      id: "cond",
      shown: S.has.cond,
      name: T.cond,
      on: f.conds.size > 0,
      label: better ? T.orBetter(R.conditionNames[better.grade] ?? better.grade) : `${T.cond}: ${one(f.conds, c => R.conditionNames[c] ?? c)}`,
    },
    R.sizeMode === "width"
      ? { id: "size", shown: S.has.size, name: T.width, on: !isOpen(f.width), label: `${T.width}: ${range(f.width, n => `${cm.format(n)} ${T.cm}`)}` }
      : { id: "size", shown: S.has.size, name: T.size, on: f.sizes.size > 0, label: `${T.size}: ${one(f.sizes, sizeName)}` },
    { id: "price", shown: S.has.price, name: cols[4]!, on: !isOpen(f.price), label: `${cols[4]}: ${range(f.price, n => wholeMoney.format(n))}` },
    { id: "new", shown: S.has.newPrice, name: cols[5]!, on: !isOpen(f.newPrice), label: `${cols[5]}: ${range(f.newPrice, n => wholeMoney.format(n))}` },
    { id: "diff", shown: S.has.diff, name: cols[6]!, on: f.below !== "any", label: T.belowPill[f.below] },
    {
      id: "ships",
      shown: S.has.ships,
      name: cols[7]!,
      on: f.eu || f.ships.size > 0,
      label: f.ships.size ? `${cols[7]}: ${[...(f.eu ? [T.euOnly] : []), one(f.ships, s => s)].join(", ")}` : T.euOnly,
    },
    { id: "more", shown: S.has.risk || S.has.dup, name: T.more, on: hiding.length > 0, label: hiding.length === 1 ? hiding[0]! : `${T.more}: ${hiding.length}` },
  ];
  return pills.filter(p => p.shown).map(({ shown: _, ...p }) => ({ ...p, label: p.on ? p.label : p.name }));
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
      if (R.sizeMode === "width") {
        const widths = rows.map(r => r.dims?.w ?? null).filter(v => v !== null);
        return (
          <>
            <RangeFilter T={T} values={widths} scale={S.scales.width} range={f.width} onChange={width => set({ width })} format={n => S.cm.format(n)} unit={T.cm} minStep={0.5} />
            {rows.length > widths.length ? <p className="hint">{T.noWidth(rows.length - widths.length)}</p> : null}
          </>
        );
      }
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
      const n = tally(r => [r.ships]);
      return (
        <>
          {S.has.nonEU ? (
            <>
              <label className="opt">
                <input type="checkbox" checked={f.eu} onChange={e => set({ eu: e.target.checked })} />
                <span className="lbl">{T.euOnly}</span>
                <span className="n">{rows.filter(r => !r.nonEU).length}</span>
              </label>
              <div className="sep" />
            </>
          ) : null}
          <CheckList
            T={T}
            options={S.ships.map(s => ({ id: s.name, text: s.name, label: s.nonEU ? <b>{s.name}</b> : s.name, count: n.get(s.name) ?? 0 }))}
            picked={f.ships}
            onChange={ships => set({ ships })}
          />
        </>
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
