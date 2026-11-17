import type { Metadata } from "next";
import Link from "next/link";
import { getSettings, requireStock } from "@/lib/auth";
import { loadAllProducts, loadCategories } from "@/lib/queries";
import { addDays, dayStart, formatMoney, normalize, todayISO } from "@/lib/types";
import BarcodeSvg from "@/components/barcode-svg";
import PrintButton from "@/components/print-button";

export const metadata: Metadata = { title: "Etiquetas de preço" };

/** Etiquetas de gôndola para imprimir em folha A4 (recortar). */
export default async function LabelsPage({ searchParams }: PageProps<"/produtos/etiquetas">) {
  const sp = await searchParams;
  const { supabase } = await requireStock();
  const settings = await getSettings();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const secao = typeof sp.secao === "string" ? Number(sp.secao) : 0;
  const recentes = sp.recentes === "1";

  const [products, categories] = await Promise.all([loadAllProducts(supabase), loadCategories(supabase)]);
  const since = dayStart(addDays(todayISO(), -7));
  const words = normalize(q).split(/\s+/).filter(Boolean);
  const list = products
    .filter((p) => (!secao || p.category_id === secao) && (!recentes || new Date(p.price_updated_at) >= new Date(since)))
    .filter((p) => !words.length || words.every((w) => normalize(p.name).includes(w)))
    .slice(0, 120);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/produtos" className="text-sm text-stone-500 hover:text-stone-900">
          ← Produtos
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold text-stone-900">Etiquetas de preço</h1>
          <PrintButton label={`Imprimir ${list.length} etiquetas`} />
        </div>
        <form className="card mt-4 flex flex-wrap items-end gap-3 p-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="label">
              Nome
            </label>
            <input id="q" name="q" defaultValue={q} className="input" />
          </div>
          <div>
            <label htmlFor="secao" className="label">
              Seção
            </label>
            <select id="secao" name="secao" defaultValue={secao || ""} className="input">
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="recentes" value="1" defaultChecked={recentes} className="h-4 w-4" />
            Só com preço alterado nos últimos 7 dias
          </label>
          <button className="btn-secondary">Filtrar</button>
        </form>
      </div>

      {list.length === 0 ? (
        <p className="card p-6 text-sm text-stone-500">Nenhum produto com esse filtro.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {list.map((p) => (
            <div key={p.id} className="break-inside-avoid rounded border border-dashed border-stone-400 bg-white p-3 print:p-2">
              <div className="text-[10px] uppercase tracking-wide text-stone-500">{settings.store_name}</div>
              <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-tight text-black">{p.name}</div>
              <div className="mt-1 text-3xl font-bold text-black">
                {formatMoney(p.price)}
                <span className="text-sm font-medium">{p.unit === "kg" ? "/kg" : ""}</span>
              </div>
              <div className="mt-1">{p.barcode ? <BarcodeSvg code={p.barcode} height={32} /> : p.plu && <div className="font-mono text-xs">Cód. {p.plu}</div>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
