"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { dbError, int, money, text, type FormState } from "@/lib/form";
import { BUSINESS_KINDS, ROLES, type BusinessKind, type Role } from "@/lib/types";

function refresh() {
  revalidatePath("/", "layout");
}

export async function updateRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const role = text(formData, "role") as Role;
  if (!ROLES.includes(role)) return { error: "Perfil inválido." };
  const { error } = await supabase.from("profiles").update({ role }).eq("id", text(formData, "id"));
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: "Perfil atualizado." };
}

function categoryFields(formData: FormData) {
  return { name: text(formData, "name"), emoji: text(formData, "emoji") || "🛒", sort: int(formData, "sort") || 0 };
}

export async function createCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const f = categoryFields(formData);
  if (f.name.length < 2) return { error: "Informe o nome da seção." };
  const { error } = await supabase.from("categories").insert(f);
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: `Seção "${f.name}" criada.` };
}

export async function updateCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const f = categoryFields(formData);
  if (f.name.length < 2) return { error: "Informe o nome da seção." };
  const { error } = await supabase.from("categories").update(f).eq("id", int(formData, "id"));
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: "Seção salva." };
}

export async function deleteCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  // Os produtos da seção ficam "sem seção" (on delete set null)
  const { error } = await supabase.from("categories").delete().eq("id", int(formData, "id"));
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: "Seção apagada." };
}

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const kind = text(formData, "business_kind") as BusinessKind;
  const scaleDigits = int(formData, "scale_code_digits");
  const maxDiscount = money(formData, "max_discount_pct");
  const f = {
    store_name: text(formData, "store_name"),
    business_kind: kind,
    document: text(formData, "document"),
    phone: text(formData, "phone"),
    address: text(formData, "address"),
    receipt_footer: text(formData, "receipt_footer"),
    max_discount_pct: maxDiscount,
    scale_prefix: text(formData, "scale_prefix"),
    scale_code_digits: scaleDigits,
    scale_value_kind: text(formData, "scale_value_kind") === "peso" ? "peso" : "preco",
  };
  if (f.store_name.length < 2) return { error: "Informe o nome da loja." };
  if (!BUSINESS_KINDS.includes(kind)) return { error: "Tipo de negócio inválido." };
  if (!(maxDiscount >= 0 && maxDiscount <= 100)) return { error: "Desconto máximo entre 0 e 100%." };
  if (!/^\d{1,2}$/.test(f.scale_prefix)) return { error: "Prefixo da balança: 1 ou 2 dígitos (normalmente 2)." };
  if (!(scaleDigits >= 4 && scaleDigits <= 6)) return { error: "Código do produto na etiqueta: 4 a 6 dígitos." };
  const { error } = await supabase.from("settings").update(f).eq("id", 1);
  if (error) return { error: dbError(error) };
  refresh();
  return { ok: "Configurações salvas." };
}
