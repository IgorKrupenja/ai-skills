/** What the report page's filters and sorting do, apart from how they look. */

import type { Report, Row } from "./types.ts";

/** The tab with every listing */
export const ALL = "_all";

export type SortKind = "text" | "cond" | "size" | "money" | "diff";
export type SortKey = "shop" | "cond" | "size" | "price" | "new" | "diff" | "ships";
/** A column the table sorts by, with the value it sorts on; a missing value is null */
export type Sort = { col: number; kind: SortKind; value: (r: Row) => string | number | null };

export type Filters = {
  group: string;
  variants: Set<string>;
  sizes: Set<string>;
  conds: Set<string>;
  shop: string;
  norisk: boolean;
  eu: boolean;
  cheap: boolean;
  norepeat: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
};

/** The condition scale's order, for sorting by condition */
const COND_RANK: Record<string, number> = Object.fromEntries(
  ["newTags", "new", "likeNew", "veryGood", "good", "fair", "used", "other"].map((key, i) => [key, i]),
);

/** The columns the table sorts by */
export function sortsFor(report: Report): Record<SortKey, Sort> {
  return {
    shop: { col: 0, kind: "text", value: r => r.shop || null },
    cond: { col: 2, kind: "cond", value: r => COND_RANK[r.cond] ?? null },
    size: {
      col: 3,
      kind: "size",
      value: r => {
        const i = Math.min(...r.sizes.map(z => report.sizeOrder.indexOf(z)).filter(i => i >= 0));
        return Number.isFinite(i) ? i : null;
      },
    },
    price: { col: 4, kind: "money", value: r => r.price },
    new: { col: 5, kind: "money", value: r => r.newPrice },
    diff: { col: 6, kind: "diff", value: r => (r.newPrice !== null && r.price !== null ? r.price - r.newPrice : null) },
    ships: { col: 7, kind: "text", value: r => r.ships || null },
  };
}

/** Listings priced at or above the brand's own new price: rarely worth buying second-hand */
export const notCheaper = (r: Row) => r.newPrice !== null && r.price !== null && r.price >= r.newPrice;

/** Whether a listing passes the filters; anyGroup leaves the tab out, for the tabs' own counts */
export function passes(r: Row, f: Filters, anyGroup: boolean): boolean {
  if (!anyGroup && f.group !== ALL && r.group !== f.group) return false;
  if (f.variants.size && !f.variants.has(r.variant)) return false;
  if (f.sizes.size && !r.sizes.some(z => f.sizes.has(z))) return false;
  if (f.conds.size && !f.conds.has(r.cond)) return false;
  if (f.shop && r.shop !== f.shop) return false;
  if (f.norisk && r.risk) return false;
  if (f.eu && r.nonEU) return false;
  if (f.cheap && notCheaper(r)) return false;
  return true;
}

/** Of the listings that pass the filters and share a photo, only the cheapest, while repeats are hidden */
export function dedupe(rows: Row[], f: Filters): Row[] {
  if (!f.norepeat) return rows;
  const cheapest = new Map<number, Row>();
  for (const r of rows) {
    const best = cheapest.get(r.dup);
    if (r.dup && (!best || (r.price ?? Infinity) < (best.price ?? Infinity))) cheapest.set(r.dup, r);
  }
  return rows.filter(r => !r.dup || cheapest.get(r.dup) === r);
}

/** The table's order: by the sort column with a missing value last, then by price */
export function comparer(sort: Sort, dir: Filters["sortDir"], locale: string) {
  const sign = dir === "asc" ? 1 : -1;
  return (a: Row, b: Row) => {
    const va = sort.value(a), vb = sort.value(b);
    if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
    if (va !== null && vb !== null && va !== vb) {
      return sign * (typeof va === "string" ? va.localeCompare(String(vb), locale) : va - Number(vb));
    }
    return Number(a.price === null) - Number(b.price === null) || (a.price ?? 0) - (b.price ?? 0);
  };
}

const KEY = "fashion-hunt-filters";

/** What the filters can be on this page, so a saved choice from another page is dropped */
export type Choices = { groups: string[]; variants: string[]; sizes: string[]; conds: string[]; shops: string[]; sortKeys: SortKey[] };

/** The filters saved last time, where they still fit this page */
export function loadFilters(defaults: Filters, choices: Choices): Filters {
  const f: Filters = { ...defaults, variants: new Set(), sizes: new Set(), conds: new Set() };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as Record<string, unknown> | null;
    if (!saved) return f;
    const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
    const among = (options: readonly string[]) => (value: unknown): value is string => typeof value === "string" && options.includes(value);
    if (among(choices.groups)(saved.group)) f.group = saved.group;
    // Pages from before several variants could be picked saved one, as variant
    f.variants = new Set([...list(saved.variants), saved.variant].filter(among(choices.variants)));
    f.sizes = new Set(list(saved.sizes).filter(among(choices.sizes)));
    f.conds = new Set(list(saved.conds).filter(among(choices.conds)));
    if (among(choices.shops)(saved.shop)) f.shop = saved.shop;
    f.norisk = !!saved.norisk;
    f.eu = !!saved.eu;
    if (typeof saved.cheap === "boolean") f.cheap = saved.cheap;
    if (typeof saved.norepeat === "boolean") f.norepeat = saved.norepeat;
    if (among(choices.sortKeys)(saved.sortKey)) f.sortKey = saved.sortKey as SortKey;
    // Pages from before column sorting saved only the price order, as sort
    if (saved.sortDir === "desc" || (!saved.sortKey && saved.sort === "desc")) f.sortDir = "desc";
  } catch {
    // No storage, as in a private window, or a saved value that isn't JSON: the defaults stand
  }
  return f;
}

export function saveFilters(f: Filters) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...f, variants: [...f.variants], sizes: [...f.sizes], conds: [...f.conds] }));
  } catch {
    // No storage: the filters last only as long as the page
  }
}
