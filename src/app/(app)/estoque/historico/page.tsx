import type { Metadata } from "next";
import Link from "next/link";
import { requireStock } from "@/lib/auth";
import { addDays, dayStart, formatDateTime, formatQty, isISODate, MOVEMENT_LABEL, todayISO, type MovementKind, type Profile, type Unit } from "@/lib/types";

export const metadata: Metadata = { title: "Histórico do estoque" };

type Row = {
  id: number;
  kind: MovementKind;
  quantity: number;
  unit_cost: number | null;
  stock_after: number | null;
  reason: string;
  sale_id: number | null;
  created_by: string | null;
  created_at: string;
  product: { id: number; name: string; unit: Unit } | null;
};

const KINDS: MovementKind[] = ["entrada", "perda", "ajuste", "venda", "cancelamento"];

export default async function StockHistoryPage({ searchParams }: PageProps<"/estoque/historico">) {
  const sp = await searchParams;
  const { supabase } = await requireStock();
  const to = typeof sp.ate === "string" && isISODate(sp.ate) ? sp.ate : todayISO();
  const from = typeof sp.de === "string" && isISODate(sp.de) ? sp.de : addDays(to, -6);
  const kind = typeof sp.tipo === "string" && KINDS.includes(sp.tipo as MovementKind) ? (sp.tipo as MovementKind) : null;

  let q = supabase
    .from("stock_movements")
    .select("*, product:products(id, name, unit)")
    .gte("created_at", dayStart(from))
    .lt("created_at", dayStart(addDays(to, 1)))
    .order("created_at", { ascending: false })
    .limit(500);
  q = kind ? q.eq("kind", kind) : q.neq("kind", "venda"); // vendas: veja em Vendas/Relatórios
  const [{ data }, { data: people }] = await Promise.all([
    q.returns<Row[]>(),
    supabase.from("profiles").select("id, full_name, email").returns<Pick<Profile, "id" | "full_name" | "email">[]>(),
  ]);
  const rows = data ?? [];
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));

  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap items-end gap-3 p-3">
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
        <div>
          <label htmlFor="tipo" className="label">
            Tipo
          </label>
          <select id="tipo" name="tipo" defaultValue={kind ?? ""} className="input">
            <option value="">Tudo, menos vendas</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {MOVEMENT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">Nenhuma movimentação no período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 font-medium">Produto</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 text-right font-medium">Quantidade</th>
                <th className="px-4 py-2 font-medium">Motivo</th>
                <th className="px-4 py-2 font-medium">Quem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-stone-500">{formatDateTime(m.created_at)}</td>
                  <td className="px-4 py-2">
                    {m.product ? (
                      <Link href={`/produtos/${m.product.id}`} className="hover:underline">
                        {m.product.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">{MOVEMENT_LABEL[m.kind]}</td>
                  <td className={`px-4 py-2 text-right font-medium ${m.quantity < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {m.quantity > 0 ? "+" : ""}
                    {formatQty(m.quantity, m.product?.unit ?? "un")}
                  </td>
                  <td className="px-4 py-2 text-stone-600">
                    {m.sale_id ? (
                      <Link href={`/vendas/${m.sale_id}`} className="text-brand-600 hover:underline">
                        Venda #{m.sale_id}
                      </Link>
                    ) : (
                      m.reason
                    )}
                  </td>
                  <td className="px-4 py-2 text-stone-500">{m.created_by ? nameOf.get(m.created_by) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
