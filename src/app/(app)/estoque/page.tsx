import type { Metadata } from "next";
import { getSettings, requireStock } from "@/lib/auth";
import { loadAllProducts } from "@/lib/queries";
import EntryForm, { type EntryProduct } from "./entry-form";

export const metadata: Metadata = { title: "Entrada de mercadoria" };

export default async function StockEntryPage() {
  const { supabase } = await requireStock();
  const settings = await getSettings();
  const products: EntryProduct[] = (await loadAllProducts(supabase)).map((p) => ({
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    plu: p.plu,
    unit: p.unit,
    price: Number(p.price),
    cost: Number(p.cost),
    stock: Number(p.stock),
  }));
  return (
    <EntryForm
      products={products}
      scale={{ scale_prefix: settings.scale_prefix, scale_code_digits: settings.scale_code_digits, scale_value_kind: settings.scale_value_kind }}
    />
  );
}
