import Link from "next/link";
import { formatMoney, formatPct, formatQty, PAYMENT_LABEL, PAYMENT_METHODS, type SalesReport } from "@/lib/types";

export function Kpi({ label, value, hint, href, tone }: { label: string; value: string | number; hint?: string; href?: string; tone?: "warn" | "danger" }) {
  const color = tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-stone-900";
  const body = (
    <>
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-stone-400">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition hover:border-stone-300">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

/** Barras verticais simples (sem biblioteca), com o valor em texto para leitores de tela. */
export function Bars({ data, empty }: { data: { label: string; value: number; title: string }[]; empty: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (!max) return <p className="py-8 text-center text-sm text-stone-500">{empty}</p>;
  return (
    <div className="flex h-44 items-end gap-1" role="list">
      {data.map((d) => (
        <div key={d.label} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={d.title}>
          <div className="w-full rounded-t bg-brand-600" style={{ height: `${Math.max(d.value ? 2 : 0, (d.value / max) * 100)}%` }} />
          <span className="text-[10px] text-stone-500">{d.label}</span>
          <span className="sr-only">{d.title}</span>
        </div>
      ))}
    </div>
  );
}

export function PaymentBreakdown({ report }: { report: SalesReport }) {
  const total = PAYMENT_METHODS.reduce((s, m) => s + Number(report.by_method[m] ?? 0), 0);
  return (
    <ul className="space-y-2 text-sm">
      {PAYMENT_METHODS.map((m) => {
        const v = Number(report.by_method[m] ?? 0);
        const pct = total ? (v / total) * 100 : 0;
        return (
          <li key={m}>
            <div className="flex justify-between">
              <span className="text-stone-600">{PAYMENT_LABEL[m]}</span>
              <span className="font-medium">
                {formatMoney(v)} <span className="text-xs text-stone-400">{formatPct(pct)}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-stone-100">
              <div className="h-1.5 rounded bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TopProducts({ report, limit = 10 }: { report: SalesReport; limit?: number }) {
  const rows = report.top_products.slice(0, limit);
  if (!rows.length) return <p className="px-4 py-6 text-sm text-stone-500">Nenhuma venda no período.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-stone-500">
        <tr>
          <th className="px-4 py-2 font-medium">Produto</th>
          <th className="px-4 py-2 text-right font-medium">Qtd.</th>
          <th className="px-4 py-2 text-right font-medium">Vendido</th>
          <th className="px-4 py-2 text-right font-medium">Lucro bruto</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {rows.map((p) => {
          const profit = Number(p.revenue) - Number(p.cost);
          return (
            <tr key={p.product_id}>
              <td className="px-4 py-2">
                <Link href={`/produtos/${p.product_id}`} className="hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-right">{formatQty(p.quantity, p.unit)}</td>
              <td className="px-4 py-2 text-right font-medium">{formatMoney(p.revenue)}</td>
              <td className="px-4 py-2 text-right text-stone-600">
                {formatMoney(profit)}
                {Number(p.revenue) > 0 && <span className="ml-1 text-xs text-stone-400">{formatPct((profit / Number(p.revenue)) * 100)}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const EMPTY_REPORT: SalesReport = {
  sales_count: 0,
  gross: 0,
  discount: 0,
  revenue: 0,
  cost: 0,
  items: 0,
  cancelled: 0,
  by_method: {},
  by_day: [],
  by_hour: [],
  by_category: [],
  top_products: [],
};
