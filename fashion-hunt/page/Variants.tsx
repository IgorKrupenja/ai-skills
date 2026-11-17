import { useMemo, type ReactNode } from "react";
import type { Setup } from "./setup.ts";
import type { Report } from "./types.ts";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};

/** A card per variant with its count, lowest and median price; clicking cards filters the table to those variants */
export function Variants({ R, S, picked, onToggle }: { R: Report; S: Setup; picked: Set<string>; onToggle: (name: string) => void }) {
  const { T, money } = S;
  const cards = useMemo(
    () =>
      S.variants.map(name => {
        const whole = (x: number) => money.format(Math.round(x));
        const rows = R.rows.filter(r => r.variant === name);
        const prices = rows.map(r => r.price).filter(p => p !== null);
        const euPrices = rows.filter(r => !r.nonEU).map(r => r.price).filter(p => p !== null);
        const def = S.variantDefs.get(name);
        const stats: ReactNode[] = [
          <>
            {T.listed(rows.length)}
            {prices.length ? <> · {T.from} <b>{whole(Math.min(...prices))}</b></> : null}
          </>,
        ];
        if (prices.length > 1) {
          stats.push(
            <>
              {T.median} <b>{whole(median(prices))}</b>
              {euPrices.length && euPrices.length < prices.length ? <>, {T.euSellers} <b>{whole(median(euPrices))}</b></> : null}
            </>,
          );
        }
        if (def?.hint) stats.push(def.hint);
        return { name, swatch: def?.swatch ?? "", stats };
      }),
    [R, S, T, money],
  );
  if (!cards.length) return null;
  return (
    <section className="variants" aria-label={T.variants}>
      {cards.map(card => (
        <button type="button" key={card.name} className="variant" data-v={card.name} aria-pressed={picked.has(card.name)} onClick={() => onToggle(card.name)}>
          <span className="vname">
            {card.swatch ? <span className="sw" aria-hidden="true" dangerouslySetInnerHTML={{ __html: card.swatch }} /> : null}
            {card.name}
          </span>
          {card.stats.map((stat, i) => (
            <span className="vstat" key={i}>
              {stat}
            </span>
          ))}
        </button>
      ))}
    </section>
  );
}
