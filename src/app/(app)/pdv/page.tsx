import type { Metadata } from "next";
import Link from "next/link";
import { getSettings, requireSeller } from "@/lib/auth";
import { loadAllProducts, loadCategories, loadDebts } from "@/lib/queries";
import { formatTime, type CashSession, type Customer } from "@/lib/types";
import ActionForm from "@/components/action-form";
import { openCash } from "./actions";
import Pdv, { type PdvCustomer, type PdvProduct } from "./pdv";

export const metadata: Metadata = { title: "PDV" };

export default async function PdvPage() {
  const { supabase, profile } = await requireSeller();
  const settings = await getSettings();

  const { data: session } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("opened_by", profile.id)
    .eq("status", "aberto")
    .maybeSingle<CashSession>();

  if (!session) {
    return (
      <div className="mx-auto mt-10 max-w-md">
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-stone-900">Abrir o caixa</h1>
          <p className="mt-1 text-sm text-stone-500">
            Conte o dinheiro que está na gaveta para troco. No fechamento, o sistema mostra quanto deveria haver.
          </p>
          <ActionForm action={openCash} className="mt-5 space-y-4">
            <div>
              <label htmlFor="opening_amount" className="label">
                Troco inicial (R$)
              </label>
              <input
                id="opening_amount"
                name="opening_amount"
                inputMode="decimal"
                placeholder="0,00"
                className="input text-lg"
                autoFocus
              />
            </div>
            <button className="btn-primary w-full py-3 text-base">Abrir caixa e começar a vender</button>
          </ActionForm>
        </div>
      </div>
    );
  }

  const [products, categories, customersRes, debts] = await Promise.all([
    loadAllProducts(supabase),
    loadCategories(supabase),
    supabase.from("customers").select("id, name, credit_limit").eq("active", true).order("name").returns<Customer[]>(),
    loadDebts(supabase),
  ]);

  const emojiOf = new Map(categories.map((c) => [c.id, c.emoji]));
  const pdvProducts: PdvProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    plu: p.plu,
    unit: p.unit,
    price: Number(p.price),
    image_path: p.image_path,
    favorite: p.favorite,
    category_id: p.category_id,
    emoji: (p.category_id && emojiOf.get(p.category_id)) || "🛒",
  }));
  const customers: PdvCustomer[] = (customersRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    credit_limit: Number(c.credit_limit),
    debt: debts.get(c.id) ?? 0,
  }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-stone-500">
        <span>
          Caixa nº {session.id} aberto às {formatTime(session.opened_at)} · {profile.full_name || profile.email}
        </span>
        <span className="flex gap-3">
          <Link href="/caixa" className="hover:text-stone-900 hover:underline">
            Sangria / fechar caixa
          </Link>
          <Link href="/vendas" className="hover:text-stone-900 hover:underline">
            Vendas de hoje
          </Link>
        </span>
      </div>
      <Pdv
        products={pdvProducts}
        categories={categories}
        customers={customers}
        scale={{
          scale_prefix: settings.scale_prefix,
          scale_code_digits: settings.scale_code_digits,
          scale_value_kind: settings.scale_value_kind,
        }}
        maxDiscountPct={profile.role === "admin" ? 100 : Number(settings.max_discount_pct)}
      />
    </div>
  );
}
