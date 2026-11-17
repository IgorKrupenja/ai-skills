/** The controls the filter pills open: a list to tick, a range with its histogram, and switches. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Range } from "./filters.ts";
import type { Text } from "./text.ts";

export type Option = { id: string; text: string; label?: ReactNode; count: number };

/** Options to tick, each with how many listings it has given the other filters; a search box for long lists */
export function CheckList({ options, picked, onChange, T }: { options: Option[]; picked: Set<string>; onChange: (next: Set<string>) => void; T: Text }) {
  const [query, setQuery] = useState("");
  const shown = query ? options.filter(o => o.text.toLowerCase().includes(query.trim().toLowerCase())) : options;
  const flip = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <>
      {options.length > 10 ? <input className="find" type="search" placeholder={T.search} aria-label={T.search} value={query} onChange={e => setQuery(e.target.value)} /> : null}
      <div className="opts">
        {shown.map(o => (
          <label key={o.id} className={o.count || picked.has(o.id) ? "opt" : "opt none"}>
            <input type="checkbox" checked={picked.has(o.id)} onChange={() => flip(o.id)} />
            <span className="lbl">{o.label ?? o.text}</span>
            <span className="n">{o.count}</span>
          </label>
        ))}
      </div>
    </>
  );
}

/** Options of which one is picked, each with how many listings it leaves */
export function Choice<K extends string>({ name, options, picked, onPick }: { name: string; options: { id: K; label: string; count: number }[]; picked: K; onPick: (id: K) => void }) {
  return (
    <div className="opts">
      {options.map(o => (
        <label key={o.id} className="opt">
          <input type="radio" name={name} checked={picked === o.id} onChange={() => onPick(o.id)} />
          <span className="lbl">{o.label}</span>
          <span className="n">{o.count}</span>
        </label>
      ))}
    </div>
  );
}

/** A switch with a line saying what it does */
export function Toggle({ on, onChange, children, hint }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode; hint: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      <span>
        {children}
        <small>{hint}</small>
      </span>
    </label>
  );
}

const BINS = 24;

/** A round step near x, such as 1, 2, 5, 10 or 20 */
function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(x));
  const m = x / power;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * power;
}

/**
 * A range: a histogram of the listings the other filters leave, two handles and two boxes for
 * exact bounds. The scale runs over most of every listing's values, leaving out the farthest few,
 * and a handle at either end leaves that side open, so outliers stay in until a bound is set.
 */
export function RangeFilter({
  values,
  scale,
  range,
  onChange,
  format,
  unit,
  minStep,
  T,
}: {
  values: number[];
  scale: number[];
  range: Range;
  onChange: (next: Range) => void;
  format: (n: number) => string;
  unit: string;
  minStep: number;
  T: Text;
}) {
  const domain = useMemo(() => {
    const sorted = [...scale].sort((a, b) => a - b);
    const at = (p: number) => sorted[Math.round(p * (sorted.length - 1))] ?? 0;
    let lo = at(0.02), hi = at(0.98);
    if (hi <= lo) [lo, hi] = [sorted[0] ?? 0, sorted.at(-1) ?? 1];
    const step = Math.max(minStep, niceStep((hi - lo) / 100));
    lo = Math.floor(lo / step) * step;
    hi = Math.max(lo + step, Math.ceil(hi / step) * step);
    return { lo, hi, step };
  }, [scale, minStep]);
  const fromRange = useCallback(
    (r: Range): [number, number] => [Math.max(domain.lo, Math.min(r.lo ?? domain.lo, domain.hi)), Math.min(domain.hi, Math.max(r.hi ?? domain.hi, domain.lo))],
    [domain],
  );
  const [[a, b], setDraft] = useState(() => fromRange(range));
  // The filter set from elsewhere, as by Clear all
  useEffect(() => setDraft(fromRange(range)), [range, fromRange]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Dragging redraws at once and filters the table a moment after the handle stops
  const drag = (lo: number, hi: number) => {
    setDraft([lo, hi]);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ lo: lo <= domain.lo ? null : lo, hi: hi >= domain.hi ? null : hi }), 150);
  };
  // An exact bound applies as typed, even past the scale's ends
  const type = (side: "lo" | "hi", n: number | null) => {
    clearTimeout(timer.current);
    const next = { ...range, [side]: n };
    setDraft(fromRange(next));
    onChange(next);
  };
  const bins = useMemo(() => {
    const counts = new Array<number>(BINS).fill(0);
    for (const v of values) counts[Math.min(BINS - 1, Math.max(0, Math.floor(((v - domain.lo) / (domain.hi - domain.lo)) * BINS)))]! += 1;
    return counts;
  }, [values, domain]);
  const peak = Math.max(1, ...bins);
  const pct = (v: number) => ((v - domain.lo) / (domain.hi - domain.lo)) * 100;
  const lo = range.lo ?? (a > domain.lo ? a : null), hi = range.hi ?? (b < domain.hi ? b : null);
  const inside = values.filter(v => (lo === null || v >= lo) && (hi === null || v <= hi)).length;
  return (
    <div className="rangef">
      <div className="hist" aria-hidden="true">
        {bins.map((n, i) => {
          const mid = domain.lo + ((i + 0.5) / BINS) * (domain.hi - domain.lo);
          return <i key={i} className={mid >= a && mid <= b ? "in" : undefined} style={{ height: n ? `${Math.max(6, (n / peak) * 100)}%` : 0 }} />;
        })}
      </div>
      <div className="slider">
        <span className="track" />
        <span className="fill" style={{ left: `${pct(a)}%`, right: `${100 - pct(b)}%` }} />
        <input type="range" aria-label={T.lower} min={domain.lo} max={domain.hi} step={domain.step} value={a} onChange={e => drag(Math.min(Number(e.target.value), b), b)} />
        <input type="range" aria-label={T.upper} min={domain.lo} max={domain.hi} step={domain.step} value={b} onChange={e => drag(a, Math.max(Number(e.target.value), a))} />
      </div>
      <div className="bounds">
        <Bound label={T.lower} value={lo} placeholder={format(domain.lo)} unit={unit} onSet={n => type("lo", n)} />
        <Bound label={T.upper} value={hi} placeholder={format(domain.hi)} unit={unit} onSet={n => type("hi", n)} />
      </div>
      <p className="hint">{T.inRange(inside)}</p>
    </div>
  );
}

/** A box for one bound: empty leaves that side open */
function Bound({ label, value, placeholder, unit, onSet }: { label: string; value: number | null; placeholder: string; unit: string; onSet: (n: number | null) => void }) {
  const shown = value === null ? "" : String(Math.round(value * 10) / 10);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const done = () => {
    const n = text.trim() === "" ? null : Number(text.trim().replace(/\s/g, "").replace(",", "."));
    if (n === null || Number.isFinite(n)) onSet(n);
    else setText(shown);
  };
  return (
    <label className="bound">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={e => setText(e.target.value)}
        onBlur={done}
        onKeyDown={e => {
          if (e.key === "Enter") done();
        }}
      />
      <span className="unit">{unit}</span>
    </label>
  );
}
