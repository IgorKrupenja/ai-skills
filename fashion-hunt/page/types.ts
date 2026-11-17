/**
 * What scripts/report.ts hands the report page: the run's listings, ready to show, and the page's
 * own text. report.ts builds it from a run file, and the page only reads it.
 */

export type Lang = "en" | "ru";

/** A bag's measurements in cm, longest side first, since sellers swap width and height */
export type Dims = { w: number; h: number | null; d: number | null };

export type Row = {
  url: string;
  shop: string;
  item: string;
  /** The condition as the scale's name in the page's language */
  condition: string;
  /** The shop's own condition label, shown on hover */
  shopCondition: string;
  /** The condition's key on the scale, which the filter and sorting use */
  cond: string;
  /** The size as listed */
  size: string;
  /** The size filter's buckets: letter or number sizes, or a bag's named size, "other" or "none" */
  sizes: string[];
  /** A bag's measurements, read from its size */
  dims: Dims | null;
  price: number | null;
  priceNote: string;
  ships: string;
  nonEU: boolean;
  newPrice: number | null;
  newUrl: string;
  newNote: string;
  risk: string;
  change: string;
  note: string;
  variant: string;
  /** A photo published next to the page, or a data URI */
  image: string;
  /** The other listings with the same photo */
  same: { url: string; shop: string; price: number | null }[];
  /** The same number on listings that share a photo, 0 for none */
  dup: number;
  group: string;
};

export type Group = { id: string; label: string; hint?: string };

export type Report = {
  lang: Lang;
  title: string;
  eyebrow: string;
  /** HTML */
  lede: string;
  /** HTML */
  hero: string;
  /** The variant cards' order, swatches (inline SVG) and hints */
  variants: { name: string; swatch: string; hint: string }[];
  newLabel: string;
  /** Summary boxes, with HTML */
  facts: { title: string; html: string }[];
  groups: Group[];
  /** With HTML */
  notes: { title?: string; html: string }[];
  /** Listings found but not checked, with a hint in HTML */
  unverified: { title?: string; hint?: string; items: { url: string; label?: string }[] } | null;
  rows: Row[];
  /** How the size filter works: by the buckets in sizeOrder, or by a bag's width */
  sizeMode: "buckets" | "width";
  sizeOrder: string[];
  /** Names for buckets that need one, such as a bag's named sizes with their widths */
  sizeLabels: Record<string, string>;
  conditionOrder: string[];
  conditionNames: Record<string, string>;
};
