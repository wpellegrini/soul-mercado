"use client";

import { useActionState, useState } from "react";
import { formatPct, parseDecimal, type Category, type Product } from "@/lib/types";
import type { FormState } from "@/lib/form";
import ImageUpload from "@/components/image-upload";
import CameraScanner from "@/components/camera-scanner";

export default function ProductForm({
  action,
  product,
  categories,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  product?: Product;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [price, setPrice] = useState(product ? String(product.price).replace(".", ",") : "");
  const [cost, setCost] = useState(product?.cost ? String(product.cost).replace(".", ",") : "");
  const [unit, setUnit] = useState(product?.unit ?? "un");
  const [categoryId, setCategoryId] = useState(product?.category_id ? String(product.category_id) : "");

  const p = parseDecimal(price);
  const c = parseDecimal(cost);
  const margin = p > 0 && c >= 0 ? ((p - c) / p) * 100 : null;
  const markup = c > 0 && p > 0 ? ((p - c) / c) * 100 : null;
  const emoji = categories.find((x) => String(x.id) === categoryId)?.emoji ?? "🛒";

  return (
    <form action={formAction} className="space-y-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      <fieldset disabled={pending} className="contents">
        <section className="card space-y-4 p-5">
          <ImageUpload initialPath={product?.image_path ?? ""} emoji={emoji} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="label">
                Nome do produto
              </label>
              <input id="name" name="name" defaultValue={product?.name} className="input" required maxLength={120} placeholder="ex.: Leite integral 1L" />
            </div>
            <div>
              <label htmlFor="barcode" className="label">
                Código de barras (EAN)
              </label>
              <div className="flex gap-2">
                <input
                  id="barcode"
                  name="barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="input font-mono"
                  placeholder="Bipe aqui com o leitor"
                  maxLength={14}
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} // o leitor aperta Enter no fim
                />
              </div>
              <div className="mt-2">
                <CameraScanner onCode={(c) => setBarcode(c.replace(/\D/g, ""))} />
              </div>
            </div>
            <div>
              <label htmlFor="plu" className="label">
                Código curto / balança (PLU)
              </label>
              <input id="plu" name="plu" defaultValue={product?.plu} inputMode="numeric" className="input font-mono" placeholder="ex.: 0001" maxLength={6} />
              <p className="mt-1 text-xs text-stone-500">Para pães, frios e itens pesados: o mesmo código cadastrado na balança.</p>
            </div>
            <div>
              <label htmlFor="category_id" className="label">
                Seção
              </label>
              <select id="category_id" name="category_id" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
                <option value="">Sem seção</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">Vendido por</span>
              <div className="flex gap-2">
                {(["un", "kg"] as const).map((u) => (
                  <label key={u} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${unit === u ? "border-brand-600 bg-brand-50" : "border-stone-300"}`}>
                    <input type="radio" name="unit" value={u} checked={unit === u} onChange={() => setUnit(u)} className="sr-only" />
                    {u === "un" ? "Unidade" : "Peso (kg)"}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="card grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <label htmlFor="price" className="label">
              Preço de venda (R${unit === "kg" ? "/kg" : ""})
            </label>
            <input id="price" name="price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="input" required />
          </div>
          <div>
            <label htmlFor="cost" className="label">
              Custo (R${unit === "kg" ? "/kg" : ""})
            </label>
            <input id="cost" name="cost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="input" placeholder="0,00" />
          </div>
          <div className="rounded-md bg-stone-50 px-3 py-2 text-sm">
            <div className="text-xs text-stone-500">Margem sobre a venda</div>
            <div className={`text-lg font-semibold ${margin !== null && margin < 15 ? "text-amber-700" : "text-stone-900"}`}>{margin === null ? "—" : formatPct(margin)}</div>
            {markup !== null && <div className="text-xs text-stone-500">markup {formatPct(markup)}</div>}
          </div>
          <div>
            <label htmlFor="min_stock" className="label">
              Estoque mínimo
            </label>
            <input id="min_stock" name="min_stock" defaultValue={product ? String(product.min_stock).replace(".", ",") : ""} inputMode="decimal" className="input" placeholder="0" />
            <p className="mt-1 text-xs text-stone-500">Abaixo disso, entra na lista de compras.</p>
          </div>
          {!product && (
            <div>
              <label htmlFor="initial_stock" className="label">
                Estoque inicial
              </label>
              <input id="initial_stock" name="initial_stock" inputMode="decimal" className="input" placeholder="0" />
            </div>
          )}
          <div className="space-y-2 self-end text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="favorite" defaultChecked={product?.favorite} className="h-4 w-4" />
              Atalho com foto no PDV
            </label>
            {product && (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="active" defaultChecked={product.active} className="h-4 w-4" />
                Ativo (aparece no PDV)
              </label>
            )}
          </div>
        </section>

        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.ok && !pending && (
          <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {state.ok}
          </p>
        )}
        <div className="flex justify-end">
          <button className="btn-primary px-6">{pending ? "Salvando..." : product ? "Salvar alterações" : "Cadastrar produto"}</button>
        </div>
      </fieldset>
    </form>
  );
}
