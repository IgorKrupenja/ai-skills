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
  /** Where it ships from, as the run gives it, with a country named in the page's language */
  ships: string;
  /** Just the country it ships from, in the page's language, or "" when the listing names none */
  country: string;
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

/** Where a shop's search stands while the run is still going */
export type ShopState = "searching" | "checking" | "done" | "nothing" | "blocked" | "skipped";

/** The search's progress, while its agents are still at work: the page shows it above the listings */
export type Progress = {
  shops: { name: string; state: ShopState; count: number; note: string }[];
  /** The brands whose new prices are being looked up, and whether they're in */
  brands: { name: string; done: boolean }[];
  /** The shops whose search has ended, and all the shops searched (skipped ones left out) */
  done: number;
  total: number;
  /** When the page was built, such as "20:41" */
  updated: string;
};

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
  /** Whether the listings are bags, sized by their measurements: named sizes or ranges of widths, sorted by width */
  bags: boolean;
  /** The size filter's buckets in order */
  sizeOrder: string[];
  /** Names for buckets that need one, such as a bag's named sizes with their widths */
  sizeLabels: Record<string, string>;
  conditionOrder: string[];
  conditionNames: Record<string, string>;
  /** Set while the search is still going, so the page shows how far it's got */
  progress: Progress | null;
};
