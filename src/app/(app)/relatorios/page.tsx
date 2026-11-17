import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { addDays, formatDate, formatMoney, formatPct, type SalesReport } from "@/lib/types";
import { Bars, EMPTY_REPORT, Kpi, PaymentBreakdown, TopProducts } from "@/components/report-blocks";
import PrintButton from "@/components/print-button";
import { presets, readPeriod } from "./period";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const { from, to } = readPeriod(sp);
  const { data, error } = await supabase.rpc("sales_report", { p_from: from, p_to: to });
  const r = (data as SalesReport | null) ?? EMPTY_REPORT;

  const revenue = Number(r.revenue);
  const profit = revenue - Number(r.cost);
  const byDay = new Map(r.by_day.map((d) => [d.day, d]));
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
  const qs = `de=${from}&ate=${to}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Relatórios</h1>
          <p className="text-sm text-stone-500">
            {formatDate(from)} a {formatDate(to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={`/relatorios/csv?${qs}&tipo=produtos`} className="btn-secondary">
            ⬇ Produtos (CSV)
          </a>
          <a href={`/relatorios/csv?${qs}&tipo=dias`} className="btn-secondary">
            ⬇ Por dia (CSV)
          </a>
          <PrintButton />
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-3 print:hidden">
        <div>
          <label htmlFor="de" className="label">
            De
          </label>
          <input id="de" name="de" type="date" defaultValue={from} className="input" />
        </div>
        <div>
          <label htmlFor="ate" className="label">
            Até
          </label>
          <input id="ate" name="ate" type="date" defaultValue={to} className="input" />
        </div>
        <button className="btn-secondary">Ver</button>
        <div className="flex flex-wrap gap-1">
          {presets().map((p) => (
            <Link
              key={p.label}
              href={`/relatorios?de=${p.from}&ate=${p.to}`}
              className={`rounded-full px-3 py-1 text-sm ${p.from === from && p.to === to ? "bg-brand text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </form>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Faturamento" value={formatMoney(revenue)} />
        <Kpi label="Vendas" value={r.sales_count} hint={r.cancelled ? `${r.cancelled} cancelada(s)` : undefined} />
        <Kpi label="Ticket médio" value={formatMoney(r.sales_count ? revenue / r.sales_count : 0)} />
        <Kpi label="Custo da mercadoria" value={formatMoney(r.cost)} />
        <Kpi label="Lucro bruto" value={formatMoney(profit)} hint={revenue ? `margem ${formatPct((profit / revenue) * 100)}` : undefined} />
        <Kpi label="Descontos" value={formatMoney(r.discount)} />
      </div>

      <section className="card p-4">
        <h2 className="mb-4 text-sm font-semibold text-stone-900">Faturamento por dia</h2>
        <Bars
          empty="Nenhuma venda no período."
          data={days.map((d) => {
            const v = Number(byDay.get(d)?.revenue ?? 0);
            return { label: days.length > 16 ? d.slice(8, 10) : `${d.slice(8, 10)}/${d.slice(5, 7)}`, value: v, title: `${formatDate(d)}: ${formatMoney(v)}` };
          })}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-4 text-sm font-semibold text-stone-900">Formas de pagamento</h2>
          <PaymentBreakdown report={r} />
          <p className="mt-3 text-xs text-stone-500">Dinheiro já descontado o troco.</p>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Por seção</h2>
          {r.by_category.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-500">Nenhuma venda no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Seção</th>
                  <th className="px-4 py-2 text-right font-medium">Vendido</th>
                  <th className="px-4 py-2 text-right font-medium">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {r.by_category.map((c) => {
                  const rev = Number(c.revenue);
                  return (
                    <tr key={c.category}>
                      <td className="px-4 py-2">{c.category}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatMoney(rev)}</td>
                      <td className="px-4 py-2 text-right text-stone-600">{rev ? formatPct(((rev - Number(c.cost)) / rev) * 100) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Produtos mais vendidos</h2>
        <TopProducts report={r} limit={50} />
      </section>
      <p className="text-xs text-stone-500">
        A margem usa o custo cadastrado no momento de cada venda. Descontos dados no total da venda não são rateados por produto.
      </p>
    </div>
  );
}
