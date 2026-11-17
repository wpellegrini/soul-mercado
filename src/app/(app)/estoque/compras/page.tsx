import type { Metadata } from "next";
import Link from "next/link";
import { requireStock } from "@/lib/auth";
import { formatMoney, formatQty, type Unit } from "@/lib/types";
import PrintButton from "@/components/print-button";

export const metadata: Metadata = { title: "Lista de compras" };

type Low = { id: number; name: string; barcode: string; unit: Unit; stock: number; min_stock: number; cost: number; category: string | null; emoji: string | null };

export default async function ShoppingListPage() {
  const { supabase } = await requireStock();
  const { data } = await supabase.from("low_stock").select("*").order("category").order("name").returns<Low[]>();
  const items = (data ?? []).map((p) => {
    // Sugestão: repor até o dobro do mínimo
    const raw = Number(p.min_stock) * 2 - Number(p.stock);
    const suggested = p.unit === "un" ? Math.ceil(raw) : Math.round(raw * 1000) / 1000;
    return { ...p, suggested, estimate: suggested * Number(p.cost) };
  });
  const total = items.reduce((s, i) => s + i.estimate, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-stone-500">
          Produtos no estoque mínimo ou abaixo. Sugestão de compra: repor até o dobro do mínimo. Custo estimado:{" "}
          <strong className="text-stone-900">{formatMoney(total)}</strong>.
        </p>
        <PrintButton label="Imprimir lista" />
      </div>
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">Lista de compras</h2>
      </div>
      <div className="card overflow-x-auto">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">Nada para comprar: todos os produtos estão acima do mínimo. 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Produto</th>
                <th className="px-4 py-2 font-medium">Seção</th>
                <th className="px-4 py-2 text-right font-medium">Estoque</th>
                <th className="px-4 py-2 text-right font-medium">Mínimo</th>
                <th className="px-4 py-2 text-right font-medium">Comprar</th>
                <th className="px-4 py-2 text-right font-medium">Custo estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    <Link href={`/produtos/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.barcode && <span className="block font-mono text-xs text-stone-500">{p.barcode}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {p.emoji} {p.category ?? "—"}
                  </td>
                  <td className={`px-4 py-2 text-right ${Number(p.stock) < 0 ? "text-red-700" : "text-amber-700"}`}>{formatQty(p.stock, p.unit)}</td>
                  <td className="px-4 py-2 text-right">{formatQty(p.min_stock, p.unit)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatQty(p.suggested, p.unit)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(p.estimate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
