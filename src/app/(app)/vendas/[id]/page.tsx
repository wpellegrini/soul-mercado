import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { formatDateTime, formatMoney, formatQty, PAYMENT_LABEL, type PaymentMethod, type Profile, type Sale, type SaleItem } from "@/lib/types";
import ActionForm from "@/components/action-form";
import { cancelSale } from "../actions";

export const metadata: Metadata = { title: "Venda" };

type Detail = Sale & {
  items: SaleItem[];
  payments: { method: PaymentMethod; amount: number }[];
  customer: { id: number; name: string } | null;
};

export default async function SalePage({ params }: PageProps<"/vendas/[id]">) {
  const { id } = await params;
  const { supabase, profile } = await requireSeller();
  const { data: sale } = await supabase
    .from("sales")
    .select("*, items:sale_items(*), payments:sale_payments(method, amount), customer:customers(id, name)")
    .eq("id", Number(id))
    .maybeSingle<Detail>();
  if (!sale) notFound();

  const ids = [sale.seller_id, sale.cancelled_by].filter(Boolean) as string[];
  const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", ids).returns<Pick<Profile, "id" | "full_name" | "email">[]>();
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const cancelled = sale.status === "cancelada";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/vendas" className="text-sm text-stone-500 hover:text-stone-900">
        ← Vendas
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Venda nº {sale.id}
            {cancelled && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 align-middle text-xs font-medium text-red-700">cancelada</span>}
          </h1>
          <p className="text-sm text-stone-500">
            {formatDateTime(sale.created_at)} · {nameOf.get(sale.seller_id)} · caixa nº {sale.session_id}
            {sale.customer && (
              <>
                {" "}
                · cliente{" "}
                <Link href={`/clientes/${sale.customer.id}`} className="underline">
                  {sale.customer.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href={`/cupom/${sale.id}?imprimir=1`} target="_blank" className="btn-secondary">
          Imprimir cupom
        </Link>
      </div>

      {cancelled && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          Cancelada em {formatDateTime(sale.cancelled_at)} por {nameOf.get(sale.cancelled_by ?? "") ?? "—"}: {sale.cancel_reason}
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Produto</th>
              <th className="px-4 py-2 text-right font-medium">Qtd.</th>
              <th className="px-4 py-2 text-right font-medium">Preço</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {sale.items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2">
                  <Link href={`/produtos/${i.product_id}`} className="hover:underline">
                    {i.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right">{formatQty(i.quantity, i.unit)}</td>
                <td className="px-4 py-2 text-right">{formatMoney(i.unit_price)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatMoney(i.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-stone-200 text-sm">
            <Tot label="Subtotal" value={sale.subtotal} />
            {Number(sale.discount) > 0 && <Tot label="Desconto" value={-Number(sale.discount)} />}
            <Tot label="Total" value={sale.total} strong />
            {sale.payments.map((p, i) => (
              <Tot key={i} label={PAYMENT_LABEL[p.method]} value={p.amount} />
            ))}
            {Number(sale.change_amount) > 0 && <Tot label="Troco" value={sale.change_amount} />}
          </tfoot>
        </table>
      </div>

      {profile.role === "admin" && !cancelled && (
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-stone-900">Cancelar venda</h2>
          <p className="mb-3 text-xs text-stone-500">
            Os produtos voltam ao estoque e a venda sai dos relatórios e do fiado. Devolva o dinheiro ao cliente pela mesma forma de pagamento.
          </p>
          <ActionForm action={cancelSale} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={sale.id} />
            <label htmlFor="reason" className="sr-only">
              Motivo
            </label>
            <input id="reason" name="reason" className="input max-w-sm flex-1" placeholder="Motivo (ex.: cliente desistiu)" required />
            <button className="btn-danger">Cancelar venda</button>
          </ActionForm>
        </section>
      )}
    </div>
  );
}

function Tot({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold" : "text-stone-600"}>
      <td colSpan={3} className="px-4 py-1.5 text-right">
        {label}
      </td>
      <td className="px-4 py-1.5 text-right">{formatMoney(value)}</td>
    </tr>
  );
}
