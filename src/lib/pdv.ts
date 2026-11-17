// Regras do PDV que não dependem da tela (testadas em scripts/test-lib.mjs).
import { parseScaleBarcode, samePlu, type ScaleConfig } from "./barcode";
import { normalize, parseDecimal, round2, type Unit } from "./types";

export type LookupProduct = {
  id: number;
  name: string;
  barcode: string;
  plu: string;
  unit: Unit;
  price: number;
};

/** "3*7891234..." ou "3x7891234..." → multiplica a quantidade. "0,350*0001" → 350 g. */
export function parseInput(raw: string) {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/);
  if (!m) return { multiplier: null as number | null, code: raw.trim() };
  const n = parseDecimal(m[1]);
  return { multiplier: n > 0 ? n : null, code: m[2].trim() };
}

export type Resolved<P extends LookupProduct> =
  | { kind: "product"; product: P; quantity: number | null; labelTotal: number | null }
  | { kind: "search"; results: P[] }
  | { kind: "notfound"; code: string };

/**
 * Descobre o produto pelo que foi bipado/digitado:
 * 1) código de barras exato  2) etiqueta da balança  3) código curto (PLU)  4) busca pelo nome.
 * quantity = null em produto por kg significa "perguntar o peso".
 */
export function resolveCode<P extends LookupProduct>(raw: string, products: P[], scale: ScaleConfig): Resolved<P> {
  const { multiplier, code } = parseInput(raw);
  if (!code) return { kind: "notfound", code };

  if (/^\d+$/.test(code)) {
    const byBarcode = products.find((p) => p.barcode === code);
    if (byBarcode) return { kind: "product", product: byBarcode, quantity: multiplier ?? defaultQty(byBarcode), labelTotal: null };

    const label = parseScaleBarcode(code, scale);
    if (label) {
      const p = products.find((x) => samePlu(x.plu, label.plu));
      if (p) {
        if (label.total !== null) {
          // Etiqueta com o preço: o peso é calculado só para o estoque
          const weight = p.price > 0 ? Math.round((label.total / p.price) * 1000) / 1000 : 0.001;
          return { kind: "product", product: p, quantity: Math.max(weight, 0.001), labelTotal: label.total };
        }
        return { kind: "product", product: p, quantity: label.weight, labelTotal: null };
      }
      return { kind: "notfound", code };
    }

    if (code.length <= 6) {
      const byPlu = products.find((p) => samePlu(p.plu, code));
      if (byPlu) return { kind: "product", product: byPlu, quantity: multiplier ?? defaultQty(byPlu), labelTotal: null };
    }
    return { kind: "notfound", code };
  }

  const results = searchProducts(code, products);
  if (results.length === 1) {
    return { kind: "product", product: results[0], quantity: multiplier ?? defaultQty(results[0]), labelTotal: null };
  }
  return results.length ? { kind: "search", results } : { kind: "notfound", code };
}

function defaultQty(p: LookupProduct) {
  return p.unit === "un" ? 1 : null;
}

/** Busca por partes do nome, sem acento: "pao fra" acha "Pão francês". */
export function searchProducts<P extends LookupProduct>(term: string, products: P[], limit = 24) {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return products.filter((p) => words.every((w) => normalize(p.name).includes(w))).slice(0, limit);
}

export function lineTotal(unit: Unit, price: number, quantity: number, labelTotal: number | null) {
  if (unit === "kg" && labelTotal !== null) return round2(labelTotal);
  return round2(quantity * price);
}

/**
 * Peso digitado no PDV, em kg: "0,350" = 350 g; "350" (inteiro a partir de 10) = 350 g; "1,2" = 1,2 kg.
 */
export function parseWeight(raw: string) {
  const s = raw.trim();
  if (!s) return NaN;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= 10 ? n / 1000 : n;
  }
  const n = parseDecimal(s);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
}

/** Notas para o troco rápido: valor exato e as próximas notas acima do total. */
export function cashSuggestions(amount: number) {
  const notes = [2, 5, 10, 20, 50, 100, 200];
  const out = new Set<number>([round2(amount)]);
  for (const n of notes) {
    const v = Math.ceil(amount / n) * n;
    if (v > amount) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}
