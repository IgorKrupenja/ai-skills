import { useMemo, type ReactNode } from "react";
import type { Setup } from "./setup.ts";
import type { Row } from "./types.ts";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};

type Props = { S: Setup; rows: Row[]; picked: Set<string>; onToggle: (name: string) => void };

/**
 * A card per variant with its count, lowest and median price among the listings the open tab and
 * the other filters leave, so a card's number is what clicking it shows; clicking cards filters the
 * table to those variants. Cards keep their places, and one with nothing to show is dimmed.
 */
export function Variants({ S, rows, picked, onToggle }: Props) {
  const { T, money } = S;
  const cards = useMemo(
    () =>
      S.variants.map(name => {
        const whole = (x: number) => money.format(Math.round(x));
        const mine = rows.filter(r => r.variant === name);
        const prices = mine.map(r => r.price).filter(p => p !== null);
        const euPrices = mine.filter(r => !r.nonEU).map(r => r.price).filter(p => p !== null);
        const def = S.variantDefs.get(name);
        const stats: ReactNode[] = [
          <>
            {T.listed(mine.length)}
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
        return { name, swatch: def?.swatch ?? "", stats, count: mine.length };
      }),
    [S, T, money, rows],
  );
  if (!cards.length) return null;
  return (
    <section className="variants" aria-label={T.variants}>
      {cards.map(card => (
        <button
          type="button"
          key={card.name}
          className={card.count || picked.has(card.name) ? "variant" : "variant none"}
          data-v={card.name}
          aria-pressed={picked.has(card.name)}
          onClick={() => onToggle(card.name)}
        >
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
