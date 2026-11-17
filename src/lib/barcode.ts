// Códigos de barras: EAN-13/EAN-8, etiquetas de balança e desenho do código.

/** Dígito verificador EAN (serve para EAN-8, EAN-13 e GTIN-14). */
export function eanCheckDigit(body: string) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidEan(code: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  return eanCheckDigit(code.slice(0, -1)) === code.slice(-1);
}

export type ScaleConfig = {
  scale_prefix: string;
  scale_code_digits: number;
  scale_value_kind: "preco" | "peso";
};

/**
 * Etiqueta da balança (EAN-13): prefixo + código do produto + valor + dígito.
 * Ex.: prefixo "2", código com 4 dígitos, valor em preço:
 *   2 0001 0001690 9  →  produto 0001, R$ 16,90
 */
export function parseScaleBarcode(code: string, cfg: ScaleConfig) {
  if (!/^\d{13}$/.test(code) || !code.startsWith(cfg.scale_prefix) || !isValidEan(code)) return null;
  const start = cfg.scale_prefix.length;
  const plu = code.slice(start, start + cfg.scale_code_digits);
  const value = Number(code.slice(start + cfg.scale_code_digits, 12));
  if (!plu || !Number.isFinite(value)) return null;
  return cfg.scale_value_kind === "preco"
    ? { plu, total: value / 100, weight: null as number | null }
    : { plu, total: null as number | null, weight: value / 1000 };
}

/** Compara códigos curtos ignorando zeros à esquerda ("0001" = "1"). */
export function samePlu(a: string, b: string) {
  return a !== "" && b !== "" && Number(a) === Number(b);
}

// ---------- Desenho do EAN-13 (etiquetas de gôndola) ----------
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Sequência de barras (1 = preta) de um EAN-13 válido, ou null. */
export function ean13Bits(code: string) {
  if (!/^\d{13}$/.test(code) || !isValidEan(code)) return null;
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += "101";
  return bits;
}
