/** The report page's own words, in its two languages. */

import type { Lang } from "./types.ts";

/** Russian plurals: one, few or many, by the number */
export const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

const en = {
  listed: (n: number) => `${n} listed`, from: "from", median: "median", euSellers: "EU sellers", variants: "Variants",
  allTab: "All", allHint: "Every listing at once; near matches are tagged with how they differ.",
  size: "Size:", cond: "Condition:", conds: "Condition", shop: "Shop", all: "all", noRisk: "hide", eu: "EU only", cheap: "hide at or above the new price",
  shown: (n: number, m: number) => `showing ${n} of ${m}`, risk: "authenticity risk",
  noRepeat: "hide repeats", repeatTip: "Listings with the same photo are most likely one item listed more than once: this shows only the cheapest, and its notes link the others.",
  samePhoto: (n: number) => `Same photo as ${n === 1 ? "another listing" : `${n} other listings`} (likely the same item)`,
  riskTip: "Hides listings flagged as an authenticity risk. The reason for each shows next to ⚠ in its notes.", noSize: "not stated", noPrice: "price unknown",
  cols: ["Shop", "Item", "Condition", "Size", "Price", "New", "Difference", "Ships from", "Notes"],
  empty: "Nothing matches these filters. Clear the size or switch tabs.", unverified: "Not checked yet",
  filters: "Filters", tabs: "Group", sizes: "Size", summary: "Summary", notes: "Notes", locale: "en-IE",
  sortBy: "Sort",
  sortDirs: {
    money: ["cheapest first", "priciest first"], diff: ["furthest below new first", "furthest above new first"],
    cond: ["best first", "worst first"], text: ["A to Z", "Z to A"], size: ["smallest first", "largest first"],
  },
};

export type Text = typeof en;

const ru: Text = {
  listed: n => `${n} ${plural(n, "объявление", "объявления", "объявлений")}`, from: "от", median: "медиана", euSellers: "из ЕС", variants: "Варианты",
  allTab: "Все", allHint: "Все объявления сразу; у близких вариантов отмечено, чем они не подходят.",
  size: "Размер:", cond: "Состояние:", conds: "Состояние", shop: "Магазин", all: "все", noRisk: "без", eu: "только из ЕС", cheap: "скрыть по цене нового и дороже",
  shown: (n, m) => `показано ${n} из ${m}`, risk: "риск подделки",
  noRepeat: "скрыть повторы", repeatTip: "Объявления с одинаковым фото, скорее всего, одна и та же вещь: остаётся самое дешёвое, а в его заметках ссылки на остальные.",
  samePhoto: n => `То же фото у ${n === 1 ? "ещё одного объявления" : `${n} ${plural(n, "другого объявления", "других объявлений", "других объявлений")}`} (вероятно, та же вещь)`,
  riskTip: "Скрывает объявления с риском подделки. Причина у каждого указана рядом с ⚠ в заметках.", noSize: "не указан", noPrice: "цена неизвестна",
  cols: ["Магазин", "Модель и цвет", "Состояние", "Размер", "Цена", "Новая у бренда", "Разница", "Откуда", "Заметки"],
  empty: "Под эти фильтры ничего нет. Снимите размер или переключите вкладку.", unverified: "Ещё не проверены",
  filters: "Фильтры", tabs: "Группа", sizes: "Размер", summary: "Главное", notes: "Примечания", locale: "ru-RU",
  sortBy: "Сортировка",
  sortDirs: {
    money: ["сначала дешёвые", "сначала дорогие"], diff: ["сначала дешевле нового", "сначала дороже нового"],
    cond: ["сначала лучшие", "сначала худшие"], text: ["от А до Я", "от Я до А"], size: ["сначала маленькие", "сначала большие"],
  },
};

export const TEXT: Record<Lang, Text> = { en, ru };
