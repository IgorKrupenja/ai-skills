/** What the report page's filters and sorting do, apart from how they look. */

import type { Report, Row } from "./types.ts";

/** The tab with every listing */
export const ALL = "_all";

export type SortKind = "text" | "cond" | "size" | "money" | "diff";
export type SortKey = "shop" | "cond" | "size" | "price" | "new" | "diff" | "ships";
/** A column the table sorts by, with the value it sorts on; a missing value is null */
export type Sort = { col: number; kind: SortKind; value: (r: Row) => string | number | null };

/** A range filter's bounds; null leaves that side open */
export type Range = { lo: number | null; hi: number | null };
export const OPEN: Range = { lo: null, hi: null };
export const isOpen = (range: Range) => range.lo === null && range.hi === null;
/** Whether a value is in a range; a missing value is only in an open one */
export const inRange = (value: number | null, range: Range) =>
  isOpen(range) || (value !== null && (range.lo === null || value >= range.lo) && (range.hi === null || value <= range.hi));

/** How far below the brand's new price a listing has to be */
export type Below = "any" | "below" | "20" | "40";
export const BELOW: Below[] = ["any", "below", "20", "40"];
const SHARE = { "20": 0.8, "40": 0.6 } as const;
/** Whether a listing is cheap enough next to the new price; one without both prices always is */
export function cheapEnough(r: Row, below: Below): boolean {
  if (below === "any" || r.newPrice === null || r.price === null) return true;
  return below === "below" ? r.price < r.newPrice : r.price <= r.newPrice * SHARE[below];
}

/** The ships-from filter's options for listings that name no country, outside the EU or not */
export const OUTSIDE = "_outside";
export const NONE = "_none";
const IN_STORE = /^(in store|в магазине)\b/i;

/**
 * A listing's option in the ships-from filter: its country, or for one that names none, the store
 * it's in, or whether it's known to be outside the EU
 */
export const shipKey = (r: Row) => r.country || (IN_STORE.test(r.ships) ? r.ships : r.nonEU ? OUTSIDE : NONE);

/** The filter pills: one per filterable column, and More for the switches */
export type Facet = "shop" | "cond" | "size" | "price" | "new" | "diff" | "ships" | "more";

export type Filters = {
  group: string;
  variants: Set<string>;
  shops: Set<string>;
  conds: Set<string>;
  /** Size buckets: letter or number sizes, or a bag's named size or range of widths */
  sizes: Set<string>;
  price: Range;
  newPrice: Range;
  below: Below;
  /** Ships-from options, as shipKey gives them */
  ships: Set<string>;
  norisk: boolean;
  norepeat: boolean;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
};

/** What a page shows at first: listings below the new price, with repeats hidden */
export function defaults(group: string): Filters {
  return {
    group,
    variants: new Set(),
    shops: new Set(),
    conds: new Set(),
    sizes: new Set(),
    price: OPEN,
    newPrice: OPEN,
    below: "below",
    ships: new Set(),
    norisk: false,
    norepeat: true,
    sortKey: "price",
    sortDir: "asc",
  };
}

/** Every filter off, the variant cards included; the tab and the order stay */
export const cleared = (f: Filters): Filters => ({ ...defaults(f.group), below: "any", norepeat: false, sortKey: f.sortKey, sortDir: f.sortDir });

/**
 * Whether a listing passes the filters. anyGroup leaves the tab out, and skip one pill or the
 * variant cards, for the counts each shows: what it would leave, given everything else.
 */
