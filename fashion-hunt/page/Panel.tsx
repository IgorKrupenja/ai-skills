import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Whether the page is phone-sized, as the stylesheet's own breakpoint has it */
export function useNarrow() {
  const query = "(max-width: 760px)";
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return narrow;
}

type Props = { title: string; anchor: HTMLElement | null; narrow: boolean; done: string; onClose: () => void; children: ReactNode };

/**
 * What a filter pill opens: under the pill on a wide screen, closing on a click elsewhere, and on
 * phones a sheet from the bottom of the screen, with a button that shows the listings.
 * Escape closes either and puts the focus back on the pill.
 */
export function Panel({ title, anchor, narrow, done, onClose, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  // Under the pill, kept within the filter bar, which it's positioned in; again after each render,
  // since a pill's new value can move the pills
  useLayoutEffect(() => {
    const bar = anchor?.closest(".bar");
    if (narrow || !anchor || !bar || !box.current) return;
    const a = anchor.getBoundingClientRect(), b = bar.getBoundingClientRect();
    const top = Math.round(a.bottom - b.top + 6), left = Math.round(Math.max(0, Math.min(a.left - b.left, b.width - box.current.offsetWidth)));
    if (place?.top !== top || place?.left !== left) setPlace({ top, left });
  }, [anchor, narrow, place, children]);
  useEffect(() => box.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      anchor?.focus();
    };
    const down = (e: PointerEvent) => {
      if (e.target instanceof Node && !box.current?.contains(e.target) && !anchor?.contains(e.target)) onClose();
    };
    addEventListener("keydown", key);
    if (!narrow) addEventListener("pointerdown", down);
    // The page behind a sheet stays put
    const overflow = document.body.style.overflow;
    if (narrow) document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", key);
      removeEventListener("pointerdown", down);
      document.body.style.overflow = overflow;
    };
  }, [anchor, narrow, onClose]);
  if (narrow) {
    return createPortal(
      <>
        <div className="backdrop" onClick={onClose} />
        <div className="sheet" role="dialog" aria-label={title} ref={box} tabIndex={-1}>
          <div className="grab" aria-hidden="true" />
          <div className="sheetbody">
            <h3>{title}</h3>
            {children}
          </div>
          <div className="sheetfoot">
            <button type="button" onClick={onClose}>
              {done}
            </button>
          </div>
        </div>
      </>,
      document.body,
    );
  }
  return (
    <div className="panel" role="dialog" aria-label={title} ref={box} tabIndex={-1} style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}>
      {children}
    </div>
  );
}
