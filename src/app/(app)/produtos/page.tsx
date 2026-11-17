import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadAllProducts, loadCategories } from "@/lib/queries";
import { canStock, formatMoney, formatPct, formatQty, normalize } from "@/lib/types";
import ProductImage from "@/components/product-image";

export const metadata: Metadata = { title: "Produtos" };

const LIMIT = 300;

export default async function ProductsPage({ searchParams }: PageProps<"/produtos">) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const manage = canStock(profile.role);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const secao = typeof sp.secao === "string" ? Number(sp.secao) : 0;
  const filtro = typeof sp.filtro === "string" ? sp.filtro : "";

  const [all, categories] = await Promise.all([loadAllProducts(supabase, false), loadCategories(supabase)]);
  const catOf = new Map(categories.map((c) => [c.id, c]));

  const words = normalize(q).split(/\s+/).filter(Boolean);
  const list = all.filter((p) => {
    if (filtro === "inativos" ? p.active : !p.active) return false;
    if (secao && p.category_id !== secao) return false;
    if (filtro === "baixo" && !(p.min_stock > 0 && Number(p.stock) <= Number(p.min_stock))) return false;
    if (filtro === "negativo" && !(Number(p.stock) < 0)) return false;
    if (filtro === "sem-foto" && p.image_path) return false;
    if (words.length && !(p.barcode === q || p.plu === q || words.every((w) => normalize(p.name).includes(w)))) return false;
    return true;
  });
  const low = all.filter((p) => p.active && p.min_stock > 0 && Number(p.stock) <= Number(p.min_stock)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Produtos</h1>
          <p className="text-sm text-stone-500">
            {all.filter((p) => p.active).length} ativos
            {low > 0 && (
              <>
                {" · "}
                <Link href="/produtos?filtro=baixo" className="font-medium text-amber-700 hover:underline">
                  {low} abaixo do mínimo
                </Link>
              </>
            )}
          </p>
        </div>
        {manage && (
          <div className="flex gap-2">
            <Link href="/produtos/etiquetas" className="btn-secondary">
              Etiquetas de preço
            </Link>
            <Link href="/produtos/novo" className="btn-primary">
              + Novo produto
            </Link>
          </div>
        )}
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="label">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Nome, código de barras ou PLU" />
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
        <div>
          <label htmlFor="filtro" className="label">
            Mostrar
          </label>
          <select id="filtro" name="filtro" defaultValue={filtro} className="input">
            <option value="">Ativos</option>
            <option value="baixo">Abaixo do mínimo</option>
            <option value="negativo">Estoque negativo</option>
            <option value="sem-foto">Sem foto</option>
            <option value="inativos">Desativados</option>
          </select>
        </div>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <div className="card overflow-x-auto">
        {list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">Nenhum produto encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Produto</th>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 text-right font-medium">Preço</th>
                {manage && <th className="px-4 py-2 text-right font-medium">Margem</th>}
                <th className="px-4 py-2 text-right font-medium">Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {list.slice(0, LIMIT).map((p) => {
                const cat = p.category_id ? catOf.get(p.category_id) : undefined;
                const stock = Number(p.stock);
                const lowStock = p.min_stock > 0 && stock <= Number(p.min_stock);
                const margin = Number(p.price) > 0 && Number(p.cost) > 0 ? ((p.price - p.cost) / p.price) * 100 : null;
                const name = (
                  <span className="flex items-center gap-3">
                    <ProductImage path={p.image_path} emoji={cat?.emoji} name={p.name} className="h-10 w-10 text-base" />
                    <span>
                      <span className="block font-medium text-stone-900">
                        {p.name} {p.favorite && <span title="Atalho no PDV">⭐</span>}
                      </span>
                      <span className="block text-xs text-stone-500">{cat?.name ?? "Sem seção"}</span>
                    </span>
                  </span>
                );
                return (
                  <tr key={p.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2">
                      {manage ? (
                        <Link href={`/produtos/${p.id}`} className="hover:underline">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-stone-600">
                      {p.barcode || "—"}
                      {p.plu && <span className="block">PLU {p.plu}</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatMoney(p.price)}
                      {p.unit === "kg" && <span className="text-xs font-normal text-stone-500">/kg</span>}
                    </td>
                    {manage && <td className={`px-4 py-2 text-right ${margin !== null && margin < 15 ? "text-amber-700" : ""}`}>{margin === null ? "—" : formatPct(margin)}</td>}
                    <td className={`px-4 py-2 text-right font-medium ${stock < 0 ? "text-red-700" : lowStock ? "text-amber-700" : "text-stone-900"}`}>
                      {formatQty(stock, p.unit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {list.length > LIMIT && (
          <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-500">
            Mostrando {LIMIT} de {list.length}. Use a busca para encontrar os demais.
          </p>
        )}
      </div>
    </div>
  );
}
