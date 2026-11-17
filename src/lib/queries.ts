import type { DbClient } from "@/lib/supabase/server";
import type { Category, Product } from "@/lib/types";

/**
 * Todos os produtos, em páginas de 1000 (limite padrão da API do Supabase).
 * Um minimercado costuma ter de algumas centenas a poucos milhares de itens.
 */
export async function loadAllProducts(supabase: DbClient, onlyActive = true) {
  const all: Product[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = supabase.from("products").select("*").order("name").range(from, from + page - 1);
    if (onlyActive) q = q.eq("active", true);
    const { data, error } = await q.returns<Product[]>();
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return all;
}

export async function loadCategories(supabase: DbClient) {
  const { data } = await supabase.from("categories").select("*").order("sort").order("name").returns<Category[]>();
  return data ?? [];
}

/** Dívida de fiado por cliente (só caixa e admin). */
export async function loadDebts(supabase: DbClient) {
  const { data } = await supabase.rpc("customer_debts");
  const rows = (data ?? []) as { customer_id: number; debt: number }[];
  return new Map<number, number>(rows.map((d) => [d.customer_id, Number(d.debt)]));
}
