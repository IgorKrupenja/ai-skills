/** The report page's own words, in its two languages. */

import type { Below } from "./filters.ts";
import type { Lang, ShopState } from "./types.ts";

/** Russian plurals: one, few or many, by the number */
export const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

const en = {
  listed: (n: number) => `${n} listed`, from: "from", median: "median", euSellers: "EU sellers", variants: "Variants",
  allTab: "All", allHint: "Every listing at once; near matches are tagged with how they differ.",
  shown: (n: number, m: number) => `showing ${n} of ${m}`, risk: "authenticity risk",
  samePhoto: (n: number) => `Same photo as ${n === 1 ? "another listing" : `${n} other listings`} (likely the same item)`,
  noSize: "not stated", noPrice: "price unknown",
  cols: ["Shop", "Item", "Condition", "Size", "Price", "New", "Difference", "Ships from", "Notes"],
  empty: "Nothing matches these filters. Clear some, or switch tabs.", unverified: "Not checked yet",
  filters: "Filters", tabs: "Group", summary: "Summary", notes: "Notes", locale: "en-IE",
  sortBy: "Sort",
  sortDirs: {
    money: ["cheapest first", "priciest first"], diff: ["furthest below new first", "furthest above new first"],
    cond: ["best first", "worst first"], text: ["A to Z", "Z to A"], size: ["smallest first", "largest first"],
  },
  // The filter pills and what they open
  shop: "Shop", cond: "Condition", size: "Size", more: "More", clearAll: "Clear all",
  show: (n: number) => `Show ${n} ${n === 1 ? "listing" : "listings"}`,
  search: "Search", cm: "cm", euOnly: "EU only",
  inEU: "EU", outsideEU: "Outside the EU", notStated: "Not stated", outsideUnnamed: "Outside the EU, country not named",
  range: (lo: string | null, hi: string | null) => (lo && hi ? `${lo} to ${hi}` : lo ? `from ${lo}` : `up to ${hi}`),
  lower: "From", upper: "To",
  inRange: (n: number) => `${n} ${n === 1 ? "listing" : "listings"} in this range`,
  orBetter: (name: string) => `${name} or better`,
  below: { any: "Any price", below: "Below the new price", "20": "20% or more below new", "40": "40% or more below new" } as Record<Below, string>,
  belowPill: { any: "", below: "Below new", "20": "20%+ below new", "40": "40%+ below new" } as Record<Below, string>,
  belowHint: "Listings with no new price to compare stay in.",
  hideRisk: "Hide authenticity risks",
  riskTip: "Listings flagged as a risk, with the reason next to ⚠ in their notes.",
  hideRepeats: "Hide repeats",
  repeatTip: "Listings with the same photo are most likely one item listed more than once: this shows only the cheapest, and its notes link the others.",
  // While the search is going
  progress: "Search progress",
  shopsDone: (done: number, total: number) => `${done} of ${total} shops searched`,
  progressHint: "Listings show up below as each shop is checked: reload for the latest. New prices and notes come once every shop is in.",
  updated: (time: string) => `Updated ${time}`,
  shopState: (state: ShopState, n: number, note: string) =>
    state === "searching" ? "searching…"
    : state === "checking" ? `${n} found, checking more…`
    : state === "done" ? (n ? `${n} found` : "nothing found")
    : state === "blocked" ? (note ? `blocked: ${note}` : "blocked")
    : state === "skipped" ? note || "skipped"
    : note || "nothing new",
  brandState: (done: boolean): string => (done ? "new prices in" : "looking up new prices…"),
  nothingAt: (shops: string) => `Nothing new at ${shops}.`,
  skippedShops: (shops: string) => `Skipped: ${shops}.`,
  waiting: "The first listings appear here as soon as a shop is checked.",
};

export type Text = typeof en;

