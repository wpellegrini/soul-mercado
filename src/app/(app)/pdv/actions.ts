"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth";
import { dbError, money, text, type FormState } from "@/lib/form";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";

export async function openCash(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile } = await requireSeller();
  const opening = text(formData, "opening_amount") === "" ? 0 : money(formData, "opening_amount");
  if (!(opening >= 0)) return { error: "Informe o troco inicial (pode ser 0)." };
  const { error } = await supabase.from("cash_sessions").insert({ opening_amount: opening, opened_by: profile.id });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: "Caixa aberto." };
}

export type SaleInput = {
  items: { product_id: number; quantity: number; total?: number }[];
  payments: { method: PaymentMethod; amount: number }[];
  discount: number;
  customerId: number | null;
};

export type SaleResult = { saleId: number; change: number; total: number } | { error: string };

/** Grava a venda numa única transação no banco (finalize_sale): preço, estoque e caixa. */
export async function finalizeSale(input: SaleInput): Promise<SaleResult> {
  const { supabase } = await requireSeller();

  const items = Array.isArray(input?.items) ? input.items : [];
  const payments = Array.isArray(input?.payments) ? input.payments : [];
  if (!items.length) return { error: "A venda não tem itens." };
  if (items.some((i) => !Number.isInteger(i.product_id) || !(i.quantity > 0))) return { error: "Item inválido." };
  if (payments.some((p) => !PAYMENT_METHODS.includes(p.method) || !(p.amount > 0)))
    return { error: "Pagamento inválido." };

  const { data: saleId, error } = await supabase.rpc("finalize_sale", {
    p_items: items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      ...(i.total !== undefined ? { total: i.total } : {}),
    })),
    p_payments: payments,
    p_discount: Number(input.discount) || 0,
    p_customer_id: input.customerId,
  });
  if (error) return { error: dbError(error) };

  const { data: sale } = await supabase
    .from("sales")
    .select("total, change_amount")
    .eq("id", saleId)
    .single<{ total: number; change_amount: number }>();

  revalidatePath("/caixa");
  revalidatePath("/vendas");
  return { saleId: Number(saleId), change: Number(sale?.change_amount ?? 0), total: Number(sale?.total ?? 0) };
}
