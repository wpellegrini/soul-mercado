import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canSell, canStock, type Profile, type Role, type Settings } from "@/lib/types";

/** Usuário logado + perfil (sem exigir liberação). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single<Profile>();
  if (!profile) redirect("/login");

  return { supabase, profile };
});

/** Funcionário liberado (qualquer perfil, exceto "pendente"). */
export const requireUser = cache(async () => {
  const ctx = await getSession();
  if (ctx.profile.role === "pendente") redirect("/aguardando");
  return ctx;
});

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  store_name: "Mercado",
  business_kind: "minimercado",
  document: "",
  phone: "",
  address: "",
  receipt_footer: "",
  max_discount_pct: 10,
  scale_prefix: "2",
  scale_code_digits: 4,
  scale_value_kind: "preco",
};

export const getSettings = cache(async () => {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("settings").select("*").single<Settings>();
  return data ?? DEFAULT_SETTINGS;
});

export function homeFor(role: Role) {
  if (role === "admin") return "/painel";
  if (role === "caixa") return "/pdv";
  return "/produtos";
}

export async function requireSeller() {
  const ctx = await requireUser();
  if (!canSell(ctx.profile.role)) redirect(homeFor(ctx.profile.role));
  return ctx;
}

export async function requireStock() {
  const ctx = await requireUser();
  if (!canStock(ctx.profile.role)) redirect(homeFor(ctx.profile.role));
  return ctx;
}

export async function requireAdmin() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") redirect(homeFor(ctx.profile.role));
  return ctx;
}
