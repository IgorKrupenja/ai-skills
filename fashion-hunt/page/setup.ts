/** What the report page works out from the report once: its words, formats, tabs, shops, variants and sortable columns. */

import { ALL, notCheaper, sortsFor, type SortKey } from "./filters.ts";
import { TEXT } from "./text.ts";
import type { Group, Report, Row } from "./types.ts";

export function setup(R: Report) {
  const T = TEXT[R.lang] ?? TEXT.en;
  const cols = [...T.cols];
  if (R.newLabel) cols[5] = R.newLabel;
  const money = new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

  // Shops by how many listings each has
  const shopCounts = new Map<string, number>();
  for (const r of R.rows) shopCounts.set(r.shop, (shopCounts.get(r.shop) ?? 0) + 1);
  const shops = [...shopCounts.keys()].sort((a, b) => shopCounts.get(b)! - shopCounts.get(a)!);

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

  return {
    T,
    cols,
    money,
    shops,
    tabs,
    variants,
    variantDefs,
    sorts,
    sortKeys,
    /** The first group, whose listings match; the All tab tags the others with their group */
    match: R.groups[0]!.id,
    groupLabels: new Map(R.groups.map(g => [g.id, g.label])),
    /** Each listing's key for React, since one url can be listed twice */
    keys: new Map<Row, number>(R.rows.map((r, i) => [r, i])),
    /** Which switches the bar needs: each only when some listing has what it hides */
    has: {
      risk: R.rows.some(r => r.risk),
      nonEU: R.rows.some(r => r.nonEU),
      notCheaper: R.rows.some(notCheaper),
      dup: R.rows.some(r => r.dup),
    },
  };
}

export type Setup = ReturnType<typeof setup>;
