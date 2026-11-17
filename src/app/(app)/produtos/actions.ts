"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStock } from "@/lib/auth";
import { dbError, int, money, qty, text, type FormState } from "@/lib/form";
import { isValidEan } from "@/lib/barcode";

function fields(formData: FormData) {
  const category = int(formData, "category_id");
  return {
    name: text(formData, "name"),
    barcode: text(formData, "barcode").replace(/\D/g, ""),
    plu: text(formData, "plu").replace(/\D/g, ""),
    category_id: Number.isInteger(category) && category > 0 ? category : null,
    unit: text(formData, "unit") === "kg" ? ("kg" as const) : ("un" as const),
    price: money(formData, "price"),
    cost: text(formData, "cost") === "" ? 0 : money(formData, "cost"),
    min_stock: text(formData, "min_stock") === "" ? 0 : qty(formData, "min_stock"),
    image_path: text(formData, "image_path"),
    favorite: formData.get("favorite") === "on",
  };
}

function validate(f: ReturnType<typeof fields>) {
  if (f.name.length < 2) return "Informe o nome do produto.";
  if (f.barcode && f.barcode.length > 14) return "Código de barras com no máximo 14 dígitos.";
  if (f.barcode && f.barcode.length >= 8 && [8, 12, 13, 14].includes(f.barcode.length) && !isValidEan(f.barcode))
    return "Código de barras inválido (dígito verificador não confere). Confira os números.";
  if (f.plu.length > 6) return "Código curto (PLU) com no máximo 6 dígitos.";
  if (!(f.price >= 0)) return "Informe o preço de venda.";
  if (!(f.cost >= 0)) return "Custo inválido.";
  if (!(f.min_stock >= 0)) return "Estoque mínimo inválido.";
  return null;
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireStock();
  const f = fields(formData);
  const invalid = validate(f);
  if (invalid) return { error: invalid };
  const initial = text(formData, "initial_stock") === "" ? 0 : qty(formData, "initial_stock");
  if (!(initial >= 0)) return { error: "Estoque inicial inválido." };
  if (f.unit === "un" && !Number.isInteger(initial)) return { error: "Produto por unidade: estoque inicial inteiro." };

  const { data, error } = await supabase.from("products").insert(f).select("id").single<{ id: number }>();
  if (error) return { error: dbError(error) };

  if (initial > 0) {
    const { error: movErr } = await supabase.from("stock_movements").insert({
      product_id: data.id,
      kind: "ajuste",
      quantity: initial,
      reason: "Estoque inicial",
    });
    if (movErr) return { error: `Produto criado, mas o estoque inicial falhou: ${dbError(movErr)}` };
  }
  revalidatePath("/", "layout");
  redirect(`/produtos/${data.id}?salvo=1`);
}

export async function updateProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireStock();
  const id = int(formData, "id");
  const f = fields(formData);
  const invalid = validate(f);
  if (invalid) return { error: invalid };

  const { data: before } = await supabase.from("products").select("image_path").eq("id", id).single<{ image_path: string }>();
  const { error } = await supabase
    .from("products")
    .update({ ...f, active: formData.get("active") === "on" })
    .eq("id", id);
  if (error) return { error: dbError(error) };

  // Foto trocada ou removida: apaga o arquivo antigo (se falhar, só sobra o arquivo)
  if (before?.image_path && before.image_path !== f.image_path) {
    await supabase.storage.from("produtos").remove([before.image_path]);
  }
  revalidatePath("/", "layout");
  return { ok: "Produto salvo." };
}