const ru: Text = {
  listed: n => `${n} ${plural(n, "объявление", "объявления", "объявлений")}`, from: "от", median: "медиана", euSellers: "из ЕС", variants: "Варианты",
  allTab: "Все", allHint: "Все объявления сразу; у близких вариантов отмечено, чем они не подходят.",
  shown: (n, m) => `показано ${n} из ${m}`, risk: "риск подделки",
  samePhoto: n => `То же фото у ${n === 1 ? "ещё одного объявления" : `${n} ${plural(n, "другого объявления", "других объявлений", "других объявлений")}`} (вероятно, та же вещь)`,
  noSize: "не указан", noPrice: "цена неизвестна",
  cols: ["Магазин", "Модель и цвет", "Состояние", "Размер", "Цена", "Новая у бренда", "Разница", "Откуда", "Заметки"],
  empty: "Под эти фильтры ничего нет. Снимите часть фильтров или переключите вкладку.", unverified: "Ещё не проверены",
  filters: "Фильтры", tabs: "Группа", summary: "Главное", notes: "Примечания", locale: "ru-RU",
  sortBy: "Сортировка",
  sortDirs: {
    money: ["сначала дешёвые", "сначала дорогие"], diff: ["сначала дешевле нового", "сначала дороже нового"],
    cond: ["сначала лучшие", "сначала худшие"], text: ["от А до Я", "от Я до А"], size: ["сначала маленькие", "сначала большие"],
  },
  shop: "Магазин", cond: "Состояние", size: "Размер", more: "Ещё", clearAll: "Сбросить все",
  show: n => `Показать ${n} ${plural(n, "объявление", "объявления", "объявлений")}`,
  search: "Поиск", cm: "см", euOnly: "Только из ЕС",
  inEU: "ЕС", outsideEU: "Вне ЕС", notStated: "Не указано", outsideUnnamed: "Вне ЕС, страна не указана",
  range: (lo, hi) => (lo && hi ? `от ${lo} до ${hi}` : lo ? `от ${lo}` : `до ${hi}`),
  lower: "От", upper: "До",
  inRange: n => `${n} ${plural(n, "объявление", "объявления", "объявлений")} в этом диапазоне`,
  orBetter: name => `${name} и лучше`,
  below: { any: "Любая цена", below: "Дешевле нового", "20": "На 20% и больше дешевле нового", "40": "На 40% и больше дешевле нового" },
  belowPill: { any: "", below: "Дешевле нового", "20": "От 20% дешевле нового", "40": "От 40% дешевле нового" },
  belowHint: "Объявления без цены нового для сравнения остаются.",
  hideRisk: "Скрыть с риском подделки",
  riskTip: "Объявления с риском подделки, причина указана рядом с ⚠ в заметках.",
  hideRepeats: "Скрыть повторы",
  repeatTip: "Объявления с одинаковым фото, скорее всего, одна и та же вещь: остаётся самое дешёвое, а в его заметках ссылки на остальные.",
  progress: "Ход поиска",
  shopsDone: (done, total) => `Проверено ${done} из ${total} ${plural(total, "магазина", "магазинов", "магазинов")}`,
  progressHint: "Объявления появляются ниже по мере проверки магазинов: обновите страницу, чтобы увидеть новые. Цены нового и примечания появятся, когда проверят все магазины.",
  updated: time => `Обновлено в ${time}`,
  shopState: (state, n, note) =>
    state === "searching" ? "ищем…"
    : state === "checking" ? `${n} найдено, проверяем ещё…`
    : state === "done" ? (n ? `${n} ${plural(n, "объявление", "объявления", "объявлений")}` : "ничего не найдено")
    : state === "blocked" ? (note ? `заблокировал: ${note}` : "заблокировал поиск")
    : state === "skipped" ? note || "пропущен"
    : note || "ничего нового",
  brandState: done => (done ? "цены нового получены" : "узнаём цены нового…"),
  nothingAt: shops => `Ничего нового: ${shops}.`,
  skippedShops: shops => `Пропущены: ${shops}.`,
  waiting: "Первые объявления появятся здесь, как только проверят первый магазин.",
};

export const TEXT: Record<Lang, Text> = { en, ru };
