/** What the report page works out from the report once: its words, formats, tabs, options and sortable columns. */

import { ALL, NONE, OUTSIDE, shipKey, sortsFor, type SortKey } from "./filters.ts";
import { TEXT } from "./text.ts";
import type { Dims, Group, Report, Row } from "./types.ts";

/** Values by how many listings have each, most first */
function byCount(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
}

const distinct = (values: (number | null)[]) => new Set(values.filter(v => v !== null)).size;

/** The grades the "or better" shortcuts offer, best first, of the condition scale */
const GRADES = ["newTags", "new", "likeNew", "veryGood", "good", "fair"];

export function setup(R: Report) {
  const T = TEXT[R.lang] ?? TEXT.en;
  const cols = [...T.cols];
  if (R.newLabel) cols[5] = R.newLabel;
  const money = new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const wholeMoney = new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const int = new Intl.NumberFormat(T.locale, { maximumFractionDigits: 0 });
  const cm = new Intl.NumberFormat(T.locale, { maximumFractionDigits: 1 });
  const dims = (d: Dims) => `${[d.w, d.h, d.d].filter(n => n !== null).map(n => cm.format(n)).join(" × ")} ${T.cm}`;

  // The groups as tabs, plus one with every listing when more than one group has any
  const tabs: Group[] = [...R.groups];
  if (new Set(R.rows.map(r => r.group)).size > 1) tabs.push({ id: ALL, label: T.allTab, hint: T.allHint });

  // A card per variant: in the order the run gives, then the rest by count
  const variantCount = new Map<string, number>();
  for (const r of R.rows) if (r.variant) variantCount.set(r.variant, (variantCount.get(r.variant) ?? 0) + 1);
  const variantDefs = new Map(R.variants.map(v => [v.name, v]));
  const variants = [
    ...R.variants.map(v => v.name).filter(name => variantCount.has(name)),
    ...[...variantCount.keys()].filter(name => !variantDefs.has(name)).sort((a, b) => variantCount.get(b)! - variantCount.get(a)!),
  ];

  // Only columns with at least two different values are worth sorting by
  const sorts = sortsFor(R);
  const sortKeys = (Object.keys(sorts) as SortKey[]).filter(k => new Set(R.rows.map(sorts[k].value).filter(v => v !== null)).size > 1);
  if (!sortKeys.includes("price")) sortKeys.unshift("price");

  // The "or better" shortcuts: each grade on the page with every better one, for the grades in between
  const present = GRADES.filter(g => R.conditionOrder.includes(g));
  const better = present.slice(1, -1).map(grade => ({ grade, conds: present.slice(0, present.indexOf(grade) + 1) }));

  // The ships-from options: the EU countries, those outside it, then listings that name no country
  const outside = new Set(R.rows.filter(r => r.nonEU).map(shipKey));
  const keys = byCount(R.rows.map(shipKey));
  const ships = {
    eu: keys.filter(k => !outside.has(k) && R.rows.some(r => r.country === k)),
    outside: keys.filter(k => outside.has(k)),
    other: keys.filter(k => !outside.has(k) && !R.rows.some(r => r.country === k)),
  };
  const shipLabel = (k: string) => (k === NONE ? T.notStated : k === OUTSIDE ? T.outsideUnnamed : k);

  return {
    T,
    cols,
    money,
    wholeMoney,
    int,
    cm,
    dims,
    tabs,
    variants,
    variantDefs,
    sorts,
    sortKeys,
    better,
    shops: byCount(R.rows.map(r => r.shop)),
    ships,
    shipLabel,
    /** Every listing's value for each range filter, for a scale that stays put as other filters change */
    scales: {
      price: R.rows.map(r => r.price).filter(v => v !== null),
      newPrice: R.rows.map(r => r.newPrice).filter(v => v !== null),
    },
    /** The first group, whose listings match; the All tab tags the others with their group */
    match: R.groups[0]!.id,
    groupLabels: new Map(R.groups.map(g => [g.id, g.label])),
    /** Each listing's key for React, since one url can be listed twice */
    keys: new Map<Row, number>(R.rows.map((r, i) => [r, i])),
    /** Which filters the page offers: each only when listings differ in what it filters */
    has: {
      shop: new Set(R.rows.map(r => r.shop)).size > 1,
      cond: R.conditionOrder.length > 1,
      size: R.sizeOrder.length > 1,
      price: distinct(R.rows.map(r => r.price)) > 1,
      newPrice: distinct(R.rows.map(r => r.newPrice)) > 1,
      diff: R.rows.some(r => r.price !== null && r.newPrice !== null),
      ships: keys.length > 1,
      risk: R.rows.some(r => r.risk),
      dup: R.rows.some(r => r.dup),
    },
  };
}

export type Setup = ReturnType<typeof setup>;
