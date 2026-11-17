import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings, requireSeller } from "@/lib/auth";
import { formatDateTime, formatMoney, formatQty, PAYMENT_LABEL, type PaymentMethod, type Profile, type Sale, type SaleItem } from "@/lib/types";
import AutoPrint from "./auto-print";

export const metadata: Metadata = { title: "Cupom" };

type Detail = Sale & {
  items: SaleItem[];
  payments: { method: PaymentMethod; amount: number }[];
  customer: { name: string } | null;
};

/** Cupom para impressora térmica de 80 mm (comprovante não fiscal). */
export default async function ReceiptPage({ params, searchParams }: PageProps<"/cupom/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await requireSeller();
  const settings = await getSettings();
  const { data: sale } = await supabase
    .from("sales")
    .select("*, items:sale_items(*), payments:sale_payments(method, amount), customer:customers(name)")
    .eq("id", Number(id))
    .maybeSingle<Detail>();
  if (!sale) notFound();
  const { data: seller } = await supabase.from("profiles").select("full_name, email").eq("id", sale.seller_id).maybeSingle<Pick<Profile, "full_name" | "email">>();

  return (
    <main className="mx-auto w-[302px] bg-white p-3 font-mono text-[12px] leading-snug text-black print:w-auto print:p-0">
      {sp.imprimir === "1" && <AutoPrint />}
      <div className="text-center">
        <div className="text-[14px] font-bold">{settings.store_name}</div>
        {settings.document && <div>CNPJ {settings.document}</div>}
        {settings.address && <div>{settings.address}</div>}
        {settings.phone && <div>Tel. {settings.phone}</div>}
      </div>
      <Hr />
      <div className="text-center font-bold">COMPROVANTE DE VENDA Nº {sale.id}</div>
      <div className="text-center">{formatDateTime(sale.created_at)}</div>
      {sale.status === "cancelada" && <div className="mt-1 text-center font-bold">*** VENDA CANCELADA ***</div>}
      <Hr />
      {sale.items.map((i) => (
        <div key={i.id} className="mb-1">
          <div>{i.name}</div>
          <div className="flex justify-between">
            <span>
              {formatQty(i.quantity, i.unit)} x {formatMoney(i.unit_price)}
            </span>
            <span>{formatMoney(i.total)}</span>
          </div>
        </div>
      ))}
      <Hr />
      <Line label="Subtotal" value={formatMoney(sale.subtotal)} />
      {Number(sale.discount) > 0 && <Line label="Desconto" value={`-${formatMoney(sale.discount)}`} />}
      <Line label="TOTAL" value={formatMoney(sale.total)} bold />
      {sale.payments.map((p, i) => (
        <Line key={i} label={PAYMENT_LABEL[p.method]} value={formatMoney(p.amount)} />
      ))}
      {Number(sale.change_amount) > 0 && <Line label="Troco" value={formatMoney(sale.change_amount)} />}
      {sale.customer && <div className="mt-1">Cliente: {sale.customer.name}</div>}
      <Hr />
      <div>Operador: {seller?.full_name || seller?.email}</div>
      <div className="mt-2 text-center">{settings.receipt_footer}</div>
      <div className="mt-2 text-center text-[10px]">Documento sem valor fiscal</div>
      <div className="mt-4 flex justify-center gap-2 font-sans print:hidden">
        <PrintButton />
      </div>
    </main>
  );
}

function Hr() {
  return <div className="my-1.5 border-t border-dashed border-black" />;
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-[14px] font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PrintButton() {
  return <AutoPrint button />;
}
