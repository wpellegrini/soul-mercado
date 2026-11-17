import { parseDecimal } from "@/lib/types";

export type FormState = { error?: string; ok?: string };

export function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function int(formData: FormData, key: string) {
  const n = Number(text(formData, key));
  return Number.isInteger(n) ? n : NaN;
}

/** Valor em reais: aceita "1.234,56", "1234,56" e "1234.56". */
export function money(formData: FormData, key: string) {
  const n = parseDecimal(text(formData, key));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Quantidade (até 3 casas, para kg). */
export function qty(formData: FormData, key: string) {
  const n = parseDecimal(text(formData, key));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
}

/** Mensagem amigável para os erros do banco. */
export function dbError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    if (error.message.includes("barcode")) return "Já existe um produto com este código de barras.";
    if (error.message.includes("plu")) return "Já existe um produto com este código curto (PLU).";
    return "Já existe um cadastro com esses dados.";
  }
  if (error.code === "23514") return "Algum valor está fora do permitido. Confira os campos.";
  if (error.code === "23503") return "Este cadastro está em uso e não pode ser apagado. Desative-o.";
  if (error.code === "42501") return "Você não tem permissão para fazer isso.";
  return error.message;
}
