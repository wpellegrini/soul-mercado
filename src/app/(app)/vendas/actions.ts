"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { dbError, int, text, type FormState } from "@/lib/form";

export async function cancelSale(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const reason = text(formData, "reason");
  if (reason.length < 3) return { error: "Informe o motivo do cancelamento." };
  const { error } = await supabase.rpc("cancel_sale", { p_sale_id: int(formData, "id"), p_reason: reason });
  if (error) return { error: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: "Venda cancelada. Os produtos voltaram ao estoque." };
}
