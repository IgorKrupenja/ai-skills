import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import type { Filters, SortKey } from "./filters.ts";
import type { Setup } from "./setup.ts";
import type { Report } from "./types.ts";

type Props = {
  R: Report;
  S: Setup;
  f: Filters;
  counts: { tabs: Map<string, number>; shown: number; total: number };
  set: (change: Partial<Filters>) => void;
  toggle: (key: "sizes" | "conds", value: string) => void;
  barRef: Ref<HTMLElement>;
};

/** The sticky bar: the tabs, then the size and condition chips, the shop menu, the switches, the sort menu (on phones) and the count */
export function FilterBar({ R, S, f, counts, set, toggle, barRef }: Props) {
  const { T } = S;
  const tab = S.tabs.find(g => g.id === f.group);
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
      <div className="row">
        {R.sizeOrder.length > 1 ? (
          <div className="chips" role="group" aria-label={T.sizes}>
            <span className="count">{T.size}</span>
            {R.sizeOrder.map(z => (
              <button type="button" key={z} id={`size-${z}`} aria-pressed={f.sizes.has(z)} onClick={() => toggle("sizes", z)}>
                {z}
              </button>
            ))}
          </div>
        ) : null}
        {R.conditionOrder.length > 1 ? (
          <div className="chips" role="group" aria-label={T.conds}>
            <span className="count">{T.cond}</span>
            {R.conditionOrder.map(c => (
              <button type="button" key={c} id={`cond-${c}`} aria-pressed={f.conds.has(c)} onClick={() => toggle("conds", c)}>
                {R.conditionNames[c] || c}
              </button>
            ))}
          </div>
        ) : null}
        {S.shops.length > 1 ? (
          <label htmlFor="shop">
            <span>{T.shop}</span>{" "}
            <select id="shop" value={f.shop} onChange={e => set({ shop: e.target.value })}>
              <option value="">{T.all}</option>
              {S.shops.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {S.has.risk ? (
          <Switch id="norisk" label={T.noRisk} tip={T.riskTip} on={f.norisk} set={on => set({ norisk: on })} after={<> <span className="risk">⚠</span></>} />
        ) : null}
        {S.has.nonEU ? <Switch id="eu" label={T.eu} on={f.eu} set={on => set({ eu: on })} /> : null}
        {S.has.notCheaper ? <Switch id="cheap" label={T.cheap} on={f.cheap} set={on => set({ cheap: on })} /> : null}
        {S.has.dup ? <Switch id="norepeat" label={T.noRepeat} tip={T.repeatTip} on={f.norepeat} set={on => set({ norepeat: on })} /> : null}
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
    </section>
  );
}

type SwitchProps = { id: string; label: string; tip?: string; on: boolean; set: (on: boolean) => void; after?: ReactNode };

/** A checkbox filter. One with a short label gets a tooltip saying what it does: on hover, on keyboard focus and after a tap */
function Switch({ id, label, tip, on, set, after }: SwitchProps) {
  const box = useRef<HTMLLabelElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tapped = useRef(false);
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  // A mouse shows it after a moment, and can move from the filter onto it without it closing
  const enter = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    if (!open) timer.current = setTimeout(show, 300);
  };
  const leave = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, 150);
  };
  // Placed after every render while open, so it follows the filter when the bar is redrawn
  useLayoutEffect(() => {
    if (open && box.current && bubble.current) place(box.current, bubble.current);
  });
  useEffect(() => {
    if (!open) return;
    // A tap or click anywhere but the filter closes it, the tooltip itself included, since on phones it covers the filters below
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Node && box.current?.contains(e.target))) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const move = () => {
      if (box.current && bubble.current) place(box.current, bubble.current);
    };
    const options = { capture: true, passive: true };
    addEventListener("pointerdown", down);
    addEventListener("keydown", key);
    addEventListener("scroll", move, options);
    addEventListener("resize", move, options);
    return () => {
      removeEventListener("pointerdown", down);
      removeEventListener("keydown", key);
      removeEventListener("scroll", move, options);
      removeEventListener("resize", move, options);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const tipId = tip ? `tip-${id}` : undefined;
  return (
    <>
      <label
        htmlFor={id}
        ref={box}
        onPointerEnter={tip ? enter : undefined}
        onPointerLeave={tip ? leave : undefined}
        onPointerDown={e => {
          tapped.current = e.pointerType !== "mouse";
        }}
      >
        <input
          type="checkbox"
          id={id}
          checked={on}
          aria-describedby={tipId}
          onChange={e => {
            set(e.target.checked);
            if (tip && (tapped.current || open)) show();
            tapped.current = false;
          }}
          onFocus={e => {
            if (tip && e.target.matches(":focus-visible")) show();
          }}
          onBlur={tip ? hide : undefined}
        />{" "}
        <span id={`l-${id}`}>{label}</span>
        {after}
      </label>
      {tip
        ? createPortal(
            <div className="tip" id={tipId} role="tooltip" ref={bubble} hidden={!open} onPointerEnter={enter} onPointerLeave={leave}>
              {tip}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** A tooltip below its filter, or above it when there's no room, and within the filter bar's width */
function place(box: HTMLElement, tip: HTMLElement) {
  const a = box.getBoundingClientRect();
  const bar = (box.closest(".bar") ?? document.body).getBoundingClientRect();
  const gap = 8;
  tip.style.maxWidth = `${Math.min(300, bar.width)}px`;
  tip.style.top = `${a.bottom + gap + tip.offsetHeight <= innerHeight ? a.bottom + gap : Math.max(gap, a.top - gap - tip.offsetHeight)}px`;
  tip.style.left = `${Math.max(bar.left, Math.min(a.left, bar.right - tip.offsetWidth))}px`;
}
