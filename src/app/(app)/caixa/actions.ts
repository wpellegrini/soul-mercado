"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth";
import { dbError, int, money, text, type FormState } from "@/lib/form";
import { formatMoney } from "@/lib/types";

export async function cashMovement(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSeller();
  const kind = text(formData, "kind");
  const amount = money(formData, "amount");
  const reason = text(formData, "reason");
  if (kind !== "sangria" && kind !== "suprimento") return { error: "Escolha sangria ou suprimento." };
  if (!(amount > 0)) return { error: "Informe o valor." };
  const { error } = await supabase
    .from("cash_movements")
    .insert({ session_id: int(formData, "session_id"), kind, amount, reason });
  if (error) return { error: dbError(error) };
  revalidatePath("/caixa", "layout");
  return { ok: `${kind === "sangria" ? "Sangria" : "Suprimento"} de ${formatMoney(amount)} registrado.` };
}

export async function closeCash(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSeller();
  const counted = money(formData, "counted_amount");
  if (!(counted >= 0)) return { error: "Informe o dinheiro contado na gaveta." };
  const { error } = await supabase.rpc("close_cash_session", {
    p_session_id: int(formData, "session_id"),
    p_counted: counted,
    p_notes: text(formData, "notes"),
  });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: "Caixa fechado." };
}
