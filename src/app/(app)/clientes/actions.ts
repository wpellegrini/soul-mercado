"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { dbError, int, money, text, type FormState } from "@/lib/form";
import { formatMoney } from "@/lib/types";

function fields(formData: FormData) {
  return {
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    document: text(formData, "document"),
    notes: text(formData, "notes"),
  };
}

export async function createCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile } = await requireSeller();
  const f = fields(formData);
  if (f.name.length < 3) return { error: "Informe o nome do cliente." };
  // Só o gerente define o limite do fiado
  const limit = profile.role === "admin" && text(formData, "credit_limit") ? money(formData, "credit_limit") : 0;
  if (!(limit >= 0)) return { error: "Limite inválido." };
  const { data, error } = await supabase.from("customers").insert({ ...f, credit_limit: limit }).select("id").single<{ id: number }>();
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  redirect(`/clientes/${data.id}`);
}

export async function updateCustomer(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, profile } = await requireSeller();
  const f = fields(formData);
  if (f.name.length < 3) return { error: "Informe o nome do cliente." };
  const patch: Record<string, unknown> = { ...f, active: formData.get("active") === "on" };
  if (profile.role === "admin") {
    const limit = text(formData, "credit_limit") ? money(formData, "credit_limit") : 0;
    if (!(limit >= 0)) return { error: "Limite inválido." };
    patch.credit_limit = limit;
  }
  const { error } = await supabase.from("customers").update(patch).eq("id", int(formData, "id"));
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: "Cliente salvo." };
}

export async function receivePayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSeller();
  const amount = money(formData, "amount");
  const method = text(formData, "method");
  if (!(amount > 0)) return { error: "Informe o valor recebido." };
  if (!["dinheiro", "pix", "debito", "credito"].includes(method)) return { error: "Escolha a forma de pagamento." };
  const { error } = await supabase.from("customer_payments").insert({
    customer_id: int(formData, "customer_id"),
    amount,
    method,
    notes: text(formData, "notes"),
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: `Pagamento de ${formatMoney(amount)} recebido.` };
}
