import type { Metadata } from "next";
import { getSettings, requireStock } from "@/lib/auth";
import { loadAllProducts } from "@/lib/queries";
import AdjustForm from "./adjust-form";

export const metadata: Metadata = { title: "Perda e contagem" };

export default async function AdjustPage({ searchParams }: PageProps<"/estoque/ajuste">) {
  const sp = await searchParams;
  const { supabase } = await requireStock();
  const settings = await getSettings();
  const products = (await loadAllProducts(supabase)).map((p) => ({
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    plu: p.plu,
    unit: p.unit,
    price: Number(p.price),
    stock: Number(p.stock),
  }));
  const initialId = typeof sp.produto === "string" ? Number(sp.produto) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm text-stone-500">
        <strong>Perda</strong>: vencido, quebrado, consumo interno. <strong>Contagem</strong>: informe quanto há na prateleira e o
        sistema corrige a diferença (inventário). <strong>Entrada avulsa</strong>: chegada sem nota.
      </p>
      <AdjustForm
        products={products}
        initialId={initialId}
        scale={{ scale_prefix: settings.scale_prefix, scale_code_digits: settings.scale_code_digits, scale_value_kind: settings.scale_value_kind }}
      />
    </div>
  );
}
