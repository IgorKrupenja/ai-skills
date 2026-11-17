import { Fragment, memo, useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ALL, type Filters, type SortKey } from "./filters.ts";
import type { Setup } from "./setup.ts";
import type { Row } from "./types.ts";

type Props = { list: Row[]; S: Setup; f: Filters; onSort: (key: SortKey) => void; boxRef: Ref<HTMLDivElement> };

/** The listings table, which turns into cards on phones, with sortable headings and a larger photo on hover */
export function Listings({ list, S, f, onSort, boxRef }: Props) {
  const { T, cols } = S;
  const body = useRef<HTMLTableSectionElement>(null);
  const showGroup = f.group === ALL;
  return (
    <div className="tablebox" ref={boxRef}>
      <table>
        <thead>
          <tr>
            {cols.map((c, i) => {
              const cls = [4, 5, 6].includes(i) ? "r" : undefined;
              const k = S.sortKeys.find(k => S.sorts[k].col === i);
              if (!k) {
                return (
                  <th key={i} className={cls}>
                    {c}
                  </th>
                );
              }
              const on = f.sortKey === k, asc = f.sortDir === "asc";
              return (
                <th key={i} className={cls} aria-sort={on ? (asc ? "ascending" : "descending") : "none"}>
                  <button type="button" className="sorth" data-k={k} onClick={() => onSort(k)}>
                    {c}
                    <span className="arr" aria-hidden="true">
                      {on ? (asc ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={body}>
          {list.map(r => (
            <Listing key={S.keys.get(r)} r={r} S={S} showGroup={showGroup} />
          ))}
        </tbody>
      </table>
      {list.length ? null : <div className="empty">{T.empty}</div>}
      <Preview rows={body} />
    </div>
  );
}

const link = (url: string, text: string) => (
  <a href={url} target="_blank" rel="noopener">
    {text}
  </a>
);

/** One listing's row. Cells left empty stay truly empty, so phones can hide them */
const Listing = memo(function Listing({ r, S, showGroup }: { r: Row; S: Setup; showGroup: boolean }) {
  const { T, cols, money } = S;
  const diff = r.newPrice !== null && r.price !== null ? r.price - r.newPrice : null;
  const notes: ReactNode[] = [];
  if (r.risk) {
    notes.push(
      <span className="risk">
        ⚠ {T.risk}: {r.risk}
      </span>,
    );
  }
  // Other listings with the same photo, each linked by its price, and by its shop when it's another one
  if (r.same.length) {
    notes.push(
      <span className="same">
        {T.samePhoto(r.same.length)}:{" "}
        {r.same.map((s, i) => (
          <Fragment key={i}>
            {i ? ", " : null}
            {link(s.url, `${s.shop === r.shop ? "" : `${s.shop} `}${s.price === null ? T.noPrice : money.format(s.price)}`)}
          </Fragment>
        ))}
      </span>,
    );
  }
  if (r.note) notes.push(r.note);
  return (
    <tr>
      <td className="shop" data-l={cols[0]}>
        {link(r.url, r.shop)}
      </td>
      <td className="item">
        <div className="iwrap">
          {r.image ? (
            <a className="thumb" href={r.url} target="_blank" rel="noopener" tabIndex={-1} aria-hidden="true">
              <img src={r.image} alt="" loading="lazy" decoding="async" />
            </a>
          ) : null}
          <div>
            {r.item}
            {r.change ? <> <span className="chg">{r.change}</span></> : null}
            {showGroup && r.group !== S.match ? <> <span className="grp">{S.groupLabels.get(r.group)}</span></> : null}
          </div>
        </div>
      </td>
      <td className="cond" data-l={cols[2]} title={r.shopCondition && r.shopCondition !== r.condition ? r.shopCondition : undefined}>
        {r.condition || null}
      </td>
      <td className="size" data-l={cols[3]} title={r.dims && r.size ? r.size : undefined}>
        {r.dims ? S.dims(r.dims) : r.size || T.noSize}
      </td>
      <td className="price">
        {r.price === null ? T.noPrice : money.format(r.price)}
        {r.priceNote ? <span className="sub">{r.priceNote}</span> : null}
      </td>
      <td className="new" data-l={cols[5]}>
        {r.newPrice === null ? null : r.newUrl ? link(r.newUrl, money.format(r.newPrice)) : money.format(r.newPrice)}
        {r.newNote ? <span className="sub">{r.newNote}</span> : null}
      </td>
      <td className="diff" data-l={cols[6]}>
        {diff === null ? null : (
          <span className={diff > 0 ? "above" : undefined}>
            {diff < 0 ? "−" : "+"}
            {money.format(Math.abs(diff))}
          </span>
        )}
      </td>
      <td className={r.nonEU ? "ships nonEU" : "ships"} data-l={cols[7]}>
        {r.ships}
      </td>
      <td className="note">
        {notes.map((note, i) => (
          <Fragment key={i}>
            {i ? " " : null}
            {note}
          </Fragment>
        ))}
      </td>
    </tr>
  );
});

/** A larger copy of a thumbnail's photo while the mouse is over it, fixed to the window so the table's scroll box can't cut it off */
function Preview({ rows }: { rows: RefObject<HTMLTableSectionElement | null> }) {
  const [shown, setShown] = useState<{ src: string; top: number; left: number } | null>(null);
  useEffect(() => {
    const body = rows.current;
    if (!body) return;
    const canHover = matchMedia("(hover: hover) and (min-width: 761px)");
    const size = 205, gap = 8;
    // Over the thumbnail, or above it when there's no room below
    const over = (e: MouseEvent) => {
      const thumb = e.target instanceof Element ? e.target.closest(".thumb") : null;
      const img = thumb?.querySelector("img");
      if (!thumb || !img || !canHover.matches) return;
      const box = thumb.getBoundingClientRect();
      setShown({
        src: img.currentSrc || img.src,
        top: box.top + size + gap <= innerHeight ? box.top : Math.max(gap, box.bottom - size),
        left: Math.max(gap, Math.min(box.left, innerWidth - size - gap)),
      });
    };
    const out = (e: MouseEvent) => {
      const from = e.target instanceof Element ? e.target.closest(".thumb") : null;
      const to = e.relatedTarget instanceof Element ? e.relatedTarget.closest(".thumb") : null;
      if (from && !to) setShown(null);
    };
    // Scrolling the page or the table moves the thumbnail away from the preview
    const scroll = () => setShown(null);
    const options = { capture: true, passive: true };
    body.addEventListener("mouseover", over);
    body.addEventListener("mouseout", out);
    addEventListener("scroll", scroll, options);
    return () => {
      body.removeEventListener("mouseover", over);
      body.removeEventListener("mouseout", out);
      removeEventListener("scroll", scroll, options);
    };
  }, [rows]);
  return createPortal(
    <div className="preview" aria-hidden="true" hidden={!shown} style={shown ? { top: shown.top, left: shown.left } : undefined}>
      <img src={shown?.src} alt="" />
    </div>,
    document.body,
  );
}
