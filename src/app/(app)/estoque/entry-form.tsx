"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ScaleConfig } from "@/lib/barcode";
import { resolveCode, searchProducts } from "@/lib/pdv";
import { formatMoney, formatPct, formatQty, parseDecimal, round2, type Unit } from "@/lib/types";
import CameraScanner from "@/components/camera-scanner";
import { receiveGoods } from "./actions";

export type EntryProduct = { id: number; name: string; barcode: string; plu: string; unit: Unit; price: number; cost: number; stock: number };

type Line = { product: EntryProduct; quantity: string; cost: string; price: string };

const fmt = (n: number) => (n ? String(n).replace(".", ",") : "");

export default function EntryForm({ products, scale }: { products: EntryProduct[]; scale: ScaleConfig }) {
  const [state, action, pending] = useActionState(receiveGoods, {});
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  // Depois de lançar, limpa a lista
  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => setLines([]), 0);
      return () => clearTimeout(t);
    }
  }, [state]);

  function add(p: EntryProduct) {
    setNotice("");
    setCode("");
    const i = lines.findIndex((l) => l.product.id === p.id);
    if (i >= 0) {
      // Bipou de novo: soma 1 (útil para conferir caixa a caixa)
      const q = parseDecimal(lines[i].quantity || "0") + 1;
      setLines(lines.map((l, j) => (j === i ? { ...l, quantity: fmt(q) } : l)));
    } else {
      setLines([...lines, { product: p, quantity: p.unit === "un" ? "1" : "", cost: fmt(p.cost), price: "" }]);
    }
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  function lookup(raw: string) {
    const r = resolveCode(raw, products, scale);
    if (r.kind === "product") add(r.product);
    else if (r.kind === "notfound") setNotice(`Código ${raw} não cadastrado.`);
  }

  const suggestions = code.trim().length >= 2 && !/^\d+$/.test(code.trim()) ? searchProducts(code, products, 8) : [];
  const payload = lines.map((l) => ({
    product_id: l.product.id,
    quantity: Math.round(parseDecimal(l.quantity) * 1000) / 1000,
    unit_cost: l.cost.trim() ? round2(parseDecimal(l.cost)) : null,
    new_price: l.price.trim() ? round2(parseDecimal(l.price)) : null,
  }));
  const total = payload.reduce((s, l) => s + (l.quantity > 0 && l.unit_cost ? l.quantity * l.unit_cost : 0), 0);
  const invalid = payload.some((l) => !(l.quantity > 0));

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Bipe os produtos que chegaram (ou digite o nome), informe quantidade e custo da nota. O custo atualiza o cadastro e a margem.
      </p>

      <div className="card space-y-2 p-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) lookup(code.trim());
          }}
        >
          <label htmlFor="entry-code" className="sr-only">
            Código ou nome
          </label>
          <input id="entry-code" ref={codeRef} value={code} onChange={(e) => setCode(e.target.value)} className="input h-11 min-w-60 flex-1" placeholder="Bipe o código de barras ou digite o nome" autoFocus autoComplete="off" />
          <button className="btn-secondary">Adicionar</button>
          <CameraScanner onCode={lookup} label="Câmera" />
        </form>
        {notice && (
          <p className="text-sm text-amber-800">
            {notice}{" "}
            <Link href="/produtos/novo" className="underline">
              Cadastrar produto
            </Link>
          </p>
        )}
        {suggestions.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button type="button" className="rounded-full bg-stone-100 px-3 py-1 text-sm hover:bg-stone-200" onClick={() => add(p)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="lines" value={JSON.stringify(payload)} />
        <div className="card overflow-x-auto">
          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-500">Nenhum produto na entrada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 font-medium">Quantidade</th>
                  <th className="px-3 py-2 font-medium">Custo unit. (R$)</th>
                  <th className="px-3 py-2 font-medium">Novo preço de venda</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lines.map((l, i) => {
                  const cost = parseDecimal(l.cost);
                  const price = l.price.trim() ? parseDecimal(l.price) : l.product.price;
                  const margin = price > 0 && cost >= 0 ? ((price - cost) / price) * 100 : null;
                  const set = (patch: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={l.product.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-stone-900">{l.product.name}</div>
                        <div className="text-xs text-stone-500">
                          Estoque {formatQty(l.product.stock, l.product.unit)} · venda {formatMoney(l.product.price)} · custo anterior {formatMoney(l.product.cost)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input aria-label={`Quantidade de ${l.product.name}`} value={l.quantity} onChange={(e) => set({ quantity: e.target.value })} inputMode="decimal" className="input w-24" placeholder={l.product.unit === "kg" ? "kg" : "un"} />
                      </td>
                      <td className="px-3 py-2">
                        <input aria-label={`Custo de ${l.product.name}`} value={l.cost} onChange={(e) => set({ cost: e.target.value })} inputMode="decimal" className="input w-28" />
                      </td>
                      <td className="px-3 py-2">
                        <input aria-label={`Novo preço de ${l.product.name}`} value={l.price} onChange={(e) => set({ price: e.target.value })} inputMode="decimal" className="input w-28" placeholder="manter" />
                        {margin !== null && Number.isFinite(margin) && (
                          <div className={`mt-0.5 text-xs ${margin < 15 ? "text-amber-700" : "text-stone-500"}`}>margem {formatPct(margin)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" className="text-stone-400 hover:text-red-700" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Remover ${l.product.name}`}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card grid gap-3 p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div>
            <label htmlFor="supplier" className="label">
              Fornecedor
            </label>
            <input id="supplier" name="supplier" className="input" placeholder="ex.: Distribuidora Central" />
          </div>
          <div>
            <label htmlFor="invoice" className="label">
              Nº da nota
            </label>
            <input id="invoice" name="invoice" className="input" />
          </div>
          <div className="text-right">
            <div className="text-xs text-stone-500">Total da nota (custo)</div>
            <div className="text-lg font-semibold">{formatMoney(total)}</div>
          </div>
        </div>

        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.ok && !pending && lines.length === 0 && (
          <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {state.ok}
          </p>
        )}
        <div className="flex justify-end">
          <button className="btn-primary px-6" disabled={pending || !lines.length || invalid}>
            {pending ? "Lançando..." : "Lançar entrada no estoque"}
          </button>
        </div>
      </form>
    </div>
  );
}
