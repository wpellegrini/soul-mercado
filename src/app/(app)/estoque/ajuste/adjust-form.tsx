"use client";

import { useActionState, useState } from "react";
import type { ScaleConfig } from "@/lib/barcode";
import { resolveCode, searchProducts } from "@/lib/pdv";
import { formatQty, type Unit } from "@/lib/types";
import CameraScanner from "@/components/camera-scanner";
import { adjustStock } from "../actions";

type P = { id: number; name: string; barcode: string; plu: string; unit: Unit; price: number; stock: number };

const KINDS = [
  { value: "perda", label: "Perda", hint: "Quantidade que saiu" },
  { value: "contagem", label: "Contagem", hint: "Quantidade contada na loja" },
  { value: "entrada", label: "Entrada avulsa", hint: "Quantidade que entrou" },
] as const;

export default function AdjustForm({ products, initialId, scale }: { products: P[]; initialId: number | null; scale: ScaleConfig }) {
  const [state, action, pending] = useActionState(adjustStock, {});
  const [selectedId, setSelectedId] = useState<number | null>(initialId);
  // Sempre do cadastro atualizado: depois de salvar, o estoque mostrado já vem novo
  const selected = products.find((p) => p.id === selectedId) ?? null;
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("perda");
  const [notFound, setNotFound] = useState("");

  const results = term.trim().length >= 2 && !/^\d+$/.test(term.trim()) ? searchProducts(term, products, 8) : [];

  function choose(raw: string) {
    const r = resolveCode(raw, products, scale);
    if (r.kind === "product") {
      setSelectedId(r.product.id);
      setTerm("");
      setNotFound("");
    } else if (r.kind === "notfound") setNotFound(`Código ${raw} não cadastrado.`);
  }

  return (
    <div className="card space-y-5 p-5">
      <div>
        <label htmlFor="adj-term" className="label">
          Produto
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="adj-term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (term.trim()) choose(term.trim());
              }
            }}
            className="input min-w-60 flex-1"
            placeholder="Bipe o código ou digite o nome"
            autoComplete="off"
            autoFocus={!selected}
          />
          <CameraScanner onCode={choose} label="Câmera" />
        </div>
        {notFound && <p className="mt-1 text-sm text-amber-800">{notFound}</p>}
        {results.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="rounded-full bg-stone-100 px-3 py-1 text-sm hover:bg-stone-200"
                  onClick={() => {
                    setSelectedId(p.id);
                    setTerm("");
                  }}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <form action={action} className="space-y-4" key={selected.id}>
          <input type="hidden" name="product_id" value={selected.id} />
          <div className="rounded-md bg-stone-50 px-4 py-3">
            <div className="font-semibold text-stone-900">{selected.name}</div>
            <div className="text-sm text-stone-600">Estoque no sistema: {formatQty(selected.stock, selected.unit)}</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <label key={k.value} className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium ${kind === k.value ? "border-brand-600 bg-brand-50" : "border-stone-300"}`}>
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                {k.label}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="quantity" className="label">
                {KINDS.find((k) => k.value === kind)?.hint} ({selected.unit})
              </label>
              <input id="quantity" name="quantity" inputMode="decimal" className="input" required />
            </div>
            <div>
              <label htmlFor="reason" className="label">
                Motivo / observação
              </label>
              <input id="reason" name="reason" className="input" placeholder={kind === "perda" ? "ex.: vencido" : kind === "contagem" ? "ex.: inventário mensal" : "opcional"} />
            </div>
          </div>
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
          <button className="btn-primary" disabled={pending}>
            {pending ? "Salvando..." : "Registrar"}
          </button>
        </form>
      )}
    </div>
  );
}
