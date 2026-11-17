import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadDebts } from "@/lib/queries";
import { addDays, formatDate, formatMoney, formatPct, formatQty, formatTime, todayISO, type CashSession, type Profile, type SalesReport, type Unit } from "@/lib/types";
import { Bars, EMPTY_REPORT, Kpi, PaymentBreakdown, TopProducts } from "@/components/report-blocks";

export const metadata: Metadata = { title: "Painel" };

type Low = { id: number; name: string; unit: Unit; stock: number; min_stock: number; emoji: string | null };

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const today = todayISO();
  const weekStart = addDays(today, -6);

  const [todayRes, weekRes, { data: low }, { data: open }, { data: people }, debts, { count: negative }] = await Promise.all([
    supabase.rpc("sales_report", { p_from: today, p_to: today }),
    supabase.rpc("sales_report", { p_from: weekStart, p_to: today }),
    supabase.from("low_stock").select("id, name, unit, stock, min_stock, emoji").order("stock").limit(8).returns<Low[]>(),
    supabase.from("cash_sessions").select("*").eq("status", "aberto").returns<CashSession[]>(),
    supabase.from("profiles").select("id, full_name, email").returns<Pick<Profile, "id" | "full_name" | "email">[]>(),
    loadDebts(supabase),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true).lt("stock", 0),
  ]);
  const r = (todayRes.data as SalesReport | null) ?? EMPTY_REPORT;
  const week = (weekRes.data as SalesReport | null) ?? EMPTY_REPORT;
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const { count: lowCount } = await supabase.from("low_stock").select("id", { count: "exact", head: true });

  const revenue = Number(r.revenue);
  const profit = revenue - Number(r.cost);
  const ticket = r.sales_count ? revenue / r.sales_count : 0;
  const fiado = [...debts.values()].reduce((s, d) => s + Math.max(0, d), 0);

  const byHour = new Map(r.by_hour.map((h) => [h.hour, h]));
  const hours = Array.from({ length: 17 }, (_, i) => i + 6); // 6h às 22h
  const byDay = new Map(week.by_day.map((d) => [d.day, d]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Painel</h1>
          <p className="text-sm text-stone-500">Hoje, {formatDate(today)}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/relatorios" className="btn-secondary">
            Relatórios
          </Link>
          <Link href="/pdv" className="btn-primary">
            Abrir PDV
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Vendido hoje" value={formatMoney(revenue)} hint={Number(r.discount) > 0 ? `${formatMoney(r.discount)} em descontos` : undefined} />
        <Kpi label="Vendas" value={r.sales_count} hint={r.cancelled ? `${r.cancelled} cancelada(s)` : undefined} href="/vendas" />
        <Kpi label="Ticket médio" value={formatMoney(ticket)} />
        <Kpi label="Lucro bruto" value={formatMoney(profit)} hint={revenue ? `margem ${formatPct((profit / revenue) * 100)}` : undefined} />
        <Kpi label="Semana (7 dias)" value={formatMoney(week.revenue)} hint={`${week.sales_count} vendas`} />
        <Kpi label="Fiado a receber" value={formatMoney(fiado)} href="/clientes?filtro=devendo" tone={fiado > 0 ? "warn" : undefined} />
        <Kpi label="Abaixo do mínimo" value={lowCount ?? 0} href="/estoque/compras" tone={lowCount ? "warn" : undefined} />
        <Kpi label="Estoque negativo" value={negative ?? 0} href="/produtos?filtro=negativo" tone={negative ? "danger" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-stone-900">Vendas por hora (hoje)</h2>
          <Bars
            empty="Nenhuma venda hoje ainda."
            data={hours.map((h) => {
              const v = Number(byHour.get(h)?.revenue ?? 0);
              return { label: `${h}h`, value: v, title: `${h}h: ${formatMoney(v)} em ${byHour.get(h)?.count ?? 0} vendas` };
            })}
          />
        </section>
        <section className="card p-4">
          <h2 className="mb-4 text-sm font-semibold text-stone-900">Formas de pagamento (hoje)</h2>
          <PaymentBreakdown report={r} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Mais vendidos hoje</h2>
          <TopProducts report={r} limit={8} />
        </section>
        <div className="space-y-6">
          <section className="card">
            <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Caixas abertos ({open?.length ?? 0})</h2>
            {!open?.length ? (
              <p className="px-4 py-4 text-sm text-stone-500">Nenhum caixa aberto.</p>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {open.map((s) => (
                  <li key={s.id}>
                    <Link href={`/caixa/${s.id}`} className="flex justify-between px-4 py-2 hover:bg-stone-50">
                      <span>{nameOf.get(s.opened_by)}</span>
                      <span className="text-stone-500">desde {formatTime(s.opened_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="flex justify-between border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">
              Repor estoque
              <Link href="/estoque/compras" className="font-normal text-brand-600 hover:underline">
                lista completa
              </Link>
            </h2>
            {!low?.length ? (
              <p className="px-4 py-4 text-sm text-stone-500">Tudo acima do mínimo.</p>
            ) : (
              <ul className="divide-y divide-stone-100 text-sm">
                {low.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 px-4 py-2">
                    <Link href={`/produtos/${p.id}`} className="truncate hover:underline">
                      {p.emoji} {p.name}
                    </Link>
                    <span className={Number(p.stock) < 0 ? "text-red-700" : "text-amber-700"}>{formatQty(p.stock, p.unit)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="card p-4">
        <h2 className="mb-4 text-sm font-semibold text-stone-900">Últimos 7 dias</h2>
        <Bars
          empty="Nenhuma venda nos últimos 7 dias."
          data={days.map((d) => {
            const v = Number(byDay.get(d)?.revenue ?? 0);
            return { label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, value: v, title: `${formatDate(d)}: ${formatMoney(v)}` };
          })}
        />
      </section>
    </div>
  );
}