export function passes(r: Row, f: Filters, anyGroup: boolean, skip?: Facet | "variant"): boolean {
  if (!anyGroup && f.group !== ALL && r.group !== f.group) return false;
  if (skip !== "variant" && f.variants.size && !f.variants.has(r.variant)) return false;
  if (skip !== "shop" && f.shops.size && !f.shops.has(r.shop)) return false;
  if (skip !== "cond" && f.conds.size && !f.conds.has(r.cond)) return false;
  if (skip !== "size" && f.sizes.size && !r.sizes.some(z => f.sizes.has(z))) return false;
  if (skip !== "price" && !inRange(r.price, f.price)) return false;
  if (skip !== "new" && !inRange(r.newPrice, f.newPrice)) return false;
  if (skip !== "diff" && !cheapEnough(r, f.below)) return false;
  if (skip !== "ships" && f.ships.size && !f.ships.has(shipKey(r))) return false;
  if (skip !== "more" && f.norisk && r.risk) return false;
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

/** The condition scale's order, for sorting by condition */
const COND_RANK: Record<string, number> = Object.fromEntries(
  ["newTags", "new", "likeNew", "veryGood", "good", "fair", "used", "other"].map((key, i) => [key, i]),
);

/** The columns the table sorts by */
export function sortsFor(report: Report): Record<SortKey, Sort> {
  const sizeRank = (r: Row) => {
    const i = Math.min(...r.sizes.filter(z => z !== "none").map(z => report.sizeOrder.indexOf(z)).filter(i => i >= 0));
    return Number.isFinite(i) ? i : null;
  };
  return {
    shop: { col: 0, kind: "text", value: r => r.shop || null },
    cond: { col: 2, kind: "cond", value: r => COND_RANK[r.cond] ?? null },
    size: { col: 3, kind: "size", value: report.bags ? r => r.dims?.w ?? null : sizeRank },
    price: { col: 4, kind: "money", value: r => r.price },
    new: { col: 5, kind: "money", value: r => r.newPrice },
    diff: { col: 6, kind: "diff", value: r => (r.newPrice !== null && r.price !== null ? r.price - r.newPrice : null) },
    ships: { col: 7, kind: "text", value: r => r.ships || null },
  };
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

/** Filters saved before each report kept its own, which every report then shared */
const SHARED_KEY = "fashion-hunt-filters";
export const storageKey = (report: Report) => `${SHARED_KEY}:${report.title}`;

/** What the filters can be on this page, so a saved choice that no longer fits is dropped */
export type Choices = {
  groups: string[];
  variants: string[];
  shops: string[];
  conds: string[];
  sizes: string[];
  ships: string[];
  /** The ships-from options not known to be outside the EU, which an old "EU only" switch kept */
  inside: string[];
  sortKeys: SortKey[];
};

/** The filters saved last time, where they still fit this page */
export function loadFilters(key: string, base: Filters, choices: Choices): Filters {
  const f: Filters = { ...base };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || localStorage.getItem(SHARED_KEY) || "null") as Record<string, unknown> | null;
    if (!saved) return f;
    const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
    const among = (options: readonly string[]) => (value: unknown): value is string => typeof value === "string" && options.includes(value);
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
    const range = (value: unknown): Range => {
      const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return { lo: number(saved.lo), hi: number(saved.hi) };
    };
    if (among(choices.groups)(saved.group)) f.group = saved.group;
    // Pages from before several variants or shops could be picked saved one, as variant and shop
    f.variants = new Set([...list(saved.variants), saved.variant].filter(among(choices.variants)));
    f.shops = new Set([...list(saved.shops), saved.shop].filter(among(choices.shops)));
    f.conds = new Set(list(saved.conds).filter(among(choices.conds)));
    f.sizes = new Set(list(saved.sizes).filter(among(choices.sizes)));
    f.ships = new Set(list(saved.ships).filter(among(choices.ships)));
    // Pages from before the countries could be picked had a switch that hid listings from outside the EU, as eu
    if (saved.eu === true && !f.ships.size) f.ships = new Set(choices.inside);
    f.price = range(saved.price);
    f.newPrice = range(saved.newPrice);
    // Pages from before the difference filter had a switch for listings below the new price, as cheap
    if (among(BELOW)(saved.below)) f.below = saved.below as Below;
    else if (saved.cheap === false) f.below = "any";
    f.norisk = !!saved.norisk;
    if (typeof saved.norepeat === "boolean") f.norepeat = saved.norepeat;
    if (among(choices.sortKeys)(saved.sortKey)) f.sortKey = saved.sortKey as SortKey;
    // Pages from before column sorting saved only the price order, as sort
    if (saved.sortDir === "desc" || (!saved.sortKey && saved.sort === "desc")) f.sortDir = "desc";
  } catch {
    // No storage, as in a private window, or a saved value that isn't JSON: the defaults stand
  }
  return f;
}

export function saveFilters(key: string, f: Filters) {
  try {
    const sets = { variants: [...f.variants], shops: [...f.shops], conds: [...f.conds], sizes: [...f.sizes], ships: [...f.ships] };
    localStorage.setItem(key, JSON.stringify({ ...f, ...sets }));
  } catch {
    // No storage: the filters last only as long as the page
  }
}
