import type { Metadata } from "next";
import Link from "next/link";
import { requireStock } from "@/lib/auth";
import { loadCategories } from "@/lib/queries";
import ProductForm from "../product-form";
import { createProduct } from "../actions";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  const { supabase } = await requireStock();
  const categories = await loadCategories(supabase);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/produtos" className="text-sm text-stone-500 hover:text-stone-900">
        ← Produtos
      </Link>
      <h1 className="text-2xl font-semibold text-stone-900">Novo produto</h1>
      <ProductForm action={createProduct} categories={categories} />
    </div>
  );
}
