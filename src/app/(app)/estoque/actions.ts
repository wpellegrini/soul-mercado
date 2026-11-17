"use server";

import { revalidatePath } from "next/cache";
import { requireStock } from "@/lib/auth";
import { dbError, int, qty, text, type FormState } from "@/lib/form";
import { formatQty, type Unit } from "@/lib/types";

type EntryLine = { product_id: number; quantity: number; unit_cost: number | null; new_price: number | null };

/** Entrada de mercadoria (nota do fornecedor): várias linhas de uma vez. */
export async function receiveGoods(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireStock();
  let lines: EntryLine[];
  try {
    lines = JSON.parse(text(formData, "lines"));
  } catch {
    return { error: "Lista de itens inválida." };
  }
  if (!Array.isArray(lines) || !lines.length) return { error: "Adicione pelo menos um produto." };
  if (lines.some((l) => !Number.isInteger(l.product_id) || !(l.quantity > 0))) return { error: "Confira as quantidades." };
  if (lines.some((l) => (l.unit_cost !== null && !(l.unit_cost >= 0)) || (l.new_price !== null && !(l.new_price >= 0))))
    return { error: "Confira os valores de custo e preço." };

  const supplier = text(formData, "supplier");
  const invoice = text(formData, "invoice");
  const reason = [supplier, invoice && `NF ${invoice}`].filter(Boolean).join(" · ") || "Entrada de mercadoria";

  // Uma única inserção: ou entram todas as linhas, ou nenhuma
  const { error } = await supabase.from("stock_movements").insert(
    lines.map((l) => ({
      product_id: l.product_id,
      kind: "entrada",
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      reason,
    })),
  );
  if (error) return { error: dbError(error) };

  const priceErrors: string[] = [];
  for (const l of lines.filter((x) => x.new_price !== null)) {
    const { error: e } = await supabase.from("products").update({ price: l.new_price }).eq("id", l.product_id);
    if (e) priceErrors.push(dbError(e));
  }
  revalidatePath("/", "layout");
  if (priceErrors.length) return { error: `Estoque lançado, mas ${priceErrors.length} preço(s) não foram atualizados: ${priceErrors[0]}` };
  return { ok: `Entrada lançada: ${lines.length} ${lines.length === 1 ? "produto" : "produtos"}.` };
}

/** Perda, entrada avulsa ou contagem (inventário) de um produto. */
export async function adjustStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireStock();
  const productId = int(formData, "product_id");
  const kind = text(formData, "kind");
  const quantity = qty(formData, "quantity");
  const reason = text(formData, "reason");
  if (!(productId > 0)) return { error: "Escolha o produto." };

  const { data: product } = await supabase.from("products").select("name, unit").eq("id", productId).single<{ name: string; unit: Unit }>();
  if (!product) return { error: "Produto não encontrado." };
  if (product.unit === "un" && !Number.isInteger(quantity)) return { error: `${product.name} é controlado por unidade: use número inteiro.` };

  if (kind === "contagem") {
    if (!(quantity >= 0)) return { error: "Informe a quantidade contada." };
    const { data: diff, error } = await supabase.rpc("count_stock", {
      p_product_id: productId,
      p_counted: quantity,
      p_reason: reason || "Inventário",
    });
    if (error) return { error: dbError(error) };
    revalidatePath("/", "layout");
    const d = Number(diff);
    return {
      ok:
        d === 0
          ? `${product.name}: estoque conferido, sem diferença.`
          : `${product.name}: ajustado em ${d > 0 ? "+" : ""}${formatQty(d, product.unit)} (agora ${formatQty(quantity, product.unit)}).`,
    };
  }

  if (!(quantity > 0)) return { error: "Informe a quantidade." };
  if (kind !== "perda" && kind !== "entrada") return { error: "Escolha o tipo." };
  if (kind === "perda" && reason.length < 3) return { error: "Informe o motivo da perda (vencido, quebrado...)." };
  const { error } = await supabase.from("stock_movements").insert({
    product_id: productId,
    kind,
    quantity: kind === "perda" ? -quantity : quantity,
    reason,
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: `${kind === "perda" ? "Perda" : "Entrada"} de ${formatQty(quantity, product.unit)} em ${product.name} registrada.` };
}
