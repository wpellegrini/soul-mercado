import type { Metadata } from "next";
import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import {
  addDays,
  dayStart,
  formatDate,
  formatMoney,
  formatTime,
  isISODate,
  PAYMENT_LABEL,
  todayISO,
  type PaymentMethod,
  type Profile,
  type Sale,
} from "@/lib/types";

export const metadata: Metadata = { title: "Vendas" };

type Row = Sale & {
  payments: { method: PaymentMethod; amount: number }[];
  customer: { name: string } | null;
};

export default async function SalesPage({ searchParams }: PageProps<"/vendas">) {
  const sp = await searchParams;
  const { supabase, profile } = await requireSeller();
  const day = typeof sp.dia === "string" && isISODate(sp.dia) ? sp.dia : todayISO();

  const [{ data }, { data: people }] = await Promise.all([
    supabase
      .from("sales")
      .select("*, payments:sale_payments(method, amount), customer:customers(name)")
      .gte("created_at", dayStart(day))
      .lt("created_at", dayStart(addDays(day, 1)))
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<Row[]>(),
    supabase.from("profiles").select("id, full_name, email").returns<Pick<Profile, "id" | "full_name" | "email">[]>(),
  ]);
  const sales = data ?? [];
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const done = sales.filter((s) => s.status === "concluida");
  const total = done.reduce((n, s) => n + Number(s.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Vendas</h1>
          <p className="text-sm text-stone-500">
            {formatDate(day)} · {done.length} {done.length === 1 ? "venda" : "vendas"} · {formatMoney(total)}
            {profile.role !== "admin" && " · somente as suas"}
          </p>
        </div>
        <form className="flex items-end gap-2">
          <Link href={`/vendas?dia=${addDays(day, -1)}`} className="btn-secondary" aria-label="Dia anterior">
            ←
          </Link>
          <div>
            <label htmlFor="dia" className="label">
              Dia
            </label>
            <input id="dia" name="dia" type="date" defaultValue={day} className="input" />
          </div>
          <button className="btn-secondary">Ver</button>
          <Link href={`/vendas?dia=${addDays(day, 1)}`} className="btn-secondary" aria-label="Dia seguinte">
            →
          </Link>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {sales.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">Nenhuma venda neste dia.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nº</th>
                <th className="px-4 py-2 font-medium">Hora</th>
                <th className="px-4 py-2 font-medium">Operador</th>
                <th className="px-4 py-2 font-medium">Pagamento</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sales.map((s) => (
                <tr key={s.id} className={`hover:bg-stone-50 ${s.status === "cancelada" ? "text-stone-400" : ""}`}>
                  <td className="px-4 py-2">
                    <Link href={`/vendas/${s.id}`} className="font-medium text-brand-600 hover:underline">
                      {s.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{formatTime(s.created_at)}</td>
                  <td className="px-4 py-2">{nameOf.get(s.seller_id)}</td>
                  <td className="px-4 py-2">
                    {s.payments.map((p) => PAYMENT_LABEL[p.method]).join(" + ")}
                    {s.customer && <span className="text-stone-500"> · {s.customer.name}</span>}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${s.status === "cancelada" ? "line-through" : ""}`}>{formatMoney(s.total)}</td>
                  <td className="px-4 py-2">
                    {s.status === "cancelada" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">cancelada</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
