import { addDays, isISODate, todayISO } from "@/lib/types";

/** Período do relatório a partir da URL (?de=&ate=); padrão: mês atual. */
export function readPeriod(sp: Record<string, string | string[] | undefined>) {
  const today = todayISO();
  let to = typeof sp.ate === "string" && isISODate(sp.ate) ? sp.ate : today;
  let from = typeof sp.de === "string" && isISODate(sp.de) ? sp.de : `${today.slice(0, 7)}-01`;
  if (from > to) [from, to] = [to, from];
  // Limite de 1 ano por consulta
  if (from < addDays(to, -366)) from = addDays(to, -366);
  return { from, to };
}

export function presets() {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Hoje", from: today, to: today },
    { label: "Ontem", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "7 dias", from: addDays(today, -6), to: today },
    { label: "Este mês", from: monthStart, to: today },
    { label: "Mês passado", from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
  ];
}
