import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStock } from "@/lib/auth";
import { loadCategories } from "@/lib/queries";
import { formatDateTime, formatQty, MOVEMENT_LABEL, type MovementKind, type Product, type Profile } from "@/lib/types";
import ProductForm from "../product-form";
import { updateProduct } from "../actions";

export const metadata: Metadata = { title: "Produto" };

type Movement = {
  id: number;
  kind: MovementKind;
  quantity: number;
  stock_after: number | null;
  reason: string;
  sale_id: number | null;
  created_by: string | null;
  created_at: string;
};

export default async function ProductPage({ params, searchParams }: PageProps<"/produtos/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await requireStock();
  const [{ data: product }, categories, { data: moves }, { data: people }] = await Promise.all([
    supabase.from("products").select("*").eq("id", Number(id)).maybeSingle<Product>(),
    loadCategories(supabase),
    supabase.from("stock_movements").select("*").eq("product_id", Number(id)).order("created_at", { ascending: false }).limit(40).returns<Movement[]>(),
    supabase.from("profiles").select("id, full_name, email").returns<Pick<Profile, "id" | "full_name" | "email">[]>(),
  ]);
  if (!product) notFound();
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/produtos" className="text-sm text-stone-500 hover:text-stone-900">
        ← Produtos
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{product.name}</h1>
          <p className="text-sm text-stone-500">
            Estoque atual: <strong className={Number(product.stock) < 0 ? "text-red-700" : "text-stone-900"}>{formatQty(product.stock, product.unit)}</strong>
          </p>
        </div>
        <Link href={`/estoque/ajuste?produto=${product.id}`} className="btn-secondary">
          Entrada, perda ou contagem
        </Link>
      </div>
      {sp.salvo === "1" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Produto cadastrado.</p>}

      <ProductForm action={updateProduct} product={product} categories={categories} />

      <section className="card">
        <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">Movimentações de estoque</h2>
        {!moves?.length ? (
          <p className="px-4 py-6 text-sm text-stone-500">Nenhuma movimentação ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {moves.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  <span className="text-stone-500">{formatDateTime(m.created_at)}</span> · {MOVEMENT_LABEL[m.kind]}
                  {m.sale_id && (
                    <Link href={`/vendas/${m.sale_id}`} className="ml-1 text-brand-600 hover:underline">
                      #{m.sale_id}
                    </Link>
                  )}
                  {m.reason && !m.sale_id && <span className="text-stone-500"> — {m.reason}</span>}
                  {m.created_by && <span className="text-xs text-stone-400"> · {nameOf.get(m.created_by)}</span>}
                </span>
                <span className="flex gap-4">
                  <strong className={m.quantity < 0 ? "text-red-700" : "text-emerald-700"}>
                    {m.quantity > 0 ? "+" : ""}
                    {formatQty(m.quantity, product.unit)}
                  </strong>
                  <span className="w-24 text-right text-stone-500">{m.stock_after === null ? "" : `= ${formatQty(m.stock_after, product.unit)}`}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
