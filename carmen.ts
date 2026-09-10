// «Мозг» Carmen — локальный, детерминированный (без облака и ключей).
// Тот же принцип, что в ⌘K: распознаём намерение → выполняем через слой API →
// возвращаем текстовый ответ и данные интерактивной карточки (meta).
// Позже сюда можно подключить локальную модель (Ollama) как запасной парсер.

import { api, type Summary, type Subscription, type CalItem, type Task } from "./api";
import { parseLocal } from "./parse";

export interface CarmenReply { content: string; meta: CardMeta }
export type CardMeta =
  | { card: "none" }
  | { card: "task"; data: Task }
  | { card: "finance"; data: Summary }
  | { card: "subs"; data: Subscription[] }
  | { card: "calendar"; data: CalItem[] }
  | { card: "search"; data: Task[] }
  | { card: "help" };

const rub = (m: number) => (m / 100).toLocaleString("ru", { maximumFractionDigits: 0 }) + " ₽";
function startOfMonth(): number { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }

export async function respond(text: string): Promise<CarmenReply> {
  const lower = text.toLowerCase();
  const hasDigit = /\d/.test(lower);

  // помощь
  if (/(помощь|help|что ты умеешь|команды|как пользоваться)/.test(lower)) {
    return {
      content:
        "Я могу управлять приложением локально. Примеры:\n" +
        "• «купил кофе 350» — записать расход\n" +
        "• «напомни завтра позвонить Ивану» — создать задачу\n" +
        "• «покажи финансы за месяц» — сводка\n" +
        "• «что с подписками» — статусы и продления\n" +
        "• «что предстоит» — ближайшие события",
      meta: { card: "help" },
    };
  }

  // сводка финансов (вопрос без суммы)
  if (!hasDigit && /(финанс|расход|доход|баланс|бюджет|потрат|трат)/.test(lower) && /(покажи|сколько|за |месяц|неделю|итог|баланс|сводк)/.test(lower)) {
    const s = await api.summary(startOfMonth(), null);
    const top = s.by_category[0];
    return {
      content: `За текущий месяц: доход ${rub(s.income)}, расход ${rub(s.expense)}, баланс ${rub(s.income - s.expense)}.` +
        (top ? ` Больше всего — «${top.category}» (${rub(top.total)}).` : ""),
      meta: { card: "finance", data: s },
    };
  }

  // подписки
  if (/(подписк|что заканчива|что продлева|списан|отменить.*подписк)/.test(lower)) {
    const subs = await api.listSubscriptions();
    const expiring = subs.filter((s) => s.status === "expiring" || s.status === "overdue");
    const monthly = subs.filter((s) => s.status !== "cancelled" && s.status !== "paused" && s.period === "month").reduce((a, s) => a + (s.amount ?? 0), 0);
    return {
      content: `Активных подписок: ${subs.filter((s) => s.status !== "cancelled").length}, в месяц ${rub(monthly)}.` +
        (expiring.length ? ` Требуют внимания: ${expiring.map((s) => s.title).join(", ")}.` : " Всё под контролем."),
      meta: { card: "subs", data: subs },
    };
  }

  // календарь / предстоящее
  if (/(календар|что предстоит|что сегодня|ближайш|предсто|дедлайн|на этой неделе)/.test(lower)) {
    const now = Date.now();
    const items = await api.calendarItems(now - 2 * 86400000, now + 14 * 86400000);
    return {
      content: items.length ? `Ближайшие события: ${items.length}. Смотри карточку ниже.` : "На ближайшие две недели событий нет.",
      meta: { card: "calendar", data: items },
    };
  }

  // команды создания (задача / финансовая операция) — через общий парсер
  const intent = parseLocal(text);
  if (intent.kind === "task") {
    const t = await api.createTask(intent.title, intent.priority, intent.deadline);
    return { content: `Создала задачу «${intent.title}».`, meta: { card: "task", data: t } };
  }
  if (intent.kind === "finance") {
    const t = await api.addTransaction({ direction: intent.direction, amount: Math.round(intent.amount * 100), title: intent.title });
    return {
      content: `Записала ${intent.direction === "income" ? "доход" : "расход"} ${rub(Math.round(intent.amount * 100))} — «${intent.title}».`,
      meta: { card: "none" },
    };
  }

  // иначе — поиск по пространству
  const res = await api.search(intent.kind === "search" ? intent.query : text);
  return {
    content: res.length ? `Нашла ${res.length} совпадений по запросу.` : "Ничего не нашла. Могу создать задачу или записать расход — просто напишите словами.",
    meta: { card: "search", data: res },
  };
}
